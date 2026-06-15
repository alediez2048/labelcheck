/**
 * ReviewDistributionBoard — shared pool row + per-agent rows +
 * Distribute action (P2-2, mockup.md Operations).
 *
 * Top: highlighted shared pool with per-beverage-type counters.
 * Below: one row per agent with a load bar, claimed count,
 * specialization pill, and availability pill (color + icon + text).
 *
 * Distribute calls into the P2-3 router stub. Until P2-3 lands, the
 * action shows a "pending router pass" badge with the count that
 * would be routed.
 */

"use client";

import React, { useState } from "react";

import type { DistributionSnapshot } from "@/lib/operations/distribution";
import type { BeverageType } from "@/types";

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

const AVAILABILITY_TREATMENT = {
  available: {
    label: "Available",
    icon: "●",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  out_of_office: {
    label: "Out of office",
    icon: "◯",
    pillClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
} as const;

const CAPACITY = 5;

type Props = {
  snapshot: DistributionSnapshot;
  onDistribute: () => { pendingCount: number; applied: boolean };
};

export function ReviewDistributionBoard({
  snapshot,
  onDistribute,
}: Props): React.ReactElement {
  const [notice, setNotice] = useState<string | null>(null);

  function handleDistribute(): void {
    const result = onDistribute();
    if (result.applied) {
      setNotice(`Routed ${result.pendingCount} exception(s) to specialists.`);
    } else {
      setNotice(
        `${result.pendingCount} exception(s) queued for the P2-3 router. The Distribute action will be wired when the router lands.`,
      );
    }
  }

  return (
    <section
      aria-labelledby="distribution-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2
            id="distribution-heading"
            className="text-base font-semibold text-slate-800"
          >
            Review distribution
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Shared exception pool above; per-agent load below. Match-lane never appears here.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDistribute}
          disabled={snapshot.pool.total === 0}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <span aria-hidden="true">↔</span>
          <span>Distribute</span>
        </button>
      </header>

      <div className="mt-4 rounded-md border-2 border-indigo-300 bg-indigo-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold text-indigo-900">
            {snapshot.pool.total} waiting to be pulled
          </p>
          <span className="text-xs text-indigo-700">Shared pool</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {snapshot.pool.byBeverageType.map((b) => (
            <li
              key={b.type}
              className="rounded-full border border-indigo-200 bg-white px-3 py-0.5 text-xs font-medium text-indigo-900"
            >
              {BEVERAGE_LABELS[b.type]}: {b.count}
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {snapshot.agents.map((row) => {
          const av = AVAILABILITY_TREATMENT[row.agent.availability];
          const loadPct = Math.min(100, (row.claimedCount / CAPACITY) * 100);
          return (
            <li
              key={row.agent.id}
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {row.agent.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.agent.specializations
                      .map((s) => BEVERAGE_LABELS[s])
                      .join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-800">
                    {row.claimedCount} claimed
                  </span>
                  <span
                    aria-label={`Availability: ${av.label}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${av.pillClass}`}
                  >
                    <span aria-hidden="true">{av.icon}</span>
                    <span>{av.label}</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  aria-hidden="true"
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${loadPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {notice !== null && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
