/**
 * /batch/[id] — the batch results view (P3-1, FR-18, FR-19, FR-20, FR-23).
 *
 * Client component because the page is a poll loop, not a data render:
 * we re-fetch every 800ms until `finished === true`, then stop. 800ms
 * is short enough that the progress bar visibly moves on a ~300-app
 * batch (≈60s wall time with the mock provider) but long enough not
 * to thrash the server while it runs the orchestrator.
 *
 * The page is presentational on top of the poll response; everything
 * lane-shaped lives in <LaneGroup>. Failed items are surfaced in their
 * OWN panel at the top of the page, not folded into a lane — a failed
 * item has no triage outcome, so it isn't a match / mismatch / review,
 * it's an absence of one.
 *
 * Restart resilience is intentionally out of scope (D2, NFR-4): a
 * server restart cancels in-flight batches. A 404 from the poll
 * endpoint after the user navigated to a known job id means the job
 * was lost; we surface that cleanly with a link back to operations
 * rather than silently retrying forever.
 */

"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { VerificationResult } from "@/types";

import { LaneGroup } from "./LaneGroup";
import type { BatchItem, BatchPollResponse } from "./types";

const POLL_INTERVAL_MS = 800;

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: BatchPollResponse };

export default function BatchResultsPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const jobId = typeof params.id === "string" ? params.id : "";

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Refs guard against React 18 strict-mode's double-mount and any
  // late callbacks after the component unmounts (race-window on a
  // fast refetch). The aliveRef is checked before each setState.
  const aliveRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOnce = useCallback(async (): Promise<void> => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/batch/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      if (!aliveRef.current) return;
      if (res.status === 404) {
        setState({ kind: "not_found" });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: `Batch poll failed (${res.status})`,
        });
        return;
      }
      const body = (await res.json()) as BatchPollResponse;
      if (!aliveRef.current) return;
      setState({ kind: "ok", data: body });

      if (!body.finished) {
        timeoutRef.current = setTimeout(() => {
          void fetchOnce();
        }, POLL_INTERVAL_MS);
      }
    } catch (e) {
      if (!aliveRef.current) return;
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Poll failed",
      });
    }
  }, [jobId]);

  useEffect(() => {
    aliveRef.current = true;
    void fetchOnce();
    return () => {
      aliveRef.current = false;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [fetchOnce]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/operations"
          className="text-sm text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          ← Operations
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">
          Batch <span className="font-mono text-2xl">{jobId || "—"}</span>
        </h1>
      </header>

      {state.kind === "loading" && (
        <p className="text-sm text-slate-600">Loading batch…</p>
      )}

      {state.kind === "not_found" && (
        <section
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-semibold">
            <span aria-hidden="true" className="mr-1">
              !
            </span>
            Batch not found.
          </p>
          <p className="mt-1">
            The job may have been cancelled by a server restart (batch state is
            in-memory by design).
          </p>
          <p className="mt-2">
            <Link
              href="/operations"
              className="font-semibold text-indigo-700 hover:underline"
            >
              ← Back to Operations
            </Link>
          </p>
        </section>
      )}

      {state.kind === "error" && (
        <section
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <p className="font-semibold">
            <span aria-hidden="true" className="mr-1">
              ✕
            </span>
            {state.message}
          </p>
        </section>
      )}

      {state.kind === "ok" && <Body data={state.data} />}
    </main>
  );
}

function Body({ data }: { data: BatchPollResponse }): React.ReactElement {
  // Local overrides apply on top of the poll response so per-item retries
  // can replace a failed entry with the freshly-returned verification
  // result. Keyed by item id so the override survives the next poll.
  const [overrides, setOverrides] = useState<Record<string, BatchItem>>({});

  const onRetrySuccess = useCallback(
    (itemId: string, result: VerificationResult): void => {
      setOverrides((prev) => {
        const base = data.items.find((i) => i.id === itemId);
        if (!base) return prev;
        return {
          ...prev,
          [itemId]: { ...base, status: "done", result, error: undefined },
        };
      });
    },
    [data.items],
  );

  const items = data.items.map((it) => overrides[it.id] ?? it);
  const { progress, finished } = data;
  const adjustedProgress = recomputeProgress(progress, data.items, overrides);
  const completed = adjustedProgress.done + adjustedProgress.failed;
  const percent =
    adjustedProgress.total === 0
      ? 0
      : Math.round((completed / adjustedProgress.total) * 100);

  const failedItems = items.filter((i) => i.status === "failed");

  // Bucket by lane only over items that produced a verification
  // result. Pending / running / failed items don't have a lane yet.
  const matchItems = items.filter((i) => i.result?.lane === "match");
  const mismatchItems = items.filter((i) => i.result?.lane === "mismatch");
  const reviewItems = items.filter((i) => i.result?.lane === "review");

  return (
    <div className="flex flex-col gap-6">
      <ProgressSection
        percent={percent}
        completed={completed}
        total={adjustedProgress.total}
        running={adjustedProgress.running}
        finished={finished}
      />

      <CountsRow progress={adjustedProgress} />

      {failedItems.length > 0 && (
        <FailedPanel items={failedItems} onRetrySuccess={onRetrySuccess} />
      )}

      {completed > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Results by lane
          </h2>
          <p className="text-sm text-slate-600">
            Exception-first — review mismatches and review-lane items before
            clearing the match lane.
          </p>
          <LaneGroup lane="mismatch" items={mismatchItems} />
          <LaneGroup lane="review" items={reviewItems} />
          <LaneGroup lane="match" items={matchItems} />
        </div>
      )}
    </div>
  );
}

/**
 * Adjust the server-supplied progress to reflect any client-side retry
 * overrides. A successful retry transitions an item from `failed` to
 * `done` + the result's lane bucket.
 */
function recomputeProgress(
  base: BatchPollResponse["progress"],
  serverItems: ReadonlyArray<BatchItem>,
  overrides: Record<string, BatchItem>,
): BatchPollResponse["progress"] {
  let failed = base.failed;
  let done = base.done;
  const byLane = { ...base.byLane };
  for (const it of serverItems) {
    const ov = overrides[it.id];
    if (!ov) continue;
    if (it.status === "failed" && ov.status === "done") {
      failed -= 1;
      done += 1;
      const lane = ov.result?.lane;
      if (lane === "match") byLane.match += 1;
      else if (lane === "mismatch") byLane.mismatch += 1;
      else if (lane === "review") byLane.review += 1;
    }
  }
  return { ...base, failed, done, byLane };
}

function ProgressSection({
  percent,
  completed,
  total,
  running,
  finished,
}: {
  percent: number;
  completed: number;
  total: number;
  running: number;
  finished: boolean;
}): React.ReactElement {
  return (
    <section
      aria-labelledby="batch-progress-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="batch-progress-heading"
          className="text-base font-semibold text-slate-800"
        >
          Progress
        </h2>
        <p className="text-sm text-slate-600">
          {completed} / {total} complete
          {running > 0 && (
            <span className="ml-2 text-indigo-700">· {running} running</span>
          )}
          {finished && (
            <span
              className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900"
              aria-label="Batch finished"
            >
              <span aria-hidden="true">✓</span>
              <span>Finished</span>
            </span>
          )}
        </p>
      </header>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Batch progress"
        className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full bg-indigo-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}

const STATUS_PILLS: ReadonlyArray<{
  key: "pending" | "running" | "done" | "failed";
  label: string;
  icon: string;
  cls: string;
}> = [
  {
    key: "pending",
    label: "Pending",
    icon: "○",
    cls: "bg-slate-100 text-slate-800 border-slate-300",
  },
  {
    key: "running",
    label: "Running",
    icon: "▶",
    cls: "bg-indigo-100 text-indigo-900 border-indigo-300",
  },
  {
    key: "done",
    label: "Done",
    icon: "✓",
    cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  {
    key: "failed",
    label: "Failed",
    icon: "✕",
    cls: "bg-rose-100 text-rose-900 border-rose-400",
  },
];

function CountsRow({
  progress,
}: {
  progress: BatchPollResponse["progress"];
}): React.ReactElement {
  return (
    <section
      aria-label="Item counts by status"
      className="flex flex-wrap gap-3"
    >
      {STATUS_PILLS.map((p) => (
        <span
          key={p.key}
          className={`inline-flex min-h-[40px] items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold ${p.cls}`}
        >
          <span aria-hidden="true">{p.icon}</span>
          <span>{p.label}</span>
          <span className="font-mono">{progress[p.key]}</span>
        </span>
      ))}
    </section>
  );
}

function FailedPanel({
  items,
  onRetrySuccess,
}: {
  items: ReadonlyArray<BatchItem>;
  onRetrySuccess: (itemId: string, result: VerificationResult) => void;
}): React.ReactElement {
  return (
    <section
      aria-labelledby="batch-failed-heading"
      className="rounded-lg border-2 border-rose-300 bg-rose-50 p-5"
    >
      <header className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg font-bold text-rose-900">
          ✕
        </span>
        <h2
          id="batch-failed-heading"
          className="text-base font-semibold text-rose-900"
        >
          Failed — {items.length}
        </h2>
      </header>
      <p className="mt-1 text-sm text-rose-900">
        Failed items have no lane. Review the error and consider resubmitting.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <FailedItemRow
            key={item.id}
            item={item}
            onRetrySuccess={onRetrySuccess}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One failed-item row. Surfaces the structured error's `code` as a pill,
 * the plain-language `message`, and a Retry button when the error is
 * retryable (P3-3). The retry posts the original form + faces back to
 * `/api/verify` and replaces the failed row on success.
 */
function FailedItemRow({
  item,
  onRetrySuccess,
}: {
  item: BatchItem;
  onRetrySuccess: (itemId: string, result: VerificationResult) => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const canRetry = Boolean(
    item.error?.retryable && item.beverageType && item.form && item.faces && item.faces.length > 0,
  );

  const onRetry = useCallback(async (): Promise<void> => {
    if (!item.beverageType || !item.form || !item.faces) return;
    setBusy(true);
    setRetryError(null);
    try {
      // The wire-encoded buffer survives JSON serialization as
      // `{type:"Buffer", data:number[]}`. Re-encode each face's bytes as
      // base64 so the /api/verify route reads them through the same
      // path the verify UI uses.
      const faces = item.faces.map((f) => ({
        kind: f.kind,
        mime: f.mime,
        bytes: encodeFaceBytes(f.bytes),
      }));
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationId: item.applicationId,
          beverageType: item.beverageType,
          form: item.form,
          faces,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setRetryError(body.error ?? `Retry failed (${res.status})`);
        return;
      }
      const result = (await res.json()) as VerificationResult;
      onRetrySuccess(item.id, result);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }, [item, onRetrySuccess]);

  return (
    <li className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-slate-800">{item.brand}</span>
        <span className="font-mono text-xs text-slate-500">
          {item.applicationId}
        </span>
      </div>
      {item.error && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 font-mono text-xs font-semibold text-rose-900">
            {item.error.code}
          </span>
          <span className="text-xs text-rose-900">{item.error.message}</span>
        </div>
      )}
      {(canRetry || retryError) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canRetry && (
            <button
              type="button"
              onClick={() => void onRetry()}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-60"
            >
              <span aria-hidden="true">↻</span>
              <span>{busy ? "Retrying…" : "Retry"}</span>
            </button>
          )}
          {retryError && (
            <span className="text-xs text-rose-900" role="alert">
              {retryError}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Re-encode the wire-format face bytes back to base64 for the verify
 * request. Buffer-shaped values arrive as `{type:"Buffer", data:[...]}`
 * after JSON.stringify on a Node Buffer; strings are passed through
 * unchanged (some seed paths attach base64 strings directly).
 */
function encodeFaceBytes(
  raw: { type: "Buffer"; data: number[] } | string,
): string {
  if (typeof raw === "string") return raw;
  if (raw && raw.type === "Buffer" && Array.isArray(raw.data)) {
    // The browser doesn't have Buffer; build a base64 string from the
    // raw byte array. Chunked to avoid `apply` stack overflow on large
    // byte arrays — 0x8000 is well within every engine's call-arg cap.
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < raw.data.length; i += chunkSize) {
      const chunk = raw.data.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  }
  return "";
}
