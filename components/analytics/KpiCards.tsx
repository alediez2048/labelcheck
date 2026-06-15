/**
 * KpiCards — the four-card KPI strip on Analytics + My Stats (P2-6,
 * mockup.md).
 *
 * Each card: label, big number, caption. The hours-saved card surfaces
 * the AVG_MANUAL_HANDLING_SECONDS constant in a footnote so the math is
 * auditable.
 *
 * Reused by My Stats (the parallel agent) with the same prop shape — a
 * `KpiSnapshot` from `agentKpis` flows in identically.
 */

import React from "react";

import type { AnalyticsRange, KpiSnapshot } from "@/lib/analytics/types";
import { AVG_MANUAL_HANDLING_SECONDS } from "@/lib/queue/fixtures";

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatSeconds(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

function formatHours(hours: number): string {
  if (hours === 0) return "0h";
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  return `${hours.toFixed(1)}h`;
}

const RANGE_CAPTION: Record<AnalyticsRange, string> = {
  week: "last 7 days",
  month: "last 30 days",
};

export function KpiCards({
  snapshot,
  range,
  hoursSavedHidden = false,
}: {
  snapshot: KpiSnapshot;
  range: AnalyticsRange;
  /** Hide the hours-saved card on My Stats (division-level KPI). */
  hoursSavedHidden?: boolean;
}): React.ReactElement {
  const rangeCaption = RANGE_CAPTION[range];

  const cards: Array<{
    label: string;
    value: string;
    caption: React.ReactNode;
  }> = [
    {
      label: "Applications processed",
      value: String(snapshot.processed),
      caption: rangeCaption,
    },
    {
      label: "Match rate",
      value: formatPercent(snapshot.matchRate),
      caption: "AI cleared without review",
    },
    {
      label: "Exception rate",
      value: formatPercent(snapshot.exceptionRate),
      caption: "mismatch + review combined",
    },
  ];

  if (!hoursSavedHidden) {
    cards.push({
      label: "Hours saved",
      value: formatHours(snapshot.hoursSaved),
      caption: (
        <>
          vs {AVG_MANUAL_HANDLING_SECONDS}s manual baseline
          <br />
          <span className="text-slate-500">
            avg handling {formatSeconds(snapshot.avgHandlingSeconds)}
          </span>
        </>
      ),
    });
  } else {
    // My Stats variant: replace hours saved with avg handling time so
    // the strip is still four cards.
    cards.push({
      label: "Avg handling time",
      value: formatSeconds(snapshot.avgHandlingSeconds),
      caption: "per application",
    });
  }

  return (
    <section
      aria-label="Key performance indicators"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900">
            {card.value}
          </p>
          <p className="mt-1 text-xs text-slate-600">{card.caption}</p>
        </div>
      ))}
    </section>
  );
}
