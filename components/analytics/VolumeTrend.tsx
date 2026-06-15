/**
 * VolumeTrend — N-week column-bar chart (P2-6, mockup.md Analytics).
 *
 * Hand-rolled CSS-grid bars (zero dep) with the count rendered above
 * each bar so the numeric value never depends on bar height alone
 * (NFR-2; AC-9). A title prop lets My Stats reuse the same component
 * with a different heading.
 */

import React from "react";

import type { TrendBucket } from "@/lib/analytics/types";

const BAR_PX_MAX = 96;

function formatLabel(weekStart: string): string {
  // weekStart is YYYY-MM-DD; render as "MMM D" UTC.
  const ms = Date.parse(`${weekStart}T00:00:00Z`);
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function VolumeTrend({
  buckets,
  title,
}: {
  buckets: ReadonlyArray<TrendBucket>;
  title: string;
}): React.ReactElement {
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <section
      aria-labelledby="volume-trend-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2
        id="volume-trend-heading"
        className="text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        {title}
      </h2>
      <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
        {buckets.map((bucket) => {
          const heightPx = Math.max(2, (bucket.count / max) * BAR_PX_MAX);
          return (
            <div
              key={bucket.weekStart}
              className="flex flex-1 flex-col items-center gap-1"
              style={{ minWidth: "44px" }}
            >
              <span className="font-mono text-xs font-semibold text-slate-700">
                {bucket.count}
              </span>
              <div
                role="presentation"
                aria-hidden="true"
                className="w-full rounded-t bg-sky-600"
                style={{ height: `${heightPx}px` }}
              />
              <span className="text-xs text-slate-500">
                {formatLabel(bucket.weekStart)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        Volume trend by week:{" "}
        {buckets
          .map((b) => `${formatLabel(b.weekStart)}: ${b.count}`)
          .join("; ")}
        .
      </p>
    </section>
  );
}
