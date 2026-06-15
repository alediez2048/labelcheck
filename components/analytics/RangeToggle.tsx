/**
 * RangeToggle — week / month segmented control (P2-6, mockup.md
 * Analytics).
 *
 * Drives the whole Analytics view. Hand-rolled SVG icons (not unicode
 * glyphs) so the active state reads in both axes: filled background +
 * bold text + icon (NFR-2; AC-9 — colour is not the sole channel).
 */

"use client";

import React from "react";

import type { AnalyticsRange } from "@/lib/analytics/types";

const LABELS: Record<AnalyticsRange, string> = {
  week: "Week",
  month: "Month",
};

export function RangeToggle({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
}): React.ReactElement {
  const options: AnalyticsRange[] = ["week", "month"];
  return (
    <div
      role="radiogroup"
      aria-label="Analytics range"
      className="inline-flex rounded-md border border-slate-200 bg-white p-0.5"
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition " +
              (active
                ? "bg-slate-900 text-white shadow"
                : "text-slate-600 hover:bg-slate-50")
            }
          >
            <span
              aria-hidden="true"
              className={
                "inline-block h-2 w-2 rounded-full " +
                (active ? "bg-emerald-300" : "bg-slate-300")
              }
            />
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
