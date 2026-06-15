/**
 * Distribute the shared pool across available agents (P2-3).
 *
 * Replaces the P2-2 stub. One pass through the available-agent list:
 * each `available` agent with `role === "agent"` gets one claim
 * attempt; the loop stops when the pool is empty or no remaining
 * agent can claim. The P2-4 specialization-aware strategy will mean
 * an agent with no matching pool item simply gets nothing this pass
 * — overflow handling lives there, not here.
 *
 * Returns `applied: true` to discriminate this real run from the P2-2
 * stub's `applied: false`; the Operations view uses it to swap the
 * toast copy between "router queued for P2-3" and "router applied N".
 */

import type { QueueStoreState } from "@/lib/queue/types";

import { claimNext } from "./claim";
import type { DistributeSummary, SelectFromPoolStrategy } from "./types";

type Options = {
  now?: () => string;
  strategy?: SelectFromPoolStrategy;
};

export function distribute(
  state: QueueStoreState,
  options: Options = {},
): { state: QueueStoreState; summary: DistributeSummary } {
  const availableAgents = state.agents.filter(
    (a) => a.role === "agent" && a.availability === "available",
  );

  let nextState = state;
  const byAgentId: Record<string, number> = {};
  let assignedCount = 0;

  for (const agent of availableAgents) {
    const result = claimNext(nextState, agent.id, options);
    if (result === null) continue;
    nextState = result.state;
    byAgentId[agent.id] = (byAgentId[agent.id] ?? 0) + 1;
    assignedCount += 1;
  }

  return {
    state: nextState,
    summary: { assignedCount, byAgentId, applied: true },
  };
}
