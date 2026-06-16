/**
 * SubmitBatchButton — operations entry into the P3-1 batch path.
 *
 * Two adjacent affordances rather than one because the supervisor's
 * mental model is "sample" vs "peak-season burst" (A29). Hardcoded
 * counts keep the prototype's input surface narrow: the orchestrator
 * synthesises applications from fixtures, so there's no form to fill
 * and nothing for a typo to break. Real production intake will be a
 * file/zip drop on a later ticket; this button exists so the
 * supervisor can rehearse the whole batch flow today.
 *
 * Disabling while in-flight is double-duty: it prevents a double
 * POST that would create two jobs, AND it telegraphs that the
 * request is doing real work before the redirect lands.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

type CreateBatchResponse = { jobId: string };

const PRESETS: ReadonlyArray<{ count: number; label: string }> = [
  { count: 50, label: "Run sample batch (50)" },
  { count: 300, label: "Run peak-season batch (300)" },
];

export function SubmitBatchButton(): React.ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(count: number): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!res.ok) {
        const detail = await safeText(res);
        throw new Error(
          `Batch create failed (${res.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const body = (await res.json()) as CreateBatchResponse;
      if (typeof body.jobId !== "string" || body.jobId.length === 0) {
        throw new Error("Batch create returned no jobId");
      }
      router.push(`/batch/${body.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {PRESETS.map((preset) => (
          <button
            key={preset.count}
            type="button"
            disabled={pending}
            onClick={() => {
              void submit(preset.count);
            }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-indigo-700 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-600"
          >
            <span aria-hidden="true">▶</span>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
      {pending && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-slate-600"
        >
          Submitting batch…
        </p>
      )}
      {error !== null && (
        <p
          role="alert"
          className="inline-flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="font-bold">
            ✕
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 200);
  } catch {
    return "";
  }
}
