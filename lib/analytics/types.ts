/**
 * Analytics value-types (P2-6).
 *
 * The shapes the division dashboard, the per-agent My Stats slice, and
 * the Team table read against. Production replaces the in-memory
 * selectors in `metrics.ts` with reads off `metric_rollup` (schema.md);
 * these types are the contract that lets the swap happen without
 * touching the components.
 *
 * No `any`, no functions on the types — every shape is a plain record
 * the selectors return and the components consume.
 */

import type { FieldName } from "@/types";

/**
 * The single toggle that drives the whole Analytics view (mockup.md).
 *
 * `week` looks at the last 7 days; `month` looks at the last 30 days.
 * The selector `bucketsForRange` (in `metrics.ts`) owns the date math
 * so consumers never reach for `new Date()` directly.
 */
export type AnalyticsRange = "week" | "month";

/**
 * The four numbers on the KPI strip — the supervisor's "are we keeping
 * up" pulse signal (mockup.md Analytics → KPI cards).
 *
 * `hoursSaved` derives from the gap between the documented
 * `AVG_MANUAL_HANDLING_SECONDS` baseline and the measured
 * `avgHandlingSeconds`, scaled by `processed`. Clamped to ≥ 0: if the
 * system is somehow slower than the manual baseline (it shouldn't be),
 * the KPI shows zero rather than a misleading negative.
 */
export type KpiSnapshot = {
  /** Applications dispositioned in the range. */
  processed: number;
  /** Fraction landed in the AI match lane (0..1). */
  matchRate: number;
  /** 1 - matchRate; mismatch + review combined (0..1). */
  exceptionRate: number;
  /** Mean of (decidedAt - receivedAt) seconds across the range. */
  avgHandlingSeconds: number;
  /**
   * (AVG_MANUAL_HANDLING_SECONDS - avgHandlingSeconds) * processed / 3600,
   * clamped to ≥ 0. The math is auditable via the named constant.
   */
  hoursSaved: number;
};

/**
 * One bucket on the volume-trend bar chart (mockup.md Analytics →
 * Volume trend). `weekStart` is the ISO date for the start of the
 * 7-day window (Monday-anchored in `bucketsForRange`).
 */
export type TrendBucket = {
  /** ISO date for the start of the week (UTC, YYYY-MM-DD). */
  weekStart: string;
  count: number;
};

/**
 * The triage-breakdown donut over the AI lanes (mockup.md Analytics →
 * Triage donut). Distinct from agent dispositions: this is the lane
 * the system landed on, not the human's decision (CONTEXT.md Lane vs
 * Disposition).
 */
export type TriageBreakdown = {
  match: number;
  mismatch: number;
  review: number;
};

/**
 * One row on the top-mismatch-reasons chart (mockup.md Analytics).
 *
 * `field` is the wire-format `FieldName` so production can join straight
 * to `field_result.field_name`; `label` is the friendly UI string the
 * component renders so colour isn't the sole channel (NFR-2; AC-9).
 */
export type MismatchReason = {
  field: FieldName;
  label: string;
  count: number;
};

/**
 * One row on the throughput-by-agent chart (mockup.md Analytics →
 * Throughput by agent). Only `role: "agent"` rows are listed — the
 * supervisor's bulk-confirm work doesn't belong on the per-agent
 * throughput chart (it's a different category of decision).
 */
export type AgentThroughput = {
  agentId: string;
  agentName: string;
  processed: number;
};

/**
 * One row on the My Stats "recent decisions" list (mockup.md My Stats).
 *
 * `lane` is the AI's call at intake; `disposition` is the agent's
 * decision. Kept distinct (D11, CONTEXT.md Lane vs Disposition).
 */
export type RecentDecision = {
  applicationId: string;
  brand: string;
  /** ISO timestamp of the disposition. */
  decidedAt: string;
  disposition: "approve" | "return_for_correction";
  lane: "match" | "mismatch" | "review";
};
