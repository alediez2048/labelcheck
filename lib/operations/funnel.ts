/**
 * Intake funnel selector (P2-2, mockup.md Operations).
 *
 * Four ordered figures across the top of the supervisor's home:
 *   1. received          — total applications in the store
 *   2. auto-verified     — applications with a finished verification
 *                          (all of them in the prototype) plus the
 *                          average wall-clock latency in seconds
 *   3. ready to approve  — match-lane count (the bulk-confirm pile)
 *   4. needs review      — exception count (mismatch + review)
 *
 * Pure function: takes the store state, returns the snapshot the UI
 * component renders. No side effects, no model calls — the queue is
 * precomputed (D15).
 */

import type { QueueStoreState } from "@/lib/queue/types";

export type FunnelSnapshot = {
  received: number;
  autoVerified: number;
  /** Average extraction wall-clock duration, in seconds, rounded to one decimal. */
  avgLatencySec: number;
  readyToApprove: number;
  needsReview: number;
};

export function selectFunnel(state: QueueStoreState): FunnelSnapshot {
  const apps = state.applications;
  const received = apps.length;
  const autoVerified = apps.length;
  const latencyAvg =
    apps.length === 0
      ? 0
      : apps.reduce((sum, a) => sum + a.verifiedDurationMs, 0) / apps.length;
  const readyToApprove = apps.filter(
    (a) => a.verification.lane === "match",
  ).length;
  const needsReview = apps.filter(
    (a) => a.verification.lane !== "match",
  ).length;
  return {
    received,
    autoVerified,
    avgLatencySec: Math.round(latencyAvg / 100) / 10,
    readyToApprove,
    needsReview,
  };
}
