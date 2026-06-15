/**
 * `setSpecialization` tests (P2-4, D16, FR-28).
 *
 * Admin-only gate, mutation semantics, audit-event metadata, and the
 * invariant that currently-claimed items are NOT touched.
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

import { setSpecialization } from "../setSpecialization";
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

describe("setSpecialization", () => {
  it("admin actor replaces the agent's specializations array", () => {
    const next = setSpecialization(
      seed(),
      "agent-marcus",
      ["wine", "malt_beverage"],
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const updated = next.agents.find((a) => a.id === "agent-marcus");
    expect(updated?.specializations).toEqual(["wine", "malt_beverage"]);
  });

  it("non-admin actor throws RouterError('not_admin')", () => {
    try {
      setSpecialization(
        seed(),
        "agent-marcus",
        ["wine"],
        { id: "agent-marcus", role: "agent" },
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("not_admin");
    }
  });

  it("empty array makes the agent a generalist", () => {
    const next = setSpecialization(
      seed(),
      "agent-marcus",
      [],
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const updated = next.agents.find((a) => a.id === "agent-marcus");
    expect(updated?.specializations).toEqual([]);
  });

  it("does not touch the agent's currently-claimed applications", () => {
    const state = seed();
    const claimedBeforeIds = state.applications
      .filter((a) => a.assignedAgentId === DEFAULT_CURRENT_AGENT_ID)
      .map((a) => a.applicationId);
    // Sanity: Marcus has at least one claim in the seed.
    expect(claimedBeforeIds.length).toBeGreaterThan(0);

    const next = setSpecialization(
      state,
      DEFAULT_CURRENT_AGENT_ID,
      ["wine"],
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const claimedAfter = next.applications.filter(
      (a) => a.assignedAgentId === DEFAULT_CURRENT_AGENT_ID,
    );
    expect(claimedAfter.map((a) => a.applicationId).sort()).toEqual(
      claimedBeforeIds.slice().sort(),
    );
    // The application objects themselves must be untouched (identity).
    for (const before of state.applications) {
      const after = next.applications.find(
        (a) => a.applicationId === before.applicationId,
      );
      expect(after).toBe(before);
    }
  });

  it("emits an 'override' audit event with previousSpecializations and newSpecializations metadata", () => {
    const state = seed();
    const marcusBefore = state.agents.find((a) => a.id === "agent-marcus");
    const next = setSpecialization(
      state,
      "agent-marcus",
      ["wine"],
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      { now: () => "2026-06-15T14:00:00Z" },
    );
    expect(next.auditEvents.length).toBe(state.auditEvents.length + 1);
    const event = next.auditEvents[next.auditEvents.length - 1]!;
    expect(event.eventType).toBe("override");
    expect(event.actorId).toBe(DEFAULT_SUPERVISOR_ID);
    expect(event.occurredAt).toBe("2026-06-15T14:00:00Z");
    expect(event.metadata?.actorRole).toBe("admin");
    expect(event.metadata?.previousSpecializations).toEqual(
      marcusBefore?.specializations,
    );
    expect(event.metadata?.newSpecializations).toEqual(["wine"]);
  });

  it("throws RouterError('agent_not_found') for a nonexistent agent id", () => {
    try {
      setSpecialization(
        seed(),
        "ghost-agent",
        ["wine"],
        { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("agent_not_found");
    }
  });

  it("copies the input array (defensive — does not retain caller's reference)", () => {
    const state = seed();
    const input: ("wine" | "distilled_spirits" | "malt_beverage")[] = ["wine"];
    const next = setSpecialization(
      state,
      "agent-marcus",
      input,
      { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
    );
    const updated = next.agents.find((a) => a.id === "agent-marcus");
    // The stored array's contents match, but it must NOT be the same
    // reference — otherwise a caller mutating their array would leak
    // into the store.
    expect(updated?.specializations).toEqual(input);
    expect(updated?.specializations).not.toBe(input);
  });
});
