/**
 * /match-review — admin "trust but verify" surface (FR-23 expanded).
 *
 * All applications currently in the Match lane, each row expandable
 * to show the label image + the per-field form-vs-label summary. The
 * supervisor scrolls, spot-checks, then clicks **Approve all N** to
 * bulk-confirm in one action.
 *
 * Complements the Operations page's MatchLaneApprovalPanel: that
 * panel surfaces only the bottom-quartile-confidence cases inline;
 * this view shows every match-lane application with the full
 * comparison so the supervisor can stretch their audit when they
 * want to.
 */

"use client";

import Link from "next/link";
import React, { useState } from "react";

import { FieldTable } from "@/app/verify/result/FieldTable";
import { useQueue } from "@/lib/queue/QueueProvider";
import type { QueueApplication } from "@/lib/queue/types";

export default function MatchReviewPage(): React.ReactElement {
  const { state, bulkApproveMatchLane } = useQueue();
  const [actionError, setActionError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const matchApps: ReadonlyArray<QueueApplication> = state.applications.filter(
    (a) => a.verification.lane === "match",
  );

  // Sort by confidence ascending — the supervisor's spot-check eye
  // lands on the weakest matches first.
  const sortedMatchApps = [...matchApps].sort(
    (a, b) => a.verification.overallConfidence - b.verification.overallConfidence,
  );

  function handleApproveAll(): void {
    setActionError(null);
    const result = bulkApproveMatchLane();
    if (!result.ok) {
      setActionError(`Bulk-approve failed: ${result.error}`);
      return;
    }
    setApproved(true);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Match review</h1>
        <p className="mt-1 text-sm text-muted">
          Every application the AI cleared to the Match lane. Spot-check
          before bulk approval.
        </p>
      </header>

      {actionError !== null && (
        <p
          role="alert"
          className="rounded-md border border-mismatch-line bg-mismatch-soft px-3 py-2 text-sm text-mismatch"
        >
          <span aria-hidden="true" className="mr-1 font-bold">
            ✕
          </span>
          {actionError}
        </p>
      )}

      {approved && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-panel border-2 border-match-line bg-match-soft px-5 py-4 text-match"
        >
          <h2 className="text-base font-semibold">
            <span aria-hidden="true" className="mr-1.5">
              ✓
            </span>
            Approved {sortedMatchApps.length} application
            {sortedMatchApps.length === 1 ? "" : "s"} from the match lane
          </h2>
          <p className="mt-1 text-sm">
            Records moved to the dispositioned list. The match-lane
            count on Operations will refresh.
          </p>
          <Link
            href="/operations"
            className="mt-3 inline-flex min-h-[40px] items-center gap-1 rounded-[10px] bg-match px-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            ← Back to Operations
          </Link>
        </section>
      )}

      {!approved && (
        <>
          <section
            className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-5 py-4 shadow-panel"
            aria-labelledby="approve-heading"
          >
            <div>
              <h2 id="approve-heading" className="text-base font-semibold text-ink">
                {sortedMatchApps.length} match-lane application
                {sortedMatchApps.length === 1 ? "" : "s"} ready
              </h2>
              <p className="mt-1 text-xs text-muted">
                Sorted by confidence — weakest matches first.
              </p>
            </div>
            <button
              type="button"
              disabled={sortedMatchApps.length === 0}
              onClick={handleApproveAll}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-match px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <span aria-hidden="true">✓</span>
              <span>Approve all {sortedMatchApps.length}</span>
            </button>
          </section>

          {sortedMatchApps.length === 0 ? (
            <p className="rounded-panel border border-line bg-surface px-5 py-8 text-center text-sm text-muted shadow-panel">
              No match-lane applications right now. Drop a PDF on
              Operations to start the funnel.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sortedMatchApps.map((app) => (
                <MatchReviewRow key={app.applicationId} app={app} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function MatchReviewRow({ app }: { app: QueueApplication }): React.ReactElement {
  const confidencePct = Math.round(app.verification.overallConfidence * 100);
  const firstFace = app.faces[0];
  return (
    <li className="rounded-panel border border-line bg-surface shadow-panel">
      <details className="group">
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold text-ink">{app.brand}</span>
            <span className="font-mono text-[11px] text-muted">
              {app.applicationId}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-match-line bg-match-soft px-2.5 py-0.5 text-xs font-semibold text-match">
            <span aria-hidden="true">✓</span>
            <span>Match</span>
          </span>
          <span className="text-xs text-muted">
            confidence{" "}
            <span className="font-mono font-semibold text-ink">
              {confidencePct}%
            </span>
          </span>
          <span aria-hidden="true" className="text-muted group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Label face
            </p>
            {firstFace ? (
              <img
                src={firstFace.previewUrl}
                alt={`Label of ${app.brand}`}
                className="block h-auto w-full rounded-md border border-line bg-slate-100 object-contain"
                loading="lazy"
              />
            ) : (
              <p className="text-sm text-muted">No face image available.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Form vs. label
            </p>
            <FieldTable fields={app.verification.fields} />
          </div>
        </div>
      </details>
    </li>
  );
}
