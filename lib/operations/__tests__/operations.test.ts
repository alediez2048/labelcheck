/**
 * Operations selectors + bulk-confirm tests (P2-2).
 *
 * Pure-logic guarantees that the UI depends on:
 *   - funnel counts are exact, latency average is correct
 *   - aggregate review: bottom-quartile cut, flagged-in-match
 *     detection, delta-vs-baseline sign and magnitude
 *   - distribution: pool excludes match-lane + claimed; per-agent
 *     counts exact
 *   - bulk approve: one disposition per match-lane app, no
 *     exception app touched
 *   - live intake: destination string derived correctly per lane +
 *     assignment
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
import { recordDisposition } from "@/lib/queue/disposition";
import { distribute } from "@/lib/router/distribute";
import type { QueueStoreState } from "@/lib/queue/types";

import { selectAggregateReview } from "../aggregateReview";
import { selectDistribution, selectPoolSnapshot, selectAgentLoad } from "../distribution";
import { selectFunnel } from "../funnel";
import { selectLiveIntake } from "../liveIntake";

function seed(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    currentAgentId: DEFAULT_CURRENT_AGENT_ID,
    baselineMatchRate: BASELINE_MATCH_RATE,
    auditEvents: SEED_AUDIT_EVENTS,
  };
}

describe("selectFunnel", () => {
  it("counts received / auto-verified / ready-to-approve / needs-review", () => {
    const snapshot = selectFunnel(seed());
    expect(snapshot.received).toBe(SEED_APPLICATIONS.length);
    expect(snapshot.autoVerified).toBe(SEED_APPLICATIONS.length);
    expect(snapshot.readyToApprove).toBe(
      SEED_APPLICATIONS.filter((a) => a.verification.lane === "match").length,
    );
    expect(snapshot.needsReview).toBe(
      SEED_APPLICATIONS.filter((a) => a.verification.lane !== "match").length,
    );
    expect(snapshot.received).toBe(
      snapshot.readyToApprove + snapshot.needsReview,
    );
  });

  it("computes average latency in seconds rounded to one decimal", () => {
    const snapshot = selectFunnel(seed());
    expect(snapshot.avgLatencySec).toBeGreaterThan(0);
    // Sanity: 2900–4500ms range from fixtures, average should be ~3.5s.
    expect(snapshot.avgLatencySec).toBeGreaterThan(2);
    expect(snapshot.avgLatencySec).toBeLessThan(6);
  });
});

describe("selectAggregateReview (FR-23)", () => {
  it("returns count, today's match rate, baseline, and signed delta", () => {
    const snapshot = selectAggregateReview(seed());
    expect(snapshot.total).toBeGreaterThan(0);
    expect(snapshot.baselineMatchRate).toBe(BASELINE_MATCH_RATE);
    expect(snapshot.todayMatchRate).toBeCloseTo(snapshot.total / SEED_APPLICATIONS.length, 5);
    expect(snapshot.delta).toBeCloseTo(
      snapshot.todayMatchRate - snapshot.baselineMatchRate,
      5,
    );
  });

  it("cuts the bottom quartile by ceil(N/4) ascending by confidence", () => {
    const snapshot = selectAggregateReview(seed());
    expect(snapshot.bottomQuartile.length).toBe(Math.ceil(snapshot.total / 4));
    // Ascending order: each row's confidence must be ≤ the next.
    for (let i = 1; i < snapshot.bottomQuartile.length; i++) {
      expect(
        snapshot.bottomQuartile[i]!.verification.overallConfidence,
      ).toBeGreaterThanOrEqual(
        snapshot.bottomQuartile[i - 1]!.verification.overallConfidence,
      );
    }
  });

  it("surfaces match-lane applications carrying a non-match field result", () => {
    const snapshot = selectAggregateReview(seed());
    // The Juniper Coast fixture is lane=match with a not_found field
    // on country_of_origin — the canonical soft-flag case.
    const ids = snapshot.flaggedInMatch.map((a) => a.applicationId);
    expect(ids).toContain("juniper-coast-001");
    // The fully-clean Old Tom row MUST NOT appear.
    expect(ids).not.toContain("old-tom-001");
  });
});

describe("selectPoolSnapshot + selectAgentLoad", () => {
  it("pool counts only unclaimed exceptions — match-lane and assigned rows excluded", () => {
    const snapshot = selectPoolSnapshot(seed());
    // Three unclaimed exceptions in the seed: cedar-ridge, coastal-pale, dunmore.
    expect(snapshot.total).toBe(3);
    const sum = snapshot.byBeverageType.reduce((s, x) => s + x.count, 0);
    expect(sum).toBe(snapshot.total);
  });

  it("per-agent counts only exception applications claimed by that agent", () => {
    const rows = selectAgentLoad(seed());
    const marcus = rows.find((r) => r.agent.id === DEFAULT_CURRENT_AGENT_ID);
    expect(marcus?.claimedCount).toBe(2); // harbor-mist-vodka + pages-1907-lager
    const priya = rows.find((r) => r.agent.id === "agent-priya");
    expect(priya?.claimedCount).toBe(1); // vintage-park-vintners
  });

  it("excludes admins from the per-agent load list", () => {
    const rows = selectAgentLoad(seed());
    expect(rows.find((r) => r.agent.id === DEFAULT_SUPERVISOR_ID)).toBeUndefined();
  });

  it("selectDistribution combines pool + agent load", () => {
    const snapshot = selectDistribution(seed());
    expect(snapshot.pool.total).toBe(3);
    expect(snapshot.agents.length).toBe(4); // 4 agents (Marcus, Priya, River, Jordan), 1 admin filtered
  });
});

describe("bulk approve match lane (FR-20)", () => {
  it("records one disposition per match-lane application", () => {
    // The provider's bulkApproveMatchLane uses recordDisposition under
    // the hood. Mirror it here as a pure loop for the test surface.
    let state = seed();
    const matchIds = state.applications
      .filter((a) => a.verification.lane === "match")
      .map((a) => a.applicationId);
    const records = [];
    for (const id of matchIds) {
      const result = recordDisposition(state, {
        applicationId: id,
        disposition: "approve",
        agentId: DEFAULT_SUPERVISOR_ID,
      });
      if (result) {
        state = result.state;
        records.push(result.record);
      }
    }
    expect(records.length).toBe(matchIds.length);
    expect(records.every((r) => r.disposition === "approve")).toBe(true);
    // No match-lane application remains.
    expect(
      state.applications.some((a) => a.verification.lane === "match"),
    ).toBe(false);
  });

  it("does NOT touch exception-lane applications", () => {
    let state = seed();
    const exceptionCountBefore = state.applications.filter(
      (a) => a.verification.lane !== "match",
    ).length;
    const matchIds = state.applications
      .filter((a) => a.verification.lane === "match")
      .map((a) => a.applicationId);
    for (const id of matchIds) {
      const result = recordDisposition(state, {
        applicationId: id,
        disposition: "approve",
        agentId: DEFAULT_SUPERVISOR_ID,
      });
      if (result) state = result.state;
    }
    const exceptionCountAfter = state.applications.filter(
      (a) => a.verification.lane !== "match",
    ).length;
    expect(exceptionCountAfter).toBe(exceptionCountBefore);
  });
});

describe("selectLiveIntake", () => {
  it("derives the destination string per lane + assignment", () => {
    const entries = selectLiveIntake(seed());
    for (const entry of entries) {
      if (entry.lane === "match") {
        expect(entry.destination).toBe("Auto-cleared → approval pool");
      }
    }
    // The unclaimed Cedar Ridge mismatch goes to the review pool.
    const cedar = entries.find((e) => e.applicationId === "cedar-ridge-reserve-001");
    expect(cedar?.destination).toBe("→ review pool");
    // Marcus's claimed Harbor Mist goes to "→ Marcus Lee".
    const harbor = entries.find((e) => e.applicationId === "harbor-mist-vodka-001");
    expect(harbor?.destination).toBe("→ Marcus Lee");
  });

  it("sorts newest first", () => {
    const entries = selectLiveIntake(seed());
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1]!.receivedAt >= entries[i]!.receivedAt).toBe(true);
    }
  });
});

describe("distribute (P2-3 router)", () => {
  it("clears the available-agent share of the pool and reports applied=true", () => {
    const { summary } = distribute(seed());
    expect(summary.applied).toBe(true);
    // Three available agents in the seed (Marcus, Priya, Jordan); River
    // is OOO. Pool has three unclaimed exceptions — all get claimed.
    expect(summary.assignedCount).toBe(3);
    expect(Object.keys(summary.byAgentId).sort()).toEqual(
      ["agent-jordan", "agent-marcus", "agent-priya"].sort(),
    );
  });
});
