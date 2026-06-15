/**
 * "My Queue" selector (P2-1, D15, D16, CONTEXT.md Work pool).
 *
 * Pure function: given the queue store and the current agent's id,
 * return the agent's CLAIMED exceptions, sorted problems-first.
 *
 *   - Filter: only this agent's claimed items.
 *   - Filter: match-lane applications NEVER reach the queue — they
 *     are bulk-confirmed on the Admin Operations view (D11, D15).
 *   - Sort: mismatch lane before review lane (problems first), then
 *     by `claimedAt` ascending (oldest claim first — the agent
 *     finishes what they started before starting new work).
 *
 * The route renders `QueueItem[]`; the selector wraps each filtered
 * application with the derived issue summary so the row doesn't
 * recompute on every render.
 */

import type { Lane } from "@/types";

import { deriveIssueSummary } from "./issueSummary";
import type { QueueApplication, QueueItem, QueueStoreState } from "./types";

const LANE_PRIORITY: Readonly<Record<Lane, number>> = {
  mismatch: 0,
  review: 1,
  // match never reaches the queue, but keeping the entry makes the
  // sort total — defensive against a stray match-lane row landing
  // here through a routing bug.
  match: 99,
};

export function selectMyQueue(state: QueueStoreState): QueueItem[] {
  const claimed = state.applications.filter(
    (a) =>
      a.assignedAgentId === state.currentAgentId &&
      a.verification.lane !== "match",
  );

  const sorted = [...claimed].sort((a, b) => {
    const laneDelta = LANE_PRIORITY[a.verification.lane] - LANE_PRIORITY[b.verification.lane];
    if (laneDelta !== 0) return laneDelta;
    return compareClaimedAt(a, b);
  });

  return sorted.map((application) => ({
    application,
    issueSummary: deriveIssueSummary(application.verification),
    lane: application.verification.lane,
  }));
}

/** Count of applications waiting in the shared exception pool. */
export function selectPoolCount(state: QueueStoreState): number {
  return state.applications.filter(
    (a) =>
      a.assignedAgentId === null && a.verification.lane !== "match",
  ).length;
}

function compareClaimedAt(a: QueueApplication, b: QueueApplication): number {
  // Both must be claimed to reach this branch, but the type system
  // doesn't know that. Treat a null as "claimed at the dawn of time"
  // so it sorts first — defensive.
  const aAt = a.claimedAt ?? "";
  const bAt = b.claimedAt ?? "";
  if (aAt < bAt) return -1;
  if (aAt > bAt) return 1;
  return 0;
}
