/**
 * P5-3 — agreement metric (`lib/feedback/agreement.ts`).
 *
 * Covers the empty case, the headline rolling rate, window size, and
 * the per-beverage-type breakdown.
 */

import { describe, expect, it } from "vitest";

import { computeAgreement } from "@/lib/feedback/agreement";
import type { CorpusRecord, OverrideKind } from "@/lib/feedback/types";
import type { BeverageType } from "@/types";

function makeRecord(
  i: number,
  kind: OverrideKind,
  beverageType: BeverageType = "wine",
): CorpusRecord {
  // ISO timestamps offset by minute so ordering is deterministic.
  const recordedAt = new Date(
    Date.UTC(2026, 5, 15, 12, i, 0),
  ).toISOString();
  return {
    id: `rec-${i}`,
    recordedAt,
    applicationIdHash: "sha256:deadbeef",
    brand: "Brand",
    beverageType,
    predictedLane: kind === "agreement" ? "match" : "match",
    effectiveLane: kind === "flag" ? "mismatch" : "match",
    overrideKind: kind,
    predictedFields: [],
    decidedBy: "agent-test",
    decidedAt: recordedAt,
    sampled: false,
    confirmation: "pending",
  };
}

describe("computeAgreement (P5-3)", () => {
  it("empty corpus → rate 0, sampleSize 0", () => {
    const snap = computeAgreement([]);
    expect(snap.rolling.sampleSize).toBe(0);
    expect(snap.rolling.agreementRate).toBe(0);
    expect(snap.rolling.overrideRate).toBe(0);
    expect(snap.allTime.sampleSize).toBe(0);
    expect(snap.allTime.agreementRate).toBe(0);
    expect(snap.byBeverageType).toEqual([]);
  });

  it("10 records with 8 agreements + 2 overrides → 0.8", () => {
    const records: CorpusRecord[] = [
      ...Array.from({ length: 8 }, (_, i) => makeRecord(i, "agreement")),
      makeRecord(8, "flag"),
      makeRecord(9, "clear"),
    ];
    const snap = computeAgreement(records);
    expect(snap.allTime.sampleSize).toBe(10);
    expect(snap.allTime.agreementRate).toBeCloseTo(0.8);
    expect(snap.allTime.overrideRate).toBeCloseTo(0.2);
    expect(snap.rolling.sampleSize).toBe(10);
    expect(snap.rolling.agreementRate).toBeCloseTo(0.8);
  });

  it("rolling window of 5 over 10 records counts only the 5 newest", () => {
    // 5 oldest are agreements; 5 newest are flags.
    const records: CorpusRecord[] = [
      ...Array.from({ length: 5 }, (_, i) => makeRecord(i, "agreement")),
      ...Array.from({ length: 5 }, (_, i) => makeRecord(5 + i, "flag")),
    ];
    const snap = computeAgreement(records, { windowSize: 5 });
    expect(snap.rolling.windowSize).toBe(5);
    expect(snap.rolling.sampleSize).toBe(5);
    expect(snap.rolling.agreementRate).toBe(0);
    expect(snap.allTime.sampleSize).toBe(10);
    expect(snap.allTime.agreementRate).toBe(0.5);
  });

  it("byBeverageType breakdown surfaces specialization weak spots", () => {
    const records: CorpusRecord[] = [
      makeRecord(0, "agreement", "wine"),
      makeRecord(1, "agreement", "wine"),
      makeRecord(2, "flag", "wine"),
      makeRecord(3, "agreement", "distilled_spirits"),
      makeRecord(4, "agreement", "distilled_spirits"),
      makeRecord(5, "agreement", "distilled_spirits"),
      makeRecord(6, "agreement", "distilled_spirits"),
    ];
    const snap = computeAgreement(records);
    const wine = snap.byBeverageType.find((b) => b.beverageType === "wine");
    const spirits = snap.byBeverageType.find(
      (b) => b.beverageType === "distilled_spirits",
    );
    expect(wine?.sampleSize).toBe(3);
    expect(wine?.agreementRate).toBeCloseTo(2 / 3);
    expect(spirits?.sampleSize).toBe(4);
    expect(spirits?.agreementRate).toBe(1);
  });
});
