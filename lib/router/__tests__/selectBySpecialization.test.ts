/**
 * `selectBySpecialization` strategy tests (P2-4, D15, FR-28).
 *
 * The pure-function guarantees the router contract leans on:
 *   - specialist match wins within priority order (lane then receivedAt)
 *   - overflow when no specialist match — pool never starves
 *   - generalist (empty specializations) always overflows
 *   - empty pool returns null
 *   - match-lane rows are defensively skipped
 *   - within a specialty, mismatch beats review and oldest wins
 */

import { describe, expect, it } from "vitest";

import type { BeverageType } from "@/types";
import type { QueueAgent, QueueApplication } from "@/lib/queue/types";

import { selectBySpecialization } from "../selectBySpecialization";

function makeAgent(opts: {
  id?: string;
  specializations: ReadonlyArray<BeverageType>;
  availability?: "available" | "out_of_office";
}): QueueAgent {
  return {
    id: opts.id ?? "agent-test",
    name: "Test Agent",
    role: "agent",
    specializations: opts.specializations,
    availability: opts.availability ?? "available",
  };
}

function makeApp(opts: {
  id: string;
  lane: "mismatch" | "review" | "match";
  receivedAt: string;
  beverageType?: BeverageType;
}): QueueApplication {
  return {
    applicationId: opts.id,
    brand: "Test",
    beverageType: opts.beverageType ?? "distilled_spirits",
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

describe("selectBySpecialization — specialist match", () => {
  it("a wine specialist picks the oldest wine mismatch even when an older spirits mismatch exists", () => {
    const wine = makeAgent({ specializations: ["wine"] });
    const olderSpirits = makeApp({
      id: "spirits-old",
      lane: "mismatch",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "distilled_spirits",
    });
    const youngerWine = makeApp({
      id: "wine-young",
      lane: "mismatch",
      receivedAt: "2026-06-15T09:00:00Z",
      beverageType: "wine",
    });
    const olderWine = makeApp({
      id: "wine-old",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:00:00Z",
      beverageType: "wine",
    });
    expect(
      selectBySpecialization([olderSpirits, youngerWine, olderWine], wine)
        ?.applicationId,
    ).toBe("wine-old");
  });

  it("within the specialty, a wine mismatch beats an older wine review", () => {
    const wine = makeAgent({ specializations: ["wine"] });
    const oldWineReview = makeApp({
      id: "wine-review",
      lane: "review",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "wine",
    });
    const newWineMismatch = makeApp({
      id: "wine-mismatch",
      lane: "mismatch",
      receivedAt: "2026-06-15T10:00:00Z",
      beverageType: "wine",
    });
    expect(
      selectBySpecialization([oldWineReview, newWineMismatch], wine)
        ?.applicationId,
    ).toBe("wine-mismatch");
  });

  it("multiple wine items: picks the oldest by receivedAt ascending", () => {
    const wine = makeAgent({ specializations: ["wine"] });
    const a = makeApp({
      id: "a",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:00:00Z",
      beverageType: "wine",
    });
    const b = makeApp({
      id: "b",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:30:00Z",
      beverageType: "wine",
    });
    const c = makeApp({
      id: "c",
      lane: "mismatch",
      receivedAt: "2026-06-15T09:00:00Z",
      beverageType: "wine",
    });
    // Shuffle input order so the sort matters.
    expect(selectBySpecialization([c, a, b], wine)?.applicationId).toBe("a");
  });

  it("a multi-specialty agent matches any of their specialties (oldest priority wins)", () => {
    const dual = makeAgent({ specializations: ["wine", "malt_beverage"] });
    const spirits = makeApp({
      id: "s",
      lane: "mismatch",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "distilled_spirits",
    });
    const wine = makeApp({
      id: "w",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:00:00Z",
      beverageType: "wine",
    });
    const malt = makeApp({
      id: "m",
      lane: "mismatch",
      receivedAt: "2026-06-15T09:00:00Z",
      beverageType: "malt_beverage",
    });
    // Spirits not in spec, so skipped. Between wine and malt — both
    // valid specialty matches — the older wins (wine at 08:00).
    expect(
      selectBySpecialization([spirits, wine, malt], dual)?.applicationId,
    ).toBe("w");
  });
});

describe("selectBySpecialization — overflow", () => {
  it("a wine specialist picks the next available item when no wine items remain", () => {
    const wine = makeAgent({ specializations: ["wine"] });
    const spirits = makeApp({
      id: "spirits-mismatch",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:00:00Z",
      beverageType: "distilled_spirits",
    });
    const malt = makeApp({
      id: "malt-mismatch",
      lane: "mismatch",
      receivedAt: "2026-06-15T09:00:00Z",
      beverageType: "malt_beverage",
    });
    // No wine in the pool → overflow → highest priority is spirits
    // (the older mismatch).
    expect(
      selectBySpecialization([malt, spirits], wine)?.applicationId,
    ).toBe("spirits-mismatch");
  });

  it("overflow preserves priority order — mismatch ahead of review across types", () => {
    const wine = makeAgent({ specializations: ["wine"] });
    const oldSpiritsReview = makeApp({
      id: "spirits-review",
      lane: "review",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "distilled_spirits",
    });
    const newMaltMismatch = makeApp({
      id: "malt-mismatch",
      lane: "mismatch",
      receivedAt: "2026-06-15T10:00:00Z",
      beverageType: "malt_beverage",
    });
    expect(
      selectBySpecialization([oldSpiritsReview, newMaltMismatch], wine)
        ?.applicationId,
    ).toBe("malt-mismatch");
  });

  it("generalist (empty specializations) goes straight to overflow", () => {
    const generalist = makeAgent({ specializations: [] });
    const wineMismatch = makeApp({
      id: "wine",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:00:00Z",
      beverageType: "wine",
    });
    const spiritsReview = makeApp({
      id: "spirits",
      lane: "review",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "distilled_spirits",
    });
    // Wine mismatch beats spirits review by lane priority.
    expect(
      selectBySpecialization([spiritsReview, wineMismatch], generalist)
        ?.applicationId,
    ).toBe("wine");
  });
});

describe("selectBySpecialization — edge cases", () => {
  it("returns null on an empty pool", () => {
    expect(
      selectBySpecialization([], makeAgent({ specializations: ["wine"] })),
    ).toBeNull();
  });

  it("returns null when the pool contains only match-lane rows", () => {
    const m = makeApp({
      id: "m",
      lane: "match",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "wine",
    });
    expect(
      selectBySpecialization([m], makeAgent({ specializations: ["wine"] })),
    ).toBeNull();
  });

  it("never returns a match-lane row even when it would be the only specialty match", () => {
    // Match-lane wine in the pool plus an exception-lane spirits.
    // A wine specialist should fall through to overflow (spirits), not
    // pull the match-lane wine.
    const wine = makeAgent({ specializations: ["wine"] });
    const matchWine = makeApp({
      id: "match-wine",
      lane: "match",
      receivedAt: "2026-06-15T07:00:00Z",
      beverageType: "wine",
    });
    const spirits = makeApp({
      id: "spirits-mismatch",
      lane: "mismatch",
      receivedAt: "2026-06-15T08:00:00Z",
      beverageType: "distilled_spirits",
    });
    expect(
      selectBySpecialization([matchWine, spirits], wine)?.applicationId,
    ).toBe("spirits-mismatch");
  });
});
