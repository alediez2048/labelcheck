/**
 * Distribute the shared pool across available agents (P2-3 + P2-4).
 *
 * One pass through the available-agent list: each `available` agent
 * with `role === "agent"` gets one claim attempt; the loop stops when
 * the pool is empty or no remaining agent can claim. The default
 * strategy is `selectBySpecialization` (P2-4), so the per-pass split
 * between specialist matches and overflow lives in the summary.
 *
 * `applied: true` discriminates this real run from the P2-2 stub's
 * `applied: false`; the Operations view uses it to swap the toast copy
 * between "router queued" and "router applied N".
 *
 * The specialist/overflow counters are derived per-claim from the
 * agent's `specializations` and the claimed item's `beverageType` —
 * `specialistMatches` is the count where the agent's specializations
 * include the type, `overflowMatches` is the rest. A generalist agent
 * (empty specializations) always increments `overflowMatches`.
 */

import { requireAdmin } from "@/lib/auth/scope";
import type { QueueStoreState } from "@/lib/queue/types";

import { claimNext } from "./claim";
import type {
  AssignActor,
  DistributeSummary,
  SelectFromPoolStrategy,
} from "./types";

type Options = {
  now?: () => string;
  strategy?: SelectFromPoolStrategy;
};

export function distribute(
  state: QueueStoreState,
  actor: AssignActor,
  options: Options = {},
): { state: QueueStoreState; summary: DistributeSummary } {
  requireAdmin(actor);

  const availableAgents = state.agents.filter(
    (a) => a.role === "agent" && a.availability === "available",
  );

  let nextState = state;
  const byAgentId: Record<string, number> = {};
  let assignedCount = 0;
  let specialistMatches = 0;
  let overflowMatches = 0;

  for (const agent of availableAgents) {
    const result = claimNext(nextState, agent.id, options);
    if (result === null) continue;
    nextState = result.state;
    byAgentId[agent.id] = (byAgentId[agent.id] ?? 0) + 1;
    assignedCount += 1;
    if (agent.specializations.includes(result.application.beverageType)) {
      specialistMatches += 1;
    } else {
      overflowMatches += 1;
    }
  }

  return {
    state: nextState,
    summary: {
      assignedCount,
      byAgentId,
      specialistMatches,
      overflowMatches,
      applied: true,
    },
  };
}
