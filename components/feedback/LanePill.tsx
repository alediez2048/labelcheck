/**
 * LanePill — color + icon + text lane chip for the feedback loop UI.
 *
 * The feedback loop surface (agreement widget + disagreement queue) needs
 * the same lane-language triple (NFR-2, AC-9) the queue row and the
 * distribution board already use. Rather than couple `components/feedback/`
 * to a leaf file under `app/verify/result/`, we keep a small local pill
 * here. The shape is intentionally minimal — feedback-loop rows compare
 * two lanes side-by-side, so the pill stays compact (no rich subtitle
 * the LaneBanner carries).
 */

import React from "react";

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

export function LanePill({ lane }: { lane: Lane }): React.ReactElement {
  const t = LANE_TREATMENT[lane];
  return (
    <span
      aria-label={`Lane: ${t.label}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.pillClass}`}
    >
      <span aria-hidden="true">{t.icon}</span>
      <span>{t.label}</span>
    </span>
  );
}
