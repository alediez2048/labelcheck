/**
 * Default selection strategy for the work router (P2-3).
 *
 * Priority order: mismatch lane before review lane; within a lane,
 * oldest `receivedAt` wins (FIFO). The mockup's "problems first" row
 * ordering and CONTEXT.md's claim contract both call for this rule.
 *
 * The agent parameter is intentionally unused here — P2-4 swaps in a
 * specialization-aware strategy that filters on `agent.specializations`.
 * Keeping the signature identical means the swap is a one-line
 * substitution at the call sites in `claim.ts` and `distribute.ts`.
 *
 * Defensive: match-lane rows should never reach the pool (D11, D15),
 * but the strategy skips them explicitly so a future routing bug can't
 * leak a match-lane application into an agent's queue.
 */

import type { Lane } from "@/types";

import type { QueueAgent, QueueApplication } from "@/lib/queue/types";

import type { SelectFromPoolStrategy } from "./types";

const LANE_PRIORITY: Readonly<Record<Lane, number>> = {
  mismatch: 0,
  review: 1,
  match: 99,
};

export const selectFifo: SelectFromPoolStrategy = (
  pool: ReadonlyArray<QueueApplication>,
  _agent: QueueAgent,
): QueueApplication | null => {
  const eligible = pool.filter((a) => a.verification.lane !== "match");
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    const laneDelta =
      LANE_PRIORITY[a.verification.lane] - LANE_PRIORITY[b.verification.lane];
    if (laneDelta !== 0) return laneDelta;
    if (a.receivedAt < b.receivedAt) return -1;
    if (a.receivedAt > b.receivedAt) return 1;
    return 0;
  });

  return sorted[0] ?? null;
};
