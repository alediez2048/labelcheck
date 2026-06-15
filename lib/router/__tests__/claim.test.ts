/**
 * Router `claimNext` tests (P2-3).
 *
 * Verifies the priority order (mismatch before review, then receivedAt
 * ASC), availability gating, item removal from the pool on claim,
 * sequential claims by two agents pick different items, and the
 * audit-event emission.
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

import { claimNext } from "../claim";

function seed(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    currentAgentId: DEFAULT_CURRENT_AGENT_ID,
    baselineMatchRate: BASELINE_MATCH_RATE,
    auditEvents: SEED_AUDIT_EVENTS,
  };
}

describe("router.claimNext", () => {
  it("claims a mismatch ahead of any review item", () => {
    const result = claimNext(seed(), DEFAULT_CURRENT_AGENT_ID, {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.application.verification.lane).toBe("mismatch");
  });

  it("within a lane, picks the oldest receivedAt first", () => {
    // Seed mismatch pool: cedar-ridge (08:25) and coastal-pale (08:30).
    const result = claimNext(seed(), DEFAULT_CURRENT_AGENT_ID, {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(result?.application.applicationId).toBe("cedar-ridge-reserve-001");
  });

  it("sets assignedAgentId and claimedAt atomically", () => {
    const result = claimNext(seed(), DEFAULT_CURRENT_AGENT_ID, {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(result?.application.assignedAgentId).toBe(DEFAULT_CURRENT_AGENT_ID);
    expect(result?.application.claimedAt).toBe("2026-06-15T10:00:00Z");
  });

  it("returns null for an out-of-office agent", () => {
    // agent-river is out_of_office in the seed.
    const result = claimNext(seed(), "agent-river");
    expect(result).toBeNull();
  });

  it("returns null when the agent id is unknown", () => {
    const result = claimNext(seed(), "ghost-agent");
    expect(result).toBeNull();
  });

  it("removes the claimed item from the pool", () => {
    const state = seed();
    const result = claimNext(state, DEFAULT_CURRENT_AGENT_ID, {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    const next = result.state;
    const stillPool = next.applications.filter(
      (a) => a.assignedAgentId === null && a.verification.lane !== "match",
    );
    expect(stillPool.some((a) => a.applicationId === result.application.applicationId)).toBe(false);
  });

  it("two sequential claims for two agents pick different items", () => {
    const state = seed();
    const first = claimNext(state, "agent-marcus", {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(first).not.toBeNull();
    if (!first) return;
    const second = claimNext(first.state, "agent-priya", {
      now: () => "2026-06-15T10:01:00Z",
    });
    expect(second).not.toBeNull();
    if (!second) return;
    expect(first.application.applicationId).not.toBe(second.application.applicationId);
  });

  it("emits exactly one 'assigned' audit event per claim", () => {
    const state = seed();
    const result = claimNext(state, DEFAULT_CURRENT_AGENT_ID, {
      now: () => "2026-06-15T10:00:00Z",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.state.auditEvents.length).toBe(state.auditEvents.length + 1);
    const event = result.state.auditEvents[result.state.auditEvents.length - 1]!;
    expect(event.eventType).toBe("assigned");
    expect(event.actorId).toBe(DEFAULT_CURRENT_AGENT_ID);
    expect(event.applicationId).toBe(result.application.applicationId);
    expect(event.occurredAt).toBe("2026-06-15T10:00:00Z");
  });

  it("never claims a match-lane application", () => {
    // Empty the exception pool, then claim should return null.
    const state = seed();
    const onlyMatches: QueueStoreState = {
      ...state,
      applications: state.applications.map((a) =>
        a.assignedAgentId === null && a.verification.lane !== "match"
          ? { ...a, assignedAgentId: "agent-priya", claimedAt: "2026-06-15T09:00:00Z" }
          : a,
      ),
    };
    const result = claimNext(onlyMatches, DEFAULT_CURRENT_AGENT_ID);
    expect(result).toBeNull();
  });

  it("supports a strategy override (P2-4 seam)", () => {
    // Use a stub strategy that always picks the review item to prove
    // the parameter is actually consumed and overrides the default.
    const state = seed();
    const result = claimNext(state, DEFAULT_CURRENT_AGENT_ID, {
      now: () => "2026-06-15T10:00:00Z",
      strategy: (pool) =>
        pool.find((p) => p.verification.lane === "review") ?? null,
    });
    expect(result?.application.verification.lane).toBe("review");
  });
});
