/**
 * `handAssign` tests (P2-3).
 *
 * Admin-only gate, claimed_at semantics on previously-unclaimed vs
 * previously-claimed targets, audit-event metadata.
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

import { handAssign } from "../handAssign";
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

describe("handAssign", () => {
  it("non-admin actor throws not_admin", () => {
    try {
      handAssign(seed(), "cedar-ridge-reserve-001", "agent-priya", {
        id: "agent-marcus",
        role: "agent",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("not_admin");
    }
  });

  it("admin sets assignedAgentId and claimedAt for a previously-unclaimed item", () => {
    // cedar-ridge-reserve-001 is unclaimed in the seed.
    const next = handAssign(
      seed(),
      "cedar-ridge-reserve-001",
      "agent-priya",
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      { now: () => "2026-06-15T11:30:00Z" },
    );
    const updated = next.applications.find(
      (a) => a.applicationId === "cedar-ridge-reserve-001",
    );
    expect(updated?.assignedAgentId).toBe("agent-priya");
    expect(updated?.claimedAt).toBe("2026-06-15T11:30:00Z");
  });

  it("admin preserves claimedAt when reassigning an already-claimed item", () => {
    // harbor-mist-vodka-001 was claimed by Marcus at 09:10.
    const state = seed();
    const original = state.applications.find(
      (a) => a.applicationId === "harbor-mist-vodka-001",
    );
    const next = handAssign(
      state,
      "harbor-mist-vodka-001",
      "agent-priya",
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      { now: () => "2026-06-15T12:00:00Z" },
    );
    const updated = next.applications.find(
      (a) => a.applicationId === "harbor-mist-vodka-001",
    );
    expect(updated?.assignedAgentId).toBe("agent-priya");
    expect(updated?.claimedAt).toBe(original?.claimedAt);
    expect(updated?.claimedAt).not.toBe("2026-06-15T12:00:00Z");
  });

  it("emits an 'assigned' audit event with previousAssignee metadata", () => {
    const state = seed();
    const next = handAssign(
      state,
      "harbor-mist-vodka-001",
      "agent-priya",
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      { now: () => "2026-06-15T12:00:00Z" },
    );
    expect(next.auditEvents.length).toBe(state.auditEvents.length + 1);
    const event = next.auditEvents[next.auditEvents.length - 1]!;
    expect(event.eventType).toBe("assigned");
    expect(event.actorId).toBe(DEFAULT_SUPERVISOR_ID);
    expect(event.metadata?.actorRole).toBe("admin");
    expect(event.metadata?.previousAssignee).toBe(DEFAULT_CURRENT_AGENT_ID);
  });

  it("rejects match-lane applications", () => {
    try {
      handAssign(seed(), "old-tom-001", "agent-priya", {
        id: DEFAULT_SUPERVISOR_ID,
        role: "admin",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("match_lane_rejected");
    }
  });

  it("throws application_not_found for unknown ids", () => {
    try {
      handAssign(seed(), "ghost-app", "agent-priya", {
        id: DEFAULT_SUPERVISOR_ID,
        role: "admin",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("application_not_found");
    }
  });
});
