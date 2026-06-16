/**
 * UploadPdfButton — drag-and-drop / file-picker intake for live TTB
 * COLA PDFs (P5-8). The headline demo control.
 *
 * For each selected PDF, in the BROWSER:
 *   1. Extract page-1 text via pdfjs-dist → regex form fields.
 *   2. Render the label page (3+ if present, else 1) to a PNG.
 *   3. Assemble the /api/batch per-application payload.
 *
 * Then POSTs the full payload (all selected files in one batch) and
 * redirects to /batch/[jobId], the existing P3-1 results view.
 *
 * Vercel-safe by construction: the server never touches a PDF.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { beverageFromClass } from "@/lib/intake/beverageFromClass";
import { processPdf } from "@/lib/intake/clientPdf";
import { parseColaForm } from "@/lib/intake/parseColaForm";
import type { SampleForm } from "@/fixtures/samples";

type ProgressItem = {
  fileName: string;
  status: "parsing" | "ready" | "failed";
  detail?: string;
};

type ApplicationPayload = {
  applicationId: string;
  beverageType: ReturnType<typeof beverageFromClass>;
  form: SampleForm;
  faces: Array<{ kind: "front"; bytes: string; mime: "image/png" }>;
};

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

function applicationIdFromName(name: string): string {
  const stem = name.replace(/\.pdf$/i, "");
  return stem.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64) || `upload-${Date.now()}`;
}

/**
 * Provide non-empty defaults for every required field so server-side
 * validation accepts the submission. When a field couldn't be parsed
 * from the PDF, the matcher will compare the placeholder against the
 * label and produce a mismatch — which is the correct outcome and
 * surfaces cleanly in the review detail.
 */
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

export function UploadPdfButton(): React.ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
          beverageType,
          form,
          faces: [
            { kind: "front", bytes: labelPng.base64, mime: "image/png" },
          ],
        });

        setProgress((p) =>
          p.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "ready",
                  detail:
                    missing.length > 0
                      ? `parsed (${missing.length} fields blank — will mismatch)`
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
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applications: ready }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Batch create failed (${res.status})${t ? `: ${t.slice(0, 200)}` : ""}`);
      }
      const body = (await res.json()) as { jobId: string };
      if (!body.jobId) throw new Error("Batch create returned no jobId");
      router.push(`/batch/${body.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
          or choose files — PDFs are parsed and rendered in your browser; the
          server never sees the original PDF.
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
            <li key={`${p.fileName}-${idx}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={
                  p.status === "ready"
                    ? "text-emerald-700"
                    : p.status === "failed"
                      ? "text-rose-700"
                      : "text-slate-500"
                }
              >
                {p.status === "ready" ? "✓" : p.status === "failed" ? "✕" : "…"}
              </span>
              <span className="flex-1 truncate text-slate-700">{p.fileName}</span>
              <span className="text-slate-500">
                {p.detail ??
                  (p.status === "parsing"
                    ? "parsing in browser…"
                    : p.status)}
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
