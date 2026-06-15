/**
 * Queue selector / summary / claim / disposition tests (P2-1).
 *
 * The UI is exercised manually; these tests assert the pure logic so a
 * future refactor can't silently break "match lane never reaches the
 * agent", "issue summary uses the worst field", or "claim respects
 * availability".
 */

import { describe, expect, it } from "vitest";

import { claimNext } from "../claimNext";
import { recordDisposition } from "../disposition";
import { DEFAULT_CURRENT_AGENT_ID, SEED_AGENTS, SEED_APPLICATIONS } from "../fixtures";
import { deriveIssueSummary } from "../issueSummary";
import { selectMyQueue, selectPoolCount } from "../myQueue";
import type { QueueStoreState } from "../types";

function seed(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    currentAgentId: DEFAULT_CURRENT_AGENT_ID,
  };
}

describe("selectMyQueue (D11, D15, CONTEXT.md Work pool)", () => {
  it("returns only the current agent's claimed exceptions", () => {
    const queue = selectMyQueue(seed());
    expect(queue.length).toBeGreaterThan(0);
    for (const item of queue) {
      expect(item.application.assignedAgentId).toBe(DEFAULT_CURRENT_AGENT_ID);
      expect(item.application.verification.lane).not.toBe("match");
    }
  });

  it("never includes match-lane applications (D11)", () => {
    const queue = selectMyQueue(seed());
    for (const item of queue) {
      expect(item.lane).not.toBe("match");
    }
    // Cross-check: the seed has at least two match-lane rows we should
    // be filtering out.
    const matches = SEED_APPLICATIONS.filter(
      (a) => a.verification.lane === "match",
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it("sorts mismatch lane before review lane", () => {
    const queue = selectMyQueue(seed());
    let sawReview = false;
    for (const item of queue) {
      if (item.lane === "review") sawReview = true;
      if (sawReview) expect(item.lane).toBe("review");
    }
  });

  it("excludes items claimed by other agents", () => {
    const queue = selectMyQueue(seed());
    const ids = new Set(queue.map((q) => q.application.applicationId));
    expect(ids.has("vintage-park-vintners-001")).toBe(false);
  });

  it("excludes unclaimed pool items", () => {
    const queue = selectMyQueue(seed());
    const ids = new Set(queue.map((q) => q.application.applicationId));
    // Cedar Ridge starts in the pool — must NOT appear until claimed.
    expect(ids.has("cedar-ridge-reserve-001")).toBe(false);
  });
});

describe("selectPoolCount", () => {
  it("counts only unclaimed exception applications", () => {
    const count = selectPoolCount(seed());
    // From the fixtures: cedar-ridge, coastal-pale-ale, dunmore are
    // unclaimed exceptions. Match-lane unclaimed rows (old-tom,
    // silver-branch) MUST NOT count.
    expect(count).toBe(3);
  });
});

describe("deriveIssueSummary", () => {
  it("uses the worst verdict (mismatch > not_found > low_confidence)", () => {
    const summary = deriveIssueSummary({
      applicationId: "x",
      lane: "mismatch",
      overallConfidence: 0.8,
      fields: [
        {
          field: "fanciful_name",
          formValue: "Coastal White",
          extractedValue: "Coastal Wite",
          verdict: "low_confidence",
          confidence: 0.5,
          reason: "Fanciful name uncertain",
          sourceFace: "front",
        },
        {
          field: "alcohol_content",
          formValue: "40%",
          extractedValue: "45% ALC/VOL",
          verdict: "mismatch",
          confidence: 1,
          reason: "ABV mismatch",
          sourceFace: "front",
        },
      ],
      warning: {
        presence: true,
        allCaps: true,
        boldConfident: "yes",
        legibility: "good",
      },
      flags: [],
      extractionFailed: false,
    });
    expect(summary).toContain("Alcohol content");
    expect(summary).toContain("40%");
    expect(summary).toContain("45% ALC/VOL");
  });

  it("surfaces the warning's reason verbatim when the warning fails", () => {
    const summary = deriveIssueSummary({
      applicationId: "x",
      lane: "mismatch",
      overallConfidence: 1,
      fields: [
        {
          field: "government_warning",
          formValue: "GOVERNMENT WARNING:",
          extractedValue: "Government Warning:",
          verdict: "mismatch",
          confidence: 1,
          reason: 'Warning heading must read "GOVERNMENT WARNING:" in ALL CAPS',
          sourceFace: "back",
        },
      ],
      warning: {
        presence: true,
        allCaps: false,
        boldConfident: "yes",
        legibility: "good",
      },
      flags: [],
      extractionFailed: false,
    });
    expect(summary).toContain("Government warning");
    expect(summary).toContain("ALL CAPS");
  });

  it("uses the flags array when extraction failed", () => {
    const summary = deriveIssueSummary({
      applicationId: "x",
      lane: "review",
      overallConfidence: 0,
      fields: [],
      warning: {
        presence: false,
        allCaps: false,
        boldConfident: "uncertain",
        legibility: "low",
      },
      flags: ["Back face is unreadable — please re-upload a clearer image."],
      extractionFailed: true,
      recommendation: "return_unreadable_image",
    });
    expect(summary).toBe(
      "Back face is unreadable — please re-upload a clearer image.",
    );
  });
});

describe("claimNext (D15, CONTEXT.md Claim / Availability)", () => {
  it("claims the next mismatch from the shared pool first (problems first)", () => {
    const before = seed();
    const result = claimNext(before, () => "2026-06-15T10:00:00Z");
    expect(result.outcome.ok).toBe(true);
    if (!result.outcome.ok) return;
    expect(result.outcome.claimed.assignedAgentId).toBe(DEFAULT_CURRENT_AGENT_ID);
    expect(result.outcome.claimed.claimedAt).toBe("2026-06-15T10:00:00Z");
    expect(result.outcome.claimed.verification.lane).toBe("mismatch");
  });

  it("respects agent availability — out-of-office cannot claim", () => {
    const state = seed();
    const unavailable: QueueStoreState = {
      ...state,
      currentAgentId: "agent-river", // seeded as out_of_office
    };
    const result = claimNext(unavailable);
    expect(result.outcome.ok).toBe(false);
    if (result.outcome.ok) return;
    expect(result.outcome.reason).toBe("agent_unavailable");
    // State must not have changed.
    expect(result.state).toEqual(unavailable);
  });

  it("returns no_eligible_pool_item when the pool is empty", () => {
    const state = seed();
    const emptyPool: QueueStoreState = {
      ...state,
      applications: state.applications.map((a) =>
        a.assignedAgentId === null && a.verification.lane !== "match"
          ? { ...a, assignedAgentId: "agent-priya", claimedAt: "2026-06-15T09:00:00Z" }
          : a,
      ),
    };
    const result = claimNext(emptyPool);
    expect(result.outcome.ok).toBe(false);
    if (result.outcome.ok) return;
    expect(result.outcome.reason).toBe("no_eligible_pool_item");
  });

  it("never claims a match-lane application", () => {
    const state = seed();
    // Clear all exception pool items so only matches remain unclaimed.
    const onlyMatches: QueueStoreState = {
      ...state,
      applications: state.applications.map((a) =>
        a.assignedAgentId === null && a.verification.lane !== "match"
          ? { ...a, assignedAgentId: "agent-priya", claimedAt: "2026-06-15T09:00:00Z" }
          : a,
      ),
    };
    const result = claimNext(onlyMatches);
    expect(result.outcome.ok).toBe(false);
    if (result.outcome.ok) return;
    expect(result.outcome.reason).toBe("no_eligible_pool_item");
  });
});

describe("recordDisposition", () => {
  it("removes the dispositioned application from the queue", () => {
    const state = seed();
    const result = recordDisposition(
      state,
      {
        applicationId: "harbor-mist-vodka-001",
        disposition: "approve",
        agentId: DEFAULT_CURRENT_AGENT_ID,
      },
      () => "2026-06-15T10:30:00Z",
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.record.disposition).toBe("approve");
    expect(result.record.decidedAt).toBe("2026-06-15T10:30:00Z");
    expect(
      result.state.applications.find(
        (a) => a.applicationId === "harbor-mist-vodka-001",
      ),
    ).toBeUndefined();
  });

  it("attaches the return reason on return_for_correction", () => {
    const state = seed();
    const result = recordDisposition(state, {
      applicationId: "harbor-mist-vodka-001",
      disposition: "return_for_correction",
      agentId: DEFAULT_CURRENT_AGENT_ID,
      returnReason: {
        failedFields: [
          {
            field: "alcohol_content",
            formValue: "40%",
            extractedValue: "45% ALC/VOL",
            reason: "ABV mismatch",
          },
        ],
      },
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.record.disposition).toBe("return_for_correction");
    expect(result.record.returnReason?.failedFields).toHaveLength(1);
  });
});
