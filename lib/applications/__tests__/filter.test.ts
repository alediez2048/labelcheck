/**
 * Tests for the All Applications filter selector (P2-6).
 *
 * The selector is a pure function over the (extended) queue store
 * state. These tests pin a fixed `now` so the date-range boundaries
 * are deterministic and the assertions stay stable across runs.
 */

import { describe, expect, it } from "vitest";

import {
  filterApplications,
  type ApplicationFilterInput,
} from "@/lib/applications/filter";
import type {
  ApplicationStatus,
  DispositionedApplication,
  QueueAgent,
  QueueApplication,
  QueueStoreState,
} from "@/lib/queue/types";
import type { VerificationResult } from "@/types";

const NOW = Date.parse("2026-06-15T12:00:00Z");

const AGENTS: ReadonlyArray<QueueAgent> = [
  {
    id: "agent-marcus",
    name: "Marcus Lee",
    role: "agent",
    specializations: ["distilled_spirits"],
    availability: "available",
  },
  {
    id: "agent-priya",
    name: "Priya Shah",
    role: "agent",
    specializations: ["wine"],
    availability: "available",
  },
  {
    id: "admin-sasha",
    name: "Sasha Okafor",
    role: "admin",
    specializations: [],
    availability: "available",
  },
];

function verification(
  applicationId: string,
  lane: VerificationResult["lane"],
): VerificationResult {
  return {
    applicationId,
    lane,
    overallConfidence: 0.9,
    fields: [],
    warning: {
      presence: true,
      allCaps: true,
      boldConfident: "yes",
      legibility: "good",
    },
    flags: [],
    extractionFailed: false,
  };
}

function openApp(opts: {
  id: string;
  brand: string;
  receivedAt: string;
  assignedAgentId?: string | null;
  lane?: VerificationResult["lane"];
}): QueueApplication {
  return {
    applicationId: opts.id,
    brand: opts.brand,
    beverageType: "distilled_spirits",
    faces: [],
    verification: verification(opts.id, opts.lane ?? "mismatch"),
    assignedAgentId: opts.assignedAgentId ?? null,
    claimedAt: opts.assignedAgentId ? "2026-06-15T09:00:00Z" : null,
    receivedAt: opts.receivedAt,
    verifiedDurationMs: 3000,
  };
}

function dispoApp(opts: {
  id: string;
  brand: string;
  receivedAt: string;
  decidedAt: string;
  status: Exclude<ApplicationStatus, "in_queue">;
  decidedBy: string;
  lane?: VerificationResult["lane"];
}): DispositionedApplication {
  return {
    applicationId: opts.id,
    brand: opts.brand,
    beverageType: "wine",
    faces: [],
    verification: verification(opts.id, opts.lane ?? "match"),
    assignedAgentId: opts.decidedBy,
    claimedAt: opts.receivedAt,
    receivedAt: opts.receivedAt,
    verifiedDurationMs: 3000,
    status: opts.status,
    disposition: {
      applicationId: opts.id,
      disposition:
        opts.status === "approved" ? "approve" : "return_for_correction",
      decidedAt: opts.decidedAt,
      decidedBy: opts.decidedBy,
    },
  };
}

function seed(): QueueStoreState & {
  dispositionedApplications: ReadonlyArray<DispositionedApplication>;
} {
  return {
    agents: AGENTS,
    applications: [
      openApp({
        id: "harbor-mist-001",
        brand: "Harbor Mist Vodka",
        receivedAt: "2026-06-15T08:00:00Z",
        assignedAgentId: "agent-marcus",
      }),
      openApp({
        id: "cedar-ridge-001",
        brand: "Cedar Ridge Reserve",
        receivedAt: "2026-06-12T09:00:00Z",
      }),
    ],
    dispositionedApplications: [
      dispoApp({
        id: "old-tom-001",
        brand: "Old Tom Distillery",
        receivedAt: "2026-06-14T08:00:00Z",
        decidedAt: "2026-06-14T09:00:00Z",
        status: "approved",
        decidedBy: "admin-sasha",
      }),
      dispoApp({
        id: "vintage-park-001",
        brand: "Vintage Park Vintners",
        receivedAt: "2026-06-01T08:00:00Z",
        decidedAt: "2026-06-01T09:00:00Z",
        status: "needs_correction",
        decidedBy: "agent-priya",
      }),
      dispoApp({
        id: "ancient-oak-001",
        brand: "Ancient Oak",
        receivedAt: "2026-05-01T08:00:00Z",
        decidedAt: "2026-05-01T09:00:00Z",
        status: "rejected",
        decidedBy: "agent-priya",
      }),
    ],
    currentAgentId: "admin-sasha",
    baselineMatchRate: 0.7,
    auditEvents: [],
  };
}

function defaults(): ApplicationFilterInput {
  return {
    search: "",
    statuses: [],
    range: "all_time",
    assignedAgentIds: [],
  };
}

describe("filterApplications", () => {
  it("returns the union of open and dispositioned applications when filters are empty", () => {
    const rows = filterApplications(seed(), defaults(), NOW);
    expect(rows).toHaveLength(5);
    const ids = rows.map((r) => r.applicationId).sort();
    expect(ids).toEqual(
      [
        "harbor-mist-001",
        "cedar-ridge-001",
        "old-tom-001",
        "vintage-park-001",
        "ancient-oak-001",
      ].sort(),
    );
  });

  it("sorts the rows by receivedAt descending", () => {
    const rows = filterApplications(seed(), defaults(), NOW);
    const dates = rows.map((r) => r.receivedAt);
    for (let i = 1; i < dates.length; i += 1) {
      expect(Date.parse(dates[i - 1]!)).toBeGreaterThanOrEqual(
        Date.parse(dates[i]!),
      );
    }
  });

  it("free-text search matches the brand case-insensitively", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), search: "harbor" },
      NOW,
    );
    expect(rows.map((r) => r.applicationId)).toEqual(["harbor-mist-001"]);
  });

  it("free-text search matches the TTB id case-insensitively", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), search: "VINTAGE-PARK" },
      NOW,
    );
    expect(rows.map((r) => r.applicationId)).toEqual(["vintage-park-001"]);
  });

  it("status filter keeps only matching rows (schema enum values)", () => {
    const approved = filterApplications(
      seed(),
      { ...defaults(), statuses: ["approved"] },
      NOW,
    );
    expect(approved.map((r) => r.applicationId)).toEqual(["old-tom-001"]);

    const open = filterApplications(
      seed(),
      { ...defaults(), statuses: ["in_queue"] },
      NOW,
    );
    expect(open.map((r) => r.applicationId).sort()).toEqual(
      ["harbor-mist-001", "cedar-ridge-001"].sort(),
    );

    const multi = filterApplications(
      seed(),
      { ...defaults(), statuses: ["needs_correction", "rejected"] },
      NOW,
    );
    expect(multi.map((r) => r.applicationId).sort()).toEqual(
      ["vintage-park-001", "ancient-oak-001"].sort(),
    );
  });

  it("empty status array means all statuses pass", () => {
    const all = filterApplications(seed(), defaults(), NOW);
    const allStatuses = new Set(all.map((r) => r.status));
    expect(allStatuses.size).toBeGreaterThan(1);
  });

  it("today range keeps only rows received on the current calendar day (UTC fixture)", () => {
    // Fixed now: 2026-06-15T12:00:00Z.
    // The boundary uses local-time start-of-day; pick a `now` that's
    // unambiguous regardless of TZ by choosing a row with receivedAt
    // strictly later than 24h before now.
    const rows = filterApplications(
      seed(),
      { ...defaults(), range: "today" },
      NOW,
    );
    // harbor-mist (06-15 08:00 UTC) is unambiguously within "today";
    // ancient-oak (05-01) and vintage-park (06-01) are not.
    const ids = rows.map((r) => r.applicationId);
    expect(ids).toContain("harbor-mist-001");
    expect(ids).not.toContain("ancient-oak-001");
    expect(ids).not.toContain("vintage-park-001");
  });

  it("this_week range keeps only rows within the last 7 days", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), range: "this_week" },
      NOW,
    );
    const ids = rows.map((r) => r.applicationId).sort();
    // Within 7 days of 2026-06-15T12:00Z: harbor-mist (06-15),
    // old-tom (06-14), cedar-ridge (06-12). vintage-park (06-01) and
    // ancient-oak (05-01) fall outside.
    expect(ids).toEqual(
      ["harbor-mist-001", "old-tom-001", "cedar-ridge-001"].sort(),
    );
  });

  it("this_month range keeps only rows within the last 30 days", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), range: "this_month" },
      NOW,
    );
    const ids = rows.map((r) => r.applicationId);
    // Within 30 days of 2026-06-15: harbor-mist, old-tom, cedar-ridge,
    // vintage-park (06-01). ancient-oak (05-01) is just outside.
    expect(ids).toContain("vintage-park-001");
    expect(ids).not.toContain("ancient-oak-001");
  });

  it("all_time range applies no date filter", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), range: "all_time" },
      NOW,
    );
    expect(rows.map((r) => r.applicationId)).toContain("ancient-oak-001");
  });

  it("agent multi-select keeps only matching rows; empty means all", () => {
    const empty = filterApplications(seed(), defaults(), NOW);
    expect(empty.length).toBe(5);

    const priya = filterApplications(
      seed(),
      { ...defaults(), assignedAgentIds: ["agent-priya"] },
      NOW,
    );
    expect(priya.map((r) => r.applicationId).sort()).toEqual(
      ["vintage-park-001", "ancient-oak-001"].sort(),
    );

    const both = filterApplications(
      seed(),
      {
        ...defaults(),
        assignedAgentIds: ["agent-marcus", "agent-priya"],
      },
      NOW,
    );
    const ids = both.map((r) => r.applicationId);
    expect(ids).toContain("harbor-mist-001");
    expect(ids).toContain("vintage-park-001");
    // Unassigned cedar-ridge is excluded once an agent filter is set.
    expect(ids).not.toContain("cedar-ridge-001");
  });

  it("populates assignedAgentName from the agents map", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), search: "harbor" },
      NOW,
    );
    expect(rows[0]!.assignedAgentName).toBe("Marcus Lee");
  });

  it("derives ttbId as the upper-cased applicationId", () => {
    const rows = filterApplications(
      seed(),
      { ...defaults(), search: "harbor" },
      NOW,
    );
    expect(rows[0]!.ttbId).toBe("HARBOR-MIST-001");
  });

  it("tolerates a store without dispositionedApplications (defensive default)", () => {
    const state = seed();
    const { dispositionedApplications: _drop, ...rest } = state;
    const rows = filterApplications(rest, defaults(), NOW);
    expect(rows.length).toBe(2);
  });
});
