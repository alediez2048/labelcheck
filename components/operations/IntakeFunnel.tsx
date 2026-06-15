/**
 * IntakeFunnel — the four-step day funnel strip (P2-2, mockup.md
 * Operations).
 *
 * Received → Auto-verified (avg latency) → Ready to approve →
 * Needs review. Arrows between cells so the reader's eye traces the
 * pipeline. Numbers are the supervisor's at-a-glance pulse.
 */

import React from "react";

import type { FunnelSnapshot } from "@/lib/operations/funnel";

export function IntakeFunnel({
  snapshot,
}: {
  snapshot: FunnelSnapshot;
}): React.ReactElement {
  const cells = [
    {
      label: "Received",
      value: String(snapshot.received),
      caption: "applications today",
    },
    {
      label: "Auto-verified",
      value: String(snapshot.autoVerified),
      caption: `avg ${snapshot.avgLatencySec}s`,
    },
    {
      label: "Ready to approve",
      value: String(snapshot.readyToApprove),
      caption: "clean matches",
    },
    {
      label: "Needs review",
      value: String(snapshot.needsReview),
      caption: "exceptions",
    },
  ];

  return (
    <section
      aria-labelledby="intake-funnel-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2
        id="intake-funnel-heading"
        className="text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        Intake funnel
      </h2>
      <ol className="mt-3 flex flex-wrap items-stretch gap-2">
        {cells.map((cell, i) => (
          <React.Fragment key={cell.label}>
            <li className="flex min-w-[140px] flex-1 flex-col rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {cell.label}
              </span>
              <span className="mt-1 font-mono text-2xl font-bold text-slate-900">
                {cell.value}
              </span>
              <span className="text-xs text-slate-600">{cell.caption}</span>
            </li>
            {i < cells.length - 1 && (
              <li
                aria-hidden="true"
                className="flex items-center text-2xl text-slate-300"
              >
                →
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </section>
  );
}
