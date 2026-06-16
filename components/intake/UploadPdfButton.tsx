/**
 * UploadPdfButton — drag-and-drop / file-picker intake for live TTB
 * COLA PDFs (P5-8). The headline demo control on Operations.
 *
 * For each selected PDF, in the BROWSER:
 *   1. Extract page-1 text via pdfjs-dist → regex form fields.
 *   2. Render the label page to a PNG.
 *   3. Assemble the /api/batch per-application payload.
 *
 * POSTs all files in one batch, polls /api/batch/<jobId>, and pipes
 * each completed item into the QueueProvider via
 * `appendVerifiedApplications`. The operator stays on Operations; the
 * funnel, Match approval pool, Review distribution board, and Live
 * feed all update in place as items grade.
 *
 * Vercel-safe by construction: the server never touches a PDF.
 */

"use client";

import React, { useState } from "react";

import { beverageFromClass } from "@/lib/intake/beverageFromClass";
import { processPdf } from "@/lib/intake/clientPdf";
import { parseColaForm } from "@/lib/intake/parseColaForm";
import { useQueue, type QueueApplicationInput } from "@/lib/queue/QueueProvider";
import type { SampleForm } from "@/fixtures/samples";
import type { VerificationResult } from "@/types";

type ProgressItem = {
  fileName: string;
  applicationId?: string;
  status: "parsing" | "submitted" | "grading" | "done" | "failed";
  detail?: string;
};

type ApplicationPayload = {
  applicationId: string;
  fileName: string;
  beverageType: ReturnType<typeof beverageFromClass>;
  form: SampleForm;
  labelPngBase64: string;
};

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

function applicationIdFromName(name: string): string {
  const stem = name.replace(/\.pdf$/i, "");
  const normalized = stem
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics ("Bärenjäger" → "Barenjager")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(0, 64) || `upload-${Date.now()}`;
}

function fallbackForm(rawForm: Partial<SampleForm>): SampleForm {
  return {
    brandName: rawForm.brandName || "Unknown brand",
    fancifulName: rawForm.fancifulName,
    classType: rawForm.classType || "UNKNOWN",
    alcoholContent: rawForm.alcoholContent || "0%",
    netContents: rawForm.netContents || "0 ML",
    producerName: rawForm.producerName || "Unknown producer",
    producerAddress: rawForm.producerAddress || "Unknown address",
    countryOfOrigin: rawForm.countryOfOrigin || "Unknown",
  };
}

/**
 * Build a QueueApplicationInput from a verify response + the
 * original payload. We keep the rendered label image as a data:
 * URL so the queue + review surfaces can render it without another
 * network hop.
 */
function buildQueueInput(
  payload: ApplicationPayload,
  result: VerificationResult,
): QueueApplicationInput {
  return {
    applicationId: payload.applicationId,
    brand: payload.form.brandName,
    beverageType: payload.beverageType,
    faces: [
      {
        kind: "front",
        previewUrl: `data:image/png;base64,${payload.labelPngBase64}`,
      },
    ],
    verification: result,
  };
}

export function UploadPdfButton(): React.ReactElement {
  const { appendVerifiedApplications } = useQueue();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function updateProgressByAppId(
    applicationId: string,
    patch: Partial<ProgressItem>,
  ): void {
    setProgress((prev) =>
      prev.map((p) => (p.applicationId === applicationId ? { ...p, ...patch } : p)),
    );
  }

  /**
   * Verify one application via the synchronous /api/verify endpoint.
   * Returns null on any failure (caller updates progress).
   */
  async function verifyOne(
    payload: ApplicationPayload,
  ): Promise<VerificationResult | null> {
    try {
      updateProgressByAppId(payload.applicationId, {
        status: "grading",
        detail: "extracting label…",
      });
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationId: payload.applicationId,
          beverageType: payload.beverageType,
          form: payload.form,
          faces: [
            {
              kind: "front",
              bytes: payload.labelPngBase64,
              mime: "image/png",
            },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        updateProgressByAppId(payload.applicationId, {
          status: "failed",
          detail: `verify ${res.status}${t ? `: ${t.slice(0, 120)}` : ""}`,
        });
        return null;
      }
      const result = (await res.json()) as VerificationResult;
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown verify error";
      updateProgressByAppId(payload.applicationId, {
        status: "failed",
        detail: msg,
      });
      return null;
    }
  }

  /**
   * Bounded-concurrency runner so dropping 20 PDFs doesn't fan out
   * 20 simultaneous Anthropic calls. Matches the server-side
   * orchestrator's concurrency=5 from config/batch.json.
   */
  async function verifyAll(payloads: ReadonlyArray<ApplicationPayload>): Promise<void> {
    const concurrency = 5;
    let idx = 0;
    async function worker(): Promise<void> {
      while (true) {
        const myIdx = idx++;
        if (myIdx >= payloads.length) return;
        const payload = payloads[myIdx]!;
        const result = await verifyOne(payload);
        if (result === null) continue;
        const input = buildQueueInput(payload, result);
        appendVerifiedApplications([input]);
        updateProgressByAppId(payload.applicationId, {
          status: "done",
          detail: `lane=${result.lane}`,
        });
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, payloads.length) }, worker);
    await Promise.all(workers);
  }

  async function processFiles(files: ReadonlyArray<File>): Promise<void> {
    setPending(true);
    setError(null);
    setProgress(files.map((f) => ({ fileName: f.name, status: "parsing" })));

    const ready: ApplicationPayload[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      try {
        if (!/\.pdf$/i.test(file.name)) {
          setProgress((p) =>
            p.map((it, idx) =>
              idx === i ? { ...it, status: "failed", detail: "Not a PDF" } : it,
            ),
          );
          continue;
        }
        const buf = await fileToArrayBuffer(file);
        const processed = await processPdf(buf);
        const { form: parsedForm, missing } = parseColaForm(processed.page1Text);
        const labelPng = processed.labelPng;

        const form = fallbackForm(parsedForm);
        const beverageType = beverageFromClass(form.classType);
        const applicationId = applicationIdFromName(file.name);

        ready.push({
          applicationId,
          fileName: file.name,
          beverageType,
          form,
          labelPngBase64: labelPng.base64,
        });

        setProgress((p) =>
          p.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  applicationId,
                  status: "submitted",
                  detail:
                    missing.length > 0
                      ? `parsed (${missing.length} fields blank)`
                      : `parsed`,
                }
              : it,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown parse error";
        setProgress((p) =>
          p.map((it, idx) =>
            idx === i ? { ...it, status: "failed", detail: msg } : it,
          ),
        );
      }
    }

    if (ready.length === 0) {
      setError("No valid PDFs to submit.");
      setPending(false);
      return;
    }

    try {
      await verifyAll(ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  function onFilesChosen(filesLike: FileList | null): void {
    if (!filesLike || filesLike.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < filesLike.length; i++) {
      const f = filesLike.item(i);
      if (f) files.push(f);
    }
    void processFiles(files);
  }

  function onDrop(ev: React.DragEvent<HTMLDivElement>): void {
    ev.preventDefault();
    setDragOver(false);
    if (pending) return;
    onFilesChosen(ev.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!pending) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 bg-slate-50"
        } ${pending ? "opacity-60" : ""}`}
      >
        <p className="text-sm font-semibold text-slate-800">
          Drop TTB COLA PDFs here
        </p>
        <p className="text-xs text-slate-600">
          Parsed + rendered in your browser. Verdicts flow into the Match
          approval pool or the Review distribution board below.
        </p>
        <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border border-indigo-700 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-within:ring-2 focus-within:ring-indigo-300">
          <span aria-hidden="true">↑</span>
          <span>Choose PDFs</span>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf"
            disabled={pending}
            className="sr-only"
            onChange={(e) => onFilesChosen(e.target.files)}
          />
        </label>
      </div>

      {progress.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {progress.map((p, idx) => (
            <li
              key={`${p.fileName}-${idx}`}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden="true"
                className={
                  p.status === "done"
                    ? "text-emerald-700"
                    : p.status === "failed"
                      ? "text-rose-700"
                      : "text-slate-500"
                }
              >
                {p.status === "done"
                  ? "✓"
                  : p.status === "failed"
                    ? "✕"
                    : "…"}
              </span>
              <span className="flex-1 truncate text-slate-700">{p.fileName}</span>
              <span className="text-slate-500">
                {p.detail ?? p.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error !== null && (
        <p
          role="alert"
          className="inline-flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="font-bold">✕</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
