/**
 * Analytics selector tests (P2-6).
 *
 * The Analytics dashboard is read-only over fixtures, so the selector
 * surface is where correctness lives. Every test pins a deterministic
 * `now` so the date math doesn't drift across CI runs.
 *
 * Reference date is 2026-06-15T12:00:00Z (matches the active-queue
 * fixtures + the historical seed). The seed covers the eight weeks
 * leading up to that day; week / month windows are anchored on it.
 */

import { describe, expect, it } from "vitest";

import {
  BASELINE_MATCH_RATE,
  DEFAULT_CURRENT_AGENT_ID,
  DEFAULT_SUPERVISOR_ID,
  SEED_AGENTS,
  SEED_APPLICATIONS,
  SEED_AUDIT_EVENTS,
  SEED_DISPOSITIONED_APPLICATIONS,
} from "@/lib/queue/fixtures";
import type { QueueStoreState } from "@/lib/queue/types";

import {
  agentKpis,
  divisionKpis,
  recentDecisions,
  throughputByAgent,
  topMismatchReasons,
  triageBreakdown,
  volumeTrend,
} from "../metrics";

const NOW_MS = Date.parse("2026-06-15T12:00:00Z");

function seed(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    dispositionedApplications: SEED_DISPOSITIONED_APPLICATIONS,
    currentAgentId: DEFAULT_CURRENT_AGENT_ID,
    baselineMatchRate: BASELINE_MATCH_RATE,
    auditEvents: SEED_AUDIT_EVENTS,
  };
}

describe("divisionKpis", () => {
  it("week range counts only the last 7 days of dispositioned rows", () => {
    const snapshot = divisionKpis(seed(), "week", NOW_MS);
    // Week window: 2026-06-08T12:00Z .. 2026-06-15T12:00Z
    // Seeds inside: 06-08 (Meadowlark), 06-11 (Tidewater),
    // 06-12 (Stonebridge), 06-13 (Blue Peak). Wait — let's recompute:
    // strictly > start. 06-08 11:10 < start? start is 06-08 12:00,
    // 06-08T11:10 is before — not included.
    // Inside: 06-11 (Tidewater), 06-12 (Stonebridge), 06-13 (Blue Peak).
    expect(snapshot.processed).toBe(3);
    expect(snapshot.matchRate).toBeGreaterThan(0);
    expect(snapshot.exceptionRate).toBeGreaterThan(0);
    expect(snapshot.matchRate + snapshot.exceptionRate).toBeCloseTo(1, 5);
  });

  it("month range pulls in a larger sample than week", () => {
    const week = divisionKpis(seed(), "week", NOW_MS);
    const month = divisionKpis(seed(), "month", NOW_MS);
    expect(month.processed).toBeGreaterThan(week.processed);
  });

  it("clamps hoursSaved to >= 0", () => {
    const snapshot = divisionKpis(seed(), "month", NOW_MS);
    expect(snapshot.hoursSaved).toBeGreaterThanOrEqual(0);
  });
});

describe("agentKpis", () => {
  it("is a strict subset of division — never exceeds it", () => {
    const month = divisionKpis(seed(), "month", NOW_MS);
    const marcus = agentKpis(seed(), "agent-marcus", "month", NOW_MS);
    expect(marcus.processed).toBeLessThanOrEqual(month.processed);
  });

  it("summing every per-agent processed count + admin work = division processed", () => {
    const month = divisionKpis(seed(), "month", NOW_MS);
    const ids = SEED_AGENTS.map((a) => a.id);
    const perAgentTotal = ids.reduce(
      (sum, id) => sum + agentKpis(seed(), id, "month", NOW_MS).processed,
      0,
    );
    expect(perAgentTotal).toBe(month.processed);
  });

  it("returns zero processed for an unknown agent id", () => {
    const snapshot = agentKpis(seed(), "agent-doesnt-exist", "week", NOW_MS);
    expect(snapshot.processed).toBe(0);
    expect(snapshot.hoursSaved).toBe(0);
  });
});

describe("triageBreakdown", () => {
  it("sums to the division processed count over the same range", () => {
    const month = divisionKpis(seed(), "month", NOW_MS);
    const breakdown = triageBreakdown(seed(), "month", undefined, NOW_MS);
    expect(breakdown.match + breakdown.mismatch + breakdown.review).toBe(
      month.processed,
    );
  });

  it("counts each lane separately", () => {
    const breakdown = triageBreakdown(seed(), "month", undefined, NOW_MS);
    expect(breakdown.match).toBeGreaterThan(0);
    expect(breakdown.mismatch).toBeGreaterThan(0);
    expect(breakdown.review).toBeGreaterThan(0);
  });

  it("agent filter reduces the totals", () => {
    const all = triageBreakdown(seed(), "month", undefined, NOW_MS);
    const marcus = triageBreakdown(seed(), "month", "agent-marcus", NOW_MS);
    const allTotal = all.match + all.mismatch + all.review;
    const marcusTotal = marcus.match + marcus.mismatch + marcus.review;
    expect(marcusTotal).toBeLessThan(allTotal);
  });
});

describe("topMismatchReasons", () => {
  it("groups by field and sorts descending", () => {
    const rows = topMismatchReasons(seed(), "month", undefined, NOW_MS);
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.count).toBeGreaterThanOrEqual(rows[i]!.count);
    }
  });

  it("surfaces alcohol_content and government_warning from the seed", () => {
    const rows = topMismatchReasons(seed(), "month", undefined, NOW_MS);
    const fields = new Set(rows.map((r) => r.field));
    expect(fields.has("alcohol_content")).toBe(true);
    expect(fields.has("government_warning")).toBe(true);
  });

  it("attaches a friendly label to each row", () => {
    const rows = topMismatchReasons(seed(), "month", undefined, NOW_MS);
    for (const r of rows) {
      expect(r.label.length).toBeGreaterThan(0);
    }
  });
});

describe("volumeTrend", () => {
  it("returns exactly N buckets, oldest first", () => {
    const buckets = volumeTrend(seed(), 8, NOW_MS);
    expect(buckets.length).toBe(8);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i - 1]!.weekStart < buckets[i]!.weekStart).toBe(true);
    }
  });

  it("totals across 8 buckets ≤ all dispositioned applications", () => {
    const buckets = volumeTrend(seed(), 8, NOW_MS);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBeLessThanOrEqual(SEED_DISPOSITIONED_APPLICATIONS.length);
    expect(total).toBeGreaterThan(0);
  });
});

describe("throughputByAgent", () => {
  it("excludes admins", () => {
    const rows = throughputByAgent(seed(), "month", NOW_MS);
    const ids = rows.map((r) => r.agentId);
    expect(ids).not.toContain(DEFAULT_SUPERVISOR_ID);
  });

  it("includes every role:agent regardless of zero throughput", () => {
    const rows = throughputByAgent(seed(), "month", NOW_MS);
    const expectedAgentIds = SEED_AGENTS.filter((a) => a.role === "agent").map(
      (a) => a.id,
    );
    expect(rows.length).toBe(expectedAgentIds.length);
  });

  it("sorted descending by processed", () => {
    const rows = throughputByAgent(seed(), "month", NOW_MS);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.processed).toBeGreaterThanOrEqual(rows[i]!.processed);
    }
  });
});

describe("recentDecisions", () => {
  it("returns only the requested agent's rows", () => {
    const rows = recentDecisions(seed(), "agent-marcus", 50);
    for (const r of rows) {
      // The lookup goes through dispositionedApplications.decidedBy ===
      // agentId, so every row must trace back to that agent.
      const match = SEED_DISPOSITIONED_APPLICATIONS.find(
        (a) => a.applicationId === r.applicationId,
      );
      expect(match?.disposition.decidedBy).toBe("agent-marcus");
    }
  });

  it("newest first", () => {
    const rows = recentDecisions(seed(), "agent-marcus", 50);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.decidedAt >= rows[i]!.decidedAt).toBe(true);
    }
  });

  it("respects the limit", () => {
    const rows = recentDecisions(seed(), "agent-marcus", 2);
    expect(rows.length).toBeLessThanOrEqual(2);
  });
});
