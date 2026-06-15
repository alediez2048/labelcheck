/**
 * `admitToPool` tests (P2-3).
 *
 * Match-lane rejection, idempotence on already-pooled exceptions, and
 * clearing a prior claim (which writes an "override" audit event).
 */

import { describe, expect, it } from "vitest";

import {
  BASELINE_MATCH_RATE,
  DEFAULT_CURRENT_AGENT_ID,
  DEFAULT_SUPERVISOR_ID,
  SEED_AGENTS,
  SEED_APPLICATIONS,
  SEED_AUDIT_EVENTS,
} from "@/lib/queue/fixtures";
import type { QueueStoreState } from "@/lib/queue/types";

import { admitToPool } from "../admit";
import { RouterError } from "../types";

function seed(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    dispositionedApplications: [],
    currentAgentId: DEFAULT_CURRENT_AGENT_ID,
    baselineMatchRate: BASELINE_MATCH_RATE,
    auditEvents: SEED_AUDIT_EVENTS,
  };
}

describe("admitToPool", () => {
  it("throws match_lane_rejected for a match-lane application", () => {
    try {
      admitToPool(seed(), "old-tom-001");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("match_lane_rejected");
    }
  });

  it("throws application_not_found when the id is unknown", () => {
    try {
      admitToPool(seed(), "does-not-exist");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("application_not_found");
    }
  });

  it("is idempotent on an already-pooled mismatch", () => {
    // cedar-ridge-reserve-001 is seeded as an unclaimed mismatch.
    const state = seed();
    const next = admitToPool(state, "cedar-ridge-reserve-001");
    expect(next).toBe(state);
  });

  it("is idempotent on an already-pooled review item", () => {
    // dunmore-single-malt-001 is seeded as an unclaimed review item.
    const state = seed();
    const next = admitToPool(state, "dunmore-single-malt-001");
    expect(next).toBe(state);
  });

  it("clears a prior claim and writes an override audit event", () => {
    // harbor-mist-vodka-001 is seeded as claimed by Marcus.
    const state = seed();
    const next = admitToPool(state, "harbor-mist-vodka-001", {
      now: () => "2026-06-15T11:00:00Z",
      actorId: DEFAULT_SUPERVISOR_ID,
    });
    const cleared = next.applications.find(
      (a) => a.applicationId === "harbor-mist-vodka-001",
    );
    expect(cleared?.assignedAgentId).toBeNull();
    expect(cleared?.claimedAt).toBeNull();
    expect(next.auditEvents.length).toBe(state.auditEvents.length + 1);
    const event = next.auditEvents[next.auditEvents.length - 1]!;
    expect(event.eventType).toBe("override");
    expect(event.applicationId).toBe("harbor-mist-vodka-001");
    expect(event.metadata?.from).toBe(DEFAULT_CURRENT_AGENT_ID);
    expect(event.metadata?.to).toBeNull();
  });
});
