/**
 * Specialization-aware selection strategy (P2-4, D15, FR-28).
 *
 * Two-step pick:
 *   1. Specialist match — the highest-priority pool item whose
 *      `beverageType` is in `agent.specializations`.
 *   2. Overflow — if no specialist match (or the agent is a generalist
 *      with an empty `specializations` array), the highest-priority
 *      pool item regardless of type.
 *
 * Priority order is the same shape as `selectFifo`: mismatch lane
 * before review lane, then `receivedAt` ASC. The match lane is
 * defensively skipped — the pool already excludes it upstream
 * (`claim.ts`), but the strategy refuses to return one even if the
 * caller is wrong (D11, D15).
 *
 * Why overflow lives here, not in the caller: D15 forbids hard
 * specialty partitions because a thin specialty (e.g., one malt
 * specialist, OOO today) would stall the pool. The strategy itself
 * owns the fallback so every call site picks it up automatically.
 *
 * Generalist semantics: an empty `specializations` array means "no
 * specialty"; step 1 finds nothing and the strategy goes straight to
 * step 2. From a generalist's perspective the entire pool is overflow,
 * which is exactly what `distribute`'s `overflowMatches` counter wants
 * to surface.
 */

import type { Lane } from "@/types";

import type { QueueAgent, QueueApplication } from "@/lib/queue/types";

import type { SelectFromPoolStrategy } from "./types";

const LANE_PRIORITY: Readonly<Record<Lane, number>> = {
  mismatch: 0,
  review: 1,
  match: 99,
};

function prioritySort(
  pool: ReadonlyArray<QueueApplication>,
): ReadonlyArray<QueueApplication> {
  const eligible = pool.filter((a) => a.verification.lane !== "match");
  if (eligible.length === 0) return eligible;

  return [...eligible].sort((a, b) => {
    const laneDelta =
      LANE_PRIORITY[a.verification.lane] - LANE_PRIORITY[b.verification.lane];
    if (laneDelta !== 0) return laneDelta;
    if (a.receivedAt < b.receivedAt) return -1;
    if (a.receivedAt > b.receivedAt) return 1;
    return 0;
  });
}

export const selectBySpecialization: SelectFromPoolStrategy = (
  pool: ReadonlyArray<QueueApplication>,
  agent: QueueAgent,
): QueueApplication | null => {
  const sorted = prioritySort(pool);
  if (sorted.length === 0) return null;

  // Step 1: specialist match. A generalist (empty specializations) has
  // no matches by construction and falls through to step 2.
  if (agent.specializations.length > 0) {
    const specialist =
      sorted.find((item) =>
        agent.specializations.includes(item.beverageType),
      ) ?? null;
    if (specialist !== null) return specialist;
  }

  // Step 2: overflow — first item in priority order regardless of type.
  return sorted[0] ?? null;
};
