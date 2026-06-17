/**
 * MatchLaneApprovalPanel — the supervisor's aggregate review surface
 * above the bulk-confirm action (FR-20, FR-23).
 *
 * Three signals before the click:
 *   1. Count + delta vs baseline match rate pill.
 *   2. Bottom-quartile-confidence matches inline, each
 *      tap-expandable to the P1-8 per-field breakdown (`<details>`).
 *   3. The "flagged-field-in-match" list — match-lane applications
 *      with a non-`match` field result, surfaced separately because
 *      the signal is qualitative (a specific field) not quantitative
 *      (low overall confidence).
 *
 * Then one primary action: "Approve all N". On click, the provider
 * records one disposition per match-lane application and the panel
 * re-renders to the caught-up state.
 *
 * NOT auto-clear (CONTEXT.md Auto-clear; D11). The aggregate above
 * the click is what makes this a human-in-the-loop step.
 */

"use client";

import React from "react";

import { FieldTable } from "@/app/verify/result/FieldTable";
import type { AggregateReviewSnapshot } from "@/lib/operations/aggregateReview";
import type { QueueApplication } from "@/lib/queue/types";

type Props = {
  snapshot: AggregateReviewSnapshot;
  onApproveAll: () => void;
};

export function MatchLaneApprovalPanel({
  snapshot,
  onApproveAll,
}: Props): React.ReactElement {
  const deltaPct = (snapshot.delta * 100).toFixed(1);
  const deltaSign = snapshot.delta >= 0 ? "+" : "";
  const deltaTreatment =
    snapshot.delta >= 0
      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
      : "bg-amber-100 text-amber-900 border-amber-400";

  if (snapshot.total === 0) {
    return (
      <section
        aria-labelledby="match-panel-heading"
        className="rounded-lg border border-slate-200 bg-white p-6 text-center"
      >
        <h2
          id="match-panel-heading"
          className="text-base font-semibold text-slate-800"
        >
          Match lane
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          No clean matches waiting — the approval pile is empty.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="match-panel-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2
            id="match-panel-heading"
            className="text-base font-semibold text-slate-800"
          >
            Match lane — {snapshot.total} ready to approve
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Glance at the supervisor surface below before clearing the lane.
          </p>
        </div>
        <span
          aria-label={`Today's match rate is ${(snapshot.todayMatchRate * 100).toFixed(1)}%, ${snapshot.delta >= 0 ? "above" : "below"} baseline by ${Math.abs(snapshot.delta * 100).toFixed(1)}%`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${deltaTreatment}`}
        >
          <span aria-hidden="true">{snapshot.delta >= 0 ? "↑" : "↓"}</span>
          <span>
            {deltaSign}
            {deltaPct}% vs baseline ({(snapshot.baselineMatchRate * 100).toFixed(0)}%)
          </span>
        </span>
      </header>

      <AllMatchesList rows={snapshot.allMatches} />
      <FlaggedInMatchList rows={snapshot.flaggedInMatch} />

      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onApproveAll}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:w-auto"
        >
          <span aria-hidden="true">✓</span>
          <span>Approve all {snapshot.total}</span>
        </button>
        <p className="mt-2 text-xs text-slate-500">
          One disposition per application is recorded. This is not auto-clear.
        </p>
      </div>
    </section>
  );
}

function AllMatchesList({
  rows,
}: {
  rows: ReadonlyArray<QueueApplication>;
}): React.ReactElement {
  if (rows.length === 0) return <></>;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-slate-700">
        Match-lane applications
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Sorted lowest confidence first. Click any row to see the per-field breakdown.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((app) => {
          const confidencePct = Math.round(
            app.verification.overallConfidence * 100,
          );
          const confidenceTreatment =
            confidencePct >= 80
              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
              : confidencePct >= 60
                ? "bg-amber-100 text-amber-900 border-amber-300"
                : "bg-rose-100 text-rose-900 border-rose-300";
          return (
            <li
              key={app.applicationId}
              className="rounded-md border border-slate-200 bg-slate-50"
            >
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100">
                  <span className="flex-1 truncate">{app.brand}</span>
                  <span
                    aria-label={`Confidence ${confidencePct} percent`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceTreatment}`}
                  >
                    <span aria-hidden="true">✓</span>
                    <span>{confidencePct}%</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-xs text-slate-500 group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <div className="border-t border-slate-200 bg-white p-3">
                  <FieldTable fields={app.verification.fields} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FlaggedInMatchList({
  rows,
}: {
  rows: ReadonlyArray<QueueApplication>;
}): React.ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-slate-700">
        Flagged field in an otherwise-match
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        These cleared overall but carry a non-match field. Spot-check before approving.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((app) => {
          const flagged = app.verification.fields.find(
            (f) => f.verdict !== "match",
          );
          return (
            <li
              key={app.applicationId}
              className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-amber-900">{app.brand}</span>
              {flagged && (
                <span className="text-xs text-amber-900">
                  {flagged.field}: {flagged.reason}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
