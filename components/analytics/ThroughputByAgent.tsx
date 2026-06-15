/**
 * ThroughputByAgent — per-agent processed-count chart (P2-6, mockup.md
 * Analytics).
 *
 * Horizontal bars labeled by agent name with the count to the right.
 * Bar is decorative; count is the load-bearing number (NFR-2; AC-9).
 */

import React from "react";

import type { AgentThroughput } from "@/lib/analytics/types";

export function ThroughputByAgent({
  rows,
  title,
}: {
  rows: ReadonlyArray<AgentThroughput>;
  title: string;
}): React.ReactElement {
  const max = Math.max(1, ...rows.map((r) => r.processed));

  return (
    <section
      aria-labelledby="throughput-by-agent-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2
        id="throughput-by-agent-heading"
        className="text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No agents in this range.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((r) => {
            const widthPct = (r.processed / max) * 100;
            return (
              <li
                key={r.agentId}
                className="grid grid-cols-[140px_1fr_36px] items-center gap-2 text-sm"
              >
                <span className="truncate font-medium text-slate-800">
                  {r.agentName}
                </span>
                <span
                  aria-hidden="true"
                  className="block h-3 rounded bg-slate-100"
                >
                  <span
                    className="block h-full rounded bg-sky-600"
                    style={{ width: `${widthPct}%` }}
                  />
                </span>
                <span className="text-right font-mono font-semibold text-slate-900">
                  {r.processed}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
