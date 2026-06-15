/**
 * Review-distribution selectors (P2-2, mockup.md Operations).
 *
 * Two related views:
 *   - Shared pool counts split by beverage type — the supervisor's
 *     "what's waiting to be pulled" pulse.
 *   - Per-agent load — claimed exception count + specialization
 *     pill so the supervisor can spot uneven distribution and
 *     trigger a Distribute pass.
 *
 * Match-lane applications NEVER enter either view — they belong on
 * the match-lane approval panel (D11; D15; CONTEXT.md Work pool).
 */

import type { BeverageType } from "@/types";

import type { QueueAgent, QueueStoreState } from "@/lib/queue/types";

const BEVERAGE_TYPES: ReadonlyArray<BeverageType> = [
  "wine",
  "distilled_spirits",
  "malt_beverage",
];

export type PoolSnapshot = {
  total: number;
  byBeverageType: ReadonlyArray<{ type: BeverageType; count: number }>;
};

export type AgentLoadRow = {
  agent: QueueAgent;
  claimedCount: number;
};

export type DistributionSnapshot = {
  pool: PoolSnapshot;
  agents: ReadonlyArray<AgentLoadRow>;
};

export function selectPoolSnapshot(state: QueueStoreState): PoolSnapshot {
  const poolApps = state.applications.filter(
    (a) =>
      a.assignedAgentId === null && a.verification.lane !== "match",
  );
  return {
    total: poolApps.length,
    byBeverageType: BEVERAGE_TYPES.map((type) => ({
      type,
      count: poolApps.filter((a) => a.beverageType === type).length,
    })),
  };
}

/**
 * Per-agent load — only agents (not admins). Counts exception-lane
 * applications claimed by the agent; match-lane never counts.
 */
export function selectAgentLoad(
  state: QueueStoreState,
): ReadonlyArray<AgentLoadRow> {
  return state.agents
    .filter((a) => a.role === "agent")
    .map((agent) => ({
      agent,
      claimedCount: state.applications.filter(
        (a) =>
          a.assignedAgentId === agent.id &&
          a.verification.lane !== "match",
      ).length,
    }));
}

export function selectDistribution(
  state: QueueStoreState,
): DistributionSnapshot {
  return {
    pool: selectPoolSnapshot(state),
    agents: selectAgentLoad(state),
  };
}
