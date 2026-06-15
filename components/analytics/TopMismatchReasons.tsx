/**
 * TopMismatchReasons — horizontal-bar chart of failing fields (P2-6,
 * mockup.md Analytics).
 *
 * Each row: friendly label + bar + count. The bar is decorative; the
 * count is the load-bearing number (NFR-2; AC-9 — colour is never the
 * sole channel).
 */

import React from "react";

import type { MismatchReason } from "@/lib/analytics/types";

export function TopMismatchReasons({
  reasons,
  title,
}: {
  reasons: ReadonlyArray<MismatchReason>;
  title: string;
}): React.ReactElement {
  const max = Math.max(1, ...reasons.map((r) => r.count));

  return (
    <section
      aria-labelledby="top-mismatch-reasons-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2
        id="top-mismatch-reasons-heading"
        className="text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        {title}
      </h2>
      {reasons.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No mismatches in this range.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {reasons.map((r) => {
            const widthPct = (r.count / max) * 100;
            return (
              <li
                key={r.field}
                className="grid grid-cols-[140px_1fr_36px] items-center gap-2 text-sm"
              >
                <span className="truncate font-medium text-slate-800">
                  {r.label}
                </span>
                <span
                  aria-hidden="true"
                  className="block h-3 rounded bg-slate-100"
                >
                  <span
                    className="block h-full rounded bg-orange-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </span>
                <span className="text-right font-mono font-semibold text-slate-900">
                  {r.count}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
