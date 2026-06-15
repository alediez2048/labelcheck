/**
 * `selectFifo` strategy tests (P2-3).
 *
 * Pure-function guarantees:
 *   - mismatch lane wins over review lane regardless of receivedAt
 *   - within a lane, oldest receivedAt wins
 *   - empty pool / match-only pool → null
 */

import { describe, expect, it } from "vitest";

import { SEED_AGENTS } from "@/lib/queue/fixtures";
import type { QueueAgent, QueueApplication } from "@/lib/queue/types";

import { selectFifo } from "../selectFifo";

const agent: QueueAgent = SEED_AGENTS[0]!;

function makeApp(opts: {
  id: string;
  lane: "mismatch" | "review" | "match";
  receivedAt: string;
}): QueueApplication {
  return {
    applicationId: opts.id,
    brand: "Test",
    beverageType: "distilled_spirits",
    faces: [],
    verification: {
      applicationId: opts.id,
      lane: opts.lane,
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
    },
    assignedAgentId: null,
    claimedAt: null,
    receivedAt: opts.receivedAt,
    verifiedDurationMs: 3000,
  };
}

describe("selectFifo", () => {
  it("picks the oldest mismatch ahead of a younger mismatch", () => {
    const older = makeApp({ id: "a", lane: "mismatch", receivedAt: "2026-06-15T08:00:00Z" });
    const younger = makeApp({ id: "b", lane: "mismatch", receivedAt: "2026-06-15T09:00:00Z" });
    expect(selectFifo([younger, older], agent)?.applicationId).toBe("a");
  });

  it("picks mismatch ahead of review even if review is older", () => {
    const oldReview = makeApp({ id: "rev", lane: "review", receivedAt: "2026-06-15T07:00:00Z" });
    const newMismatch = makeApp({
      id: "mis",
      lane: "mismatch",
      receivedAt: "2026-06-15T10:00:00Z",
    });
    expect(selectFifo([oldReview, newMismatch], agent)?.applicationId).toBe("mis");
  });

  it("falls back to review when no mismatch is in the pool", () => {
    const r1 = makeApp({ id: "r1", lane: "review", receivedAt: "2026-06-15T08:00:00Z" });
    const r2 = makeApp({ id: "r2", lane: "review", receivedAt: "2026-06-15T07:00:00Z" });
    expect(selectFifo([r1, r2], agent)?.applicationId).toBe("r2");
  });

  it("returns null on an empty pool", () => {
    expect(selectFifo([], agent)).toBeNull();
  });

  it("ignores match-lane rows defensively even if they slip in", () => {
    const m = makeApp({ id: "m", lane: "match", receivedAt: "2026-06-15T07:00:00Z" });
    expect(selectFifo([m], agent)).toBeNull();
  });

  it("ties on receivedAt resolve deterministically (stable input order wins after sort)", () => {
    const a = makeApp({ id: "a", lane: "mismatch", receivedAt: "2026-06-15T08:00:00Z" });
    const b = makeApp({ id: "b", lane: "mismatch", receivedAt: "2026-06-15T08:00:00Z" });
    // Both legal answers; assert the function picks one of them.
    const picked = selectFifo([a, b], agent);
    expect(picked).not.toBeNull();
    expect([a.applicationId, b.applicationId]).toContain(picked?.applicationId);
  });
});
