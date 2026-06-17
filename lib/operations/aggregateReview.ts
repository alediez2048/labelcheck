/**
 * Aggregate review surface above the match-lane bulk-confirm (FR-23).
 *
 * The supervisor must see THREE things before they approve the whole
 * lane in one click — count, bottom-quartile-confidence matches
 * inline + tap-expandable, and the delta vs the rolling baseline
 * match rate. Without all three the page reduces to "approve all"
 * with no review, which is auto-clear — an off-by-default agency
 * policy (CONTEXT.md Auto-clear; D11). The selector wraps those
 * three signals in one snapshot.
 *
 * The "single flagged-but-still-match field" case (a `lane === "match"`
 * application with a non-`match` field result) is the highest-value
 * glance signal — a near-pass the supervisor may want to spot-check.
 * It's surfaced as a separate list rather than collapsed into the
 * bottom-quartile because the SIGNAL is different (low confidence vs
 * one weak field).
 */

import type { QueueApplication, QueueStoreState } from "@/lib/queue/types";

export type AggregateReviewSnapshot = {
  /** Total match-lane applications eligible for bulk-confirm. */
  total: number;
  /** Today's match rate (matchCount / totalCount). */
  todayMatchRate: number;
  /** Rolling baseline match rate from the store. */
  baselineMatchRate: number;
  /** Signed delta — positive means "above baseline", negative means "below". */
  delta: number;
  /**
   * Bottom-quartile-confidence match applications, sorted by
   * `overallConfidence` ascending. Cut: `Math.ceil(N / 4)`. The
   * supervisor scans these before the bulk-confirm.
   */
  bottomQuartile: ReadonlyArray<QueueApplication>;
  /**
   * Match-lane applications with at least one non-`match` field
   * result — the "soft flag in an otherwise-match application" case
   * (FR-23). Surfaced separately from the bottom quartile because the
   * signal is qualitative (a specific field) not quantitative
   * (low confidence overall).
   */
  flaggedInMatch: ReadonlyArray<QueueApplication>;
  /**
   * Every match-lane application, sorted by `overallConfidence`
   * ascending (weakest first). The supervisor expects to see every
   * one before bulk-approve, not just the bottom quartile.
   */
  allMatches: ReadonlyArray<QueueApplication>;
};

export function selectAggregateReview(
  state: QueueStoreState,
): AggregateReviewSnapshot {
  const apps = state.applications;
  const matchApps = apps.filter((a) => a.verification.lane === "match");
  const total = matchApps.length;

  const todayMatchRate = apps.length === 0 ? 0 : total / apps.length;
  const delta = todayMatchRate - state.baselineMatchRate;

  const sortedAsc = [...matchApps].sort(
    (a, b) => a.verification.overallConfidence - b.verification.overallConfidence,
  );
  // Math.ceil ensures the bottom-quartile is non-empty as long as the
  // total is non-zero — even with N=1, the supervisor sees that one
  // row before approving.
  const cutoff = Math.ceil(total / 4);
  const bottomQuartile = sortedAsc.slice(0, cutoff);

  const flaggedInMatch = matchApps.filter((a) =>
    a.verification.fields.some((f) => f.verdict !== "match"),
  );

  return {
    total,
    todayMatchRate,
    baselineMatchRate: state.baselineMatchRate,
    delta,
    bottomQuartile,
    flaggedInMatch,
    allMatches: sortedAsc,
  };
}
