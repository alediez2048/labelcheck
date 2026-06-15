/**
 * `reassign` tests (P2-3).
 *
 * Admin-only gate, `from` validation, return-to-pool clears
 * `claimedAt`, audit-event metadata captures the from/to pair.
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

import { reassign } from "../reassign";
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

describe("reassign", () => {
  it("non-admin actor throws not_admin", () => {
    try {
      reassign(
        seed(),
        "harbor-mist-vodka-001",
        DEFAULT_CURRENT_AGENT_ID,
        "agent-priya",
        { id: "agent-marcus", role: "agent" },
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("not_admin");
    }
  });

  it("admin moves A → B and preserves claimedAt", () => {
    const state = seed();
    const original = state.applications.find(
      (a) => a.applicationId === "harbor-mist-vodka-001",
    );
    const next = reassign(
      state,
      "harbor-mist-vodka-001",
      DEFAULT_CURRENT_AGENT_ID,
      "agent-priya",
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const updated = next.applications.find(
      (a) => a.applicationId === "harbor-mist-vodka-001",
    );
    expect(updated?.assignedAgentId).toBe("agent-priya");
    expect(updated?.claimedAt).toBe(original?.claimedAt);
  });

  it("from must match — mismatch throws from_agent_mismatch", () => {
    try {
      reassign(
        seed(),
        "harbor-mist-vodka-001",
        "agent-priya", // actual owner is Marcus
        "agent-river",
        { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("from_agent_mismatch");
    }
  });

  it("toAgentId === null returns the item to the pool and clears claimedAt", () => {
    const next = reassign(
      seed(),
      "harbor-mist-vodka-001",
      DEFAULT_CURRENT_AGENT_ID,
      null,
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const updated = next.applications.find(
      (a) => a.applicationId === "harbor-mist-vodka-001",
    );
    expect(updated?.assignedAgentId).toBeNull();
    expect(updated?.claimedAt).toBeNull();
  });

  it("emits an 'override' audit event with from/to metadata", () => {
    const state = seed();
    const next = reassign(
      state,
      "harbor-mist-vodka-001",
      DEFAULT_CURRENT_AGENT_ID,
      "agent-priya",
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      { now: () => "2026-06-15T13:00:00Z" },
    );
    expect(next.auditEvents.length).toBe(state.auditEvents.length + 1);
    const event = next.auditEvents[next.auditEvents.length - 1]!;
    expect(event.eventType).toBe("override");
    expect(event.actorId).toBe(DEFAULT_SUPERVISOR_ID);
    expect(event.metadata?.from).toBe(DEFAULT_CURRENT_AGENT_ID);
    expect(event.metadata?.to).toBe("agent-priya");
    expect(event.occurredAt).toBe("2026-06-15T13:00:00Z");
  });

  it("return-to-pool emits an override event with to:null", () => {
    const next = reassign(
      seed(),
      "harbor-mist-vodka-001",
      DEFAULT_CURRENT_AGENT_ID,
      null,
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const event = next.auditEvents[next.auditEvents.length - 1]!;
    expect(event.metadata?.to).toBeNull();
  });

  it("throws application_not_found for unknown ids", () => {
    try {
      reassign(seed(), "ghost-app", "agent-marcus", "agent-priya", {
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
