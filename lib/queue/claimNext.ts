/**
 * Pool pick + claim mutation (P2-1; the seam P2-3's router will reuse).
 *
 * "Claim" sets `assignedAgentId` and `claimedAt` on the next eligible
 * pool item (D15; CONTEXT.md Claim). For the prototype the eligibility
 * rule is "next mismatch, then next review, by receivedAt ASC". P2-4
 * will replace this with specialization-aware pull routing — the
 * function signature stays the same so the route module doesn't
 * change.
 *
 * Respects agent availability (D15; CONTEXT.md Availability) — an
 * out-of-office agent cannot claim. The Profile screen in P2-6 will
 * mutate availability; the route here is the consumer.
 *
 * Pure-ish: takes the store state, returns a NEW state plus the
 * outcome. The React provider owns the actual setState.
 */

import type { Lane } from "@/types";

import type {
  ClaimOutcome,
  QueueApplication,
  QueueStoreState,
} from "./types";

const LANE_PRIORITY: Readonly<Record<Lane, number>> = {
  mismatch: 0,
  review: 1,
  match: 99,
};

export type ClaimResult = {
  state: QueueStoreState;
  outcome: ClaimOutcome;
};

/**
 * Pick the next eligible pool item and assign it to the current agent.
 * Returns the new store state alongside the outcome. The state is
 * structurally new even on a no-op so React's reference-equality
 * checks behave.
 */
export function claimNext(
  state: QueueStoreState,
  now: () => string = () => new Date().toISOString(),
): ClaimResult {
  const agent = state.agents.find((a) => a.id === state.currentAgentId);
  if (!agent) {
    return { state, outcome: { ok: false, reason: "no_eligible_pool_item" } };
  }
  if (agent.availability !== "available") {
    return { state, outcome: { ok: false, reason: "agent_unavailable" } };
  }

  // Eligible: in the shared pool (no agent assigned), not match-lane.
  const pool = state.applications
    .map((a, index) => ({ a, index }))
    .filter(
      ({ a }) =>
        a.assignedAgentId === null && a.verification.lane !== "match",
    );

  if (pool.length === 0) {
    return { state, outcome: { ok: false, reason: "no_eligible_pool_item" } };
  }

  // Sort: mismatch first, then review; within tier, oldest receivedAt
  // first (FIFO across the pool). The same priority rule the
  // mockup uses for "problems first" in the row order.
  pool.sort((x, y) => {
    const laneDelta =
      LANE_PRIORITY[x.a.verification.lane] -
      LANE_PRIORITY[y.a.verification.lane];
    if (laneDelta !== 0) return laneDelta;
    return x.a.receivedAt < y.a.receivedAt
      ? -1
      : x.a.receivedAt > y.a.receivedAt
        ? 1
        : 0;
  });

  const { a: target, index } = pool[0]!;
  const claimedAt = now();
  const claimed: QueueApplication = {
    ...target,
    assignedAgentId: state.currentAgentId,
    claimedAt,
  };

  const nextApplications = [...state.applications];
  nextApplications[index] = claimed;

  return {
    state: { ...state, applications: nextApplications },
    outcome: { ok: true, claimed },
  };
}
