/**
 * Routing distribute seam (P2-2 stub; P2-3 fills the body).
 *
 * The Operations view's Distribute action calls into this function
 * to spread the shared exception pool across specialised agents.
 * P2-3 (Work router) owns the actual policy — specialization match,
 * load balancing, availability — and exports the same function
 * shape this stub does so the route module doesn't change when the
 * real implementation lands.
 *
 * The stub is intentionally a no-op that returns the count of items
 * that WOULD be distributed. The Operations view surfaces that
 * count back to the supervisor so the action's effect is visible
 * even before P2-3 ships.
 */

import type { QueueStoreState } from "@/lib/queue/types";

export type DistributeResult = {
  /** How many pool items would be assigned in a real run. */
  pendingCount: number;
  /**
   * Whether the router actually ran. False until P2-3 lands. The UI
   * uses this to show a "queued for P2-3 router" badge instead of
   * silently no-op'ing.
   */
  applied: boolean;
};

export function distribute(state: QueueStoreState): DistributeResult {
  const pendingCount = state.applications.filter(
    (a) => a.assignedAgentId === null && a.verification.lane !== "match",
  ).length;
  return { pendingCount, applied: false };
}
