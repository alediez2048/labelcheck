/**
 * `distribute` tests (P2-3).
 *
 * One pass across `available` agents drains the pool to capacity;
 * `applied: true` discriminates from the P2-2 stub. Match-lane rows
 * are never touched; OOO agents are skipped; the summary counts are
 * exact.
 */

import { describe, expect, it } from "vitest";

import {
  BASELINE_MATCH_RATE,
  DEFAULT_CURRENT_AGENT_ID,
  SEED_AGENTS,
  SEED_APPLICATIONS,
  SEED_AUDIT_EVENTS,
} from "@/lib/queue/fixtures";
import type { QueueStoreState } from "@/lib/queue/types";

import { distribute } from "../distribute";

function seed(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    currentAgentId: DEFAULT_CURRENT_AGENT_ID,
    baselineMatchRate: BASELINE_MATCH_RATE,
    auditEvents: SEED_AUDIT_EVENTS,
  };
}

describe("distribute", () => {
  it("returns applied: true (real router, not the stub)", () => {
    const { summary } = distribute(seed());
    expect(summary.applied).toBe(true);
  });

  it("assigns one item per available agent in a single pass", () => {
    // Seed has 3 unclaimed exceptions and 2 available agents (Marcus,
    // Priya); River is OOO. One pass → 2 assigned, 1 left in pool.
    const { state, summary } = distribute(seed(), {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(summary.assignedCount).toBe(2);
    const remainingPool = state.applications.filter(
      (a) => a.assignedAgentId === null && a.verification.lane !== "match",
    );
    expect(remainingPool.length).toBe(1);
  });

  it("byAgentId records each agent's exact share", () => {
    const { summary } = distribute(seed(), {
      now: () => "2026-06-15T10:00:00Z",
    });
    const total = Object.values(summary.byAgentId).reduce(
      (s, n) => s + n,
      0,
    );
    expect(total).toBe(summary.assignedCount);
    expect(summary.byAgentId["agent-marcus"]).toBe(1);
    expect(summary.byAgentId["agent-priya"]).toBe(1);
  });

  it("skips out-of-office agents (no entry in byAgentId)", () => {
    const { summary } = distribute(seed());
    expect(summary.byAgentId["agent-river"]).toBeUndefined();
  });

  it("never touches match-lane applications", () => {
    const before = seed();
    const matchIdsBefore = before.applications
      .filter((a) => a.verification.lane === "match")
      .map((a) => ({
        id: a.applicationId,
        assignedAgentId: a.assignedAgentId,
        claimedAt: a.claimedAt,
      }));
    const { state } = distribute(before);
    for (const before of matchIdsBefore) {
      const after = state.applications.find((a) => a.applicationId === before.id);
      expect(after?.assignedAgentId).toBe(before.assignedAgentId);
      expect(after?.claimedAt).toBe(before.claimedAt);
    }
  });

  it("partial when capacity is short — assignedCount == min(available, pool)", () => {
    // Cap the pool at one item: pre-claim two of the three exceptions.
    const state = seed();
    const preClaimed: QueueStoreState = {
      ...state,
      applications: state.applications.map((a) => {
        if (
          a.assignedAgentId === null &&
          a.verification.lane !== "match" &&
          // leave only cedar-ridge unclaimed
          a.applicationId !== "cedar-ridge-reserve-001"
        ) {
          return {
            ...a,
            assignedAgentId: "admin-sasha", // park them off-agent
            claimedAt: "2026-06-15T09:00:00Z",
          };
        }
        return a;
      }),
    };
    const { summary } = distribute(preClaimed);
    expect(summary.assignedCount).toBe(1);
  });

  it("clears the pool when capacity is sufficient (all available agents claim)", () => {
    // Add a synthetic third unclaimed exception so the seed's 3-pool
    // matches the 2 available agents + 1 leftover; bump available
    // agents to 3 to drain it completely.
    const state = seed();
    const drained: QueueStoreState = {
      ...state,
      agents: state.agents.map((a) =>
        a.id === "agent-river" ? { ...a, availability: "available" as const } : a,
      ),
    };
    const { state: next, summary } = distribute(drained);
    expect(summary.assignedCount).toBe(3);
    const remaining = next.applications.filter(
      (a) => a.assignedAgentId === null && a.verification.lane !== "match",
    );
    expect(remaining.length).toBe(0);
  });
});
