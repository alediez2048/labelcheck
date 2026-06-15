/**
 * LiveIntakeFeed — most-recent applications with lane + destination
 * string (P2-2, mockup.md Operations).
 *
 * Each row pairs the lane (color + icon + text) with the destination
 * the application landed in. The destination is a plain string so a
 * future routing change (auto-cleared vs review pool vs assigned
 * agent) shows up in the feed without UI changes.
 */

import React from "react";

import type { LiveIntakeEntry } from "@/lib/operations/liveIntake";
import type { Lane } from "@/types";

const LANE_TREATMENT: Readonly<
  Record<Lane, { label: string; icon: string; pillClass: string }>
> = {
  match: {
    label: "Match",
    icon: "✓",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  mismatch: {
    label: "Mismatch",
    icon: "✕",
    pillClass: "bg-rose-100 text-rose-900 border-rose-400",
  },
  review: {
    label: "Review",
    icon: "!",
    pillClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

export function LiveIntakeFeed({
  entries,
}: {
  entries: ReadonlyArray<LiveIntakeEntry>;
}): React.ReactElement {
  return (
    <section
      aria-labelledby="live-intake-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="border-b border-slate-100 pb-3">
        <h2
          id="live-intake-heading"
          className="text-base font-semibold text-slate-800"
        >
          Live intake
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Most recent applications and where each was routed.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No applications received yet today.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {entries.map((entry) => {
            const t = LANE_TREATMENT[entry.lane];
            return (
              <li
                key={entry.applicationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div className="flex flex-1 items-center gap-3">
                  <span
                    aria-label={`Lane: ${t.label}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.pillClass}`}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    <span>{t.label}</span>
                  </span>
                  <span className="text-sm font-medium text-slate-900">
                    {entry.brand}
                  </span>
                </div>
                <span className="text-sm text-slate-700">{entry.destination}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
