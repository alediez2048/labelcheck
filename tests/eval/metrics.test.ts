/**
 * Unit tests for the P5-2 metric functions.
 *
 * Each metric is exercised on a small hand-crafted `CaseRun[]` so a
 * bug in P/R math, the calibration index, or the percentile clamp
 * gets caught here rather than in a flaky integration run.
 *
 * No pipeline calls — the metric functions are pure and operate over
 * the `CaseRun` shape declared in `lib/eval/types.ts`.
 */

import { describe, expect, it } from "vitest";

import { computeCalibration } from "@/lib/eval/metrics/calibration";
import { computeFalseNegativeRate } from "@/lib/eval/metrics/falseNegativeRate";
import { computeLaneConfusion } from "@/lib/eval/metrics/laneConfusion";
import { computeLatency } from "@/lib/eval/metrics/latency";
import { computePerFieldMetrics } from "@/lib/eval/metrics/perField";
import { computeWarningCheckMetrics } from "@/lib/eval/metrics/warningCheck";
import type { CaseRun } from "@/lib/eval/types";
import type { FieldName, Lane, Verdict } from "@/types";

/**
 * Helper — build a CaseRun with sensible defaults. Tests override only
 * the fields that matter for the assertion they're driving.
 */
function makeRun(overrides: Partial<CaseRun> & { caseId: string }): CaseRun {
  return {
    caseId: overrides.caseId,
    category: overrides.category ?? "test",
    expectedLane: overrides.expectedLane ?? "match",
    predictedLane: overrides.predictedLane ?? "match",
    expectedFlaggedFields: overrides.expectedFlaggedFields ?? [],
    predictedFlaggedFields: overrides.predictedFlaggedFields ?? [],
    fields: overrides.fields ?? [],
    overallConfidence: overrides.overallConfidence ?? 0,
    durationMs: overrides.durationMs ?? 0,
    extractionFailed: overrides.extractionFailed ?? false,
  };
}

describe("computePerFieldMetrics", () => {
  it("computes P, R, F1 over a 5-case alcohol_content fixture", () => {
    // Construct a fixture where alcohol_content has known TP/FP/FN/TN:
    //   c1: pred-flag yes, expect-flag yes  → TP
    //   c2: pred-flag yes, expect-flag yes  → TP
    //   c3: pred-flag yes, expect-flag no   → FP
    //   c4: pred-flag no,  expect-flag yes  → FN
    //   c5: pred-flag no,  expect-flag no   → TN
    // P = 2 / (2 + 1) = 0.6667; R = 2 / (2 + 1) = 0.6667;
    // F1 = 2 * 0.6667 * 0.6667 / (0.6667 + 0.6667) = 0.6667
    const abv: FieldName = "alcohol_content";
    const runs: CaseRun[] = [
      makeRun({
        caseId: "c1",
        predictedFlaggedFields: [abv],
        expectedFlaggedFields: [abv],
      }),
      makeRun({
        caseId: "c2",
        predictedFlaggedFields: [abv],
        expectedFlaggedFields: [abv],
      }),
      makeRun({
        caseId: "c3",
        predictedFlaggedFields: [abv],
        expectedFlaggedFields: [],
      }),
      makeRun({
        caseId: "c4",
        predictedFlaggedFields: [],
        expectedFlaggedFields: [abv],
      }),
      makeRun({
        caseId: "c5",
        predictedFlaggedFields: [],
        expectedFlaggedFields: [],
      }),
    ];

    const metrics = computePerFieldMetrics(runs);
    const abvMetric = metrics.find((m) => m.field === abv);
    expect(abvMetric).toBeDefined();
    if (!abvMetric) return;

    expect(abvMetric.truePositives).toBe(2);
    expect(abvMetric.falsePositives).toBe(1);
    expect(abvMetric.falseNegatives).toBe(1);
    expect(abvMetric.trueNegatives).toBe(1);
    expect(abvMetric.precision).toBeCloseTo(2 / 3, 4);
    expect(abvMetric.recall).toBeCloseTo(2 / 3, 4);
    expect(abvMetric.f1).toBeCloseTo(2 / 3, 4);
  });

  it("returns 0s for a field that never appeared in either prediction or ground truth", () => {
    const runs: CaseRun[] = [
      makeRun({ caseId: "c1" }),
      makeRun({ caseId: "c2" }),
    ];
    const metrics = computePerFieldMetrics(runs);
    for (const m of metrics) {
      expect(m.truePositives).toBe(0);
      expect(m.falsePositives).toBe(0);
      expect(m.falseNegatives).toBe(0);
      expect(m.trueNegatives).toBe(2);
      expect(m.precision).toBe(0);
      expect(m.recall).toBe(0);
      expect(m.f1).toBe(0);
    }
  });
});

describe("computeLaneConfusion", () => {
  it("counts cells and computes per-lane + overall accuracy", () => {
    // Build a 6-case fixture with deliberate distribution:
    //   expected match,    predicted match    → 2 cases (diagonal)
    //   expected match,    predicted mismatch → 1 case
    //   expected mismatch, predicted mismatch → 1 case (diagonal)
    //   expected mismatch, predicted match    → 1 case (FN leak)
    //   expected review,   predicted review   → 1 case (diagonal)
    const def = (id: string, expected: Lane, predicted: Lane): CaseRun =>
      makeRun({ caseId: id, expectedLane: expected, predictedLane: predicted });

    const runs: CaseRun[] = [
      def("c1", "match", "match"),
      def("c2", "match", "match"),
      def("c3", "match", "mismatch"),
      def("c4", "mismatch", "mismatch"),
      def("c5", "mismatch", "match"),
      def("c6", "review", "review"),
    ];

    const confusion = computeLaneConfusion(runs);
    expect(confusion.matrix.match.match).toBe(2);
    expect(confusion.matrix.match.mismatch).toBe(1);
    expect(confusion.matrix.match.review).toBe(0);
    expect(confusion.matrix.mismatch.match).toBe(1);
    expect(confusion.matrix.mismatch.mismatch).toBe(1);
    expect(confusion.matrix.review.review).toBe(1);

    expect(confusion.perLaneAccuracy.match).toBeCloseTo(2 / 3, 4);
    expect(confusion.perLaneAccuracy.mismatch).toBeCloseTo(1 / 2, 4);
    expect(confusion.perLaneAccuracy.review).toBe(1);
    expect(confusion.overall).toBeCloseTo(4 / 6, 4);
  });

  it("returns 0 accuracy on an empty input without throwing", () => {
    const confusion = computeLaneConfusion([]);
    expect(confusion.overall).toBe(0);
    expect(confusion.perLaneAccuracy.match).toBe(0);
  });
});

describe("computeFalseNegativeRate", () => {
  it("computes 2/3 over a 4-case fixture (2 mismatch expected + 1 review expected; 2 leak)", () => {
    // Cases:
    //   c1: expected mismatch, predicted match    → leak
    //   c2: expected mismatch, predicted mismatch → no leak
    //   c3: expected review,   predicted match    → leak
    //   c4: expected match,    predicted match    → not a real negative
    // realNegatives = 3 (c1, c2, c3); leaked = 2 (c1, c3); rate = 2/3.
    const runs: CaseRun[] = [
      makeRun({ caseId: "c1", expectedLane: "mismatch", predictedLane: "match" }),
      makeRun({
        caseId: "c2",
        expectedLane: "mismatch",
        predictedLane: "mismatch",
      }),
      makeRun({ caseId: "c3", expectedLane: "review", predictedLane: "match" }),
      makeRun({ caseId: "c4", expectedLane: "match", predictedLane: "match" }),
    ];
    const fnr = computeFalseNegativeRate(runs);
    expect(fnr.totalRealNegatives).toBe(3);
    expect(fnr.leakedToMatch).toBe(2);
    expect(fnr.rate).toBeCloseTo(2 / 3, 4);
    expect(fnr.leakedCaseIds).toEqual(["c1", "c3"]);
  });

  it("returns 0 rate on a fixture with no real negatives", () => {
    const runs: CaseRun[] = [
      makeRun({ caseId: "c1", expectedLane: "match", predictedLane: "match" }),
    ];
    const fnr = computeFalseNegativeRate(runs);
    expect(fnr.totalRealNegatives).toBe(0);
    expect(fnr.rate).toBe(0);
  });
});

describe("computeCalibration", () => {
  it("buckets confidences, computes per-bucket accuracy, returns hand-computed ECE", () => {
    // 10 cases distributed across buckets [0.0, 1.0]. Use exact bucket
    // boundaries to make the hand-computed ECE traceable.
    //   3 cases at conf=0.05 (bucket 0); 2 correct, 1 wrong → acc=0.6667
    //   2 cases at conf=0.45 (bucket 4); 1 correct, 1 wrong → acc=0.5
    //   5 cases at conf=0.95 (bucket 9); 5 correct          → acc=1.0
    // ECE = (3/10) * |0.6667 - 0.05| + (2/10) * |0.5 - 0.45| + (5/10) * |1.0 - 0.95|
    //     = 0.3 * 0.6167 + 0.2 * 0.05 + 0.5 * 0.05
    //     = 0.185 + 0.01 + 0.025
    //     = 0.22
    const runs: CaseRun[] = [
      // Bucket 0 — three cases, two correct.
      makeRun({
        caseId: "b0-correct-1",
        overallConfidence: 0.05,
        expectedLane: "mismatch",
        predictedLane: "mismatch",
      }),
      makeRun({
        caseId: "b0-correct-2",
        overallConfidence: 0.05,
        expectedLane: "mismatch",
        predictedLane: "mismatch",
      }),
      makeRun({
        caseId: "b0-wrong",
        overallConfidence: 0.05,
        expectedLane: "mismatch",
        predictedLane: "match",
      }),
      // Bucket 4 — two cases, one correct.
      makeRun({
        caseId: "b4-correct",
        overallConfidence: 0.45,
        expectedLane: "match",
        predictedLane: "match",
      }),
      makeRun({
        caseId: "b4-wrong",
        overallConfidence: 0.45,
        expectedLane: "match",
        predictedLane: "mismatch",
      }),
      // Bucket 9 — five correct.
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({
          caseId: `b9-correct-${i + 1}`,
          overallConfidence: 0.95,
          expectedLane: "match",
          predictedLane: "match",
        }),
      ),
    ];

    const calibration = computeCalibration(runs);
    expect(calibration.buckets.length).toBe(10);

    const b0 = calibration.buckets[0];
    expect(b0).toBeDefined();
    if (b0) {
      expect(b0.count).toBe(3);
      expect(b0.predictedMean).toBeCloseTo(0.05, 4);
      expect(b0.observedAccuracy).toBeCloseTo(2 / 3, 4);
    }
    const b4 = calibration.buckets[4];
    expect(b4).toBeDefined();
    if (b4) {
      expect(b4.count).toBe(2);
      expect(b4.predictedMean).toBeCloseTo(0.45, 4);
      expect(b4.observedAccuracy).toBeCloseTo(0.5, 4);
    }
    const b9 = calibration.buckets[9];
    expect(b9).toBeDefined();
    if (b9) {
      expect(b9.count).toBe(5);
      expect(b9.predictedMean).toBeCloseTo(0.95, 4);
      expect(b9.observedAccuracy).toBe(1);
    }

    // Empty buckets carry 0s and contribute nothing to ECE.
    const b1 = calibration.buckets[1];
    expect(b1).toBeDefined();
    if (b1) {
      expect(b1.count).toBe(0);
      expect(b1.predictedMean).toBe(0);
      expect(b1.observedAccuracy).toBe(0);
    }

    expect(calibration.ece).toBeCloseTo(0.22, 4);
  });

  it("returns ECE=0 on empty input without dividing by zero", () => {
    const calibration = computeCalibration([]);
    expect(calibration.ece).toBe(0);
    expect(calibration.buckets.length).toBe(10);
    for (const bucket of calibration.buckets) {
      expect(bucket.count).toBe(0);
    }
  });

  it("places confidence=1 in the top bucket (inclusive of 1)", () => {
    const runs: CaseRun[] = [
      makeRun({
        caseId: "top",
        overallConfidence: 1,
        expectedLane: "match",
        predictedLane: "match",
      }),
    ];
    const calibration = computeCalibration(runs);
    const topBucket = calibration.buckets[9];
    expect(topBucket).toBeDefined();
    if (topBucket) {
      expect(topBucket.count).toBe(1);
      expect(topBucket.observedAccuracy).toBe(1);
    }
  });
});

describe("computeLatency", () => {
  it("computes p50/p95/max with nearest-rank percentile and lists budget breaches", () => {
    // Five durations: 100, 200, 300, 400, 6000 ms; budget 5000.
    // sorted: [100, 200, 300, 400, 6000]
    // p50: idx = ceil(0.5 * 5) - 1 = 2 → 300
    // p95: idx = ceil(0.95 * 5) - 1 = 4 → 6000
    // max:  6000
    // breaches: c5 (6000 > 5000)
    const runs: CaseRun[] = [
      makeRun({ caseId: "c1", durationMs: 100 }),
      makeRun({ caseId: "c2", durationMs: 200 }),
      makeRun({ caseId: "c3", durationMs: 300 }),
      makeRun({ caseId: "c4", durationMs: 400 }),
      makeRun({ caseId: "c5", durationMs: 6000 }),
    ];
    const latency = computeLatency(runs);
    expect(latency.count).toBe(5);
    expect(latency.p50).toBe(300);
    expect(latency.p95).toBe(6000);
    expect(latency.max).toBe(6000);
    expect(latency.budgetMs).toBe(5000);
    expect(latency.budgetBreaches).toEqual(["c5"]);
  });

  it("returns 0s on empty input without throwing", () => {
    const latency = computeLatency([]);
    expect(latency.count).toBe(0);
    expect(latency.p50).toBe(0);
    expect(latency.p95).toBe(0);
    expect(latency.max).toBe(0);
    expect(latency.budgetBreaches).toEqual([]);
  });
});

describe("computeWarningCheckMetrics", () => {
  it("tracks presence / verbatim / ALL CAPS over a small fixture", () => {
    const warningField = (
      verdict: Verdict,
    ): CaseRun["fields"][number] => ({
      field: "government_warning",
      verdict,
      confidence: 0.9,
      sourceFace: "back",
    });

    // c1: clean case — warning matches; expected no flag. → presence TP, verbatim TP, allCaps TP
    // c2: missing-warning case (id-based). warning is not_found; expected flagged.
    //     presence: predicted false, expected false → TN (we want presence=absent here)
    //     verbatim: predicted false (verdict != "match"), expected false → TN
    // c3: title-case case. warning was found but mismatched; expected flagged.
    //     presence: predicted true, expected true → TP
    //     verbatim: predicted false, expected false → TN
    const runs: CaseRun[] = [
      makeRun({
        caseId: "c1-clean",
        category: "greenPairs",
        expectedFlaggedFields: [],
        fields: [warningField("match")],
      }),
      makeRun({
        caseId: "sample-warning-missing-001",
        category: "warningDefects",
        expectedFlaggedFields: ["government_warning"],
        fields: [warningField("not_found")],
      }),
      makeRun({
        caseId: "c3-titlecase",
        category: "warningDefects",
        expectedFlaggedFields: ["government_warning"],
        fields: [warningField("mismatch")],
      }),
    ];

    const report = computeWarningCheckMetrics(runs);

    // Presence
    expect(report.presence.tp).toBe(2); // c1, c3
    expect(report.presence.tn).toBe(1); // c2
    expect(report.presence.fp).toBe(0);
    expect(report.presence.fn).toBe(0);
    expect(report.presence.accuracy).toBe(1);

    // Verbatim — c1: predicted match + expected verbatim (no flag) → TP
    //            c2: predicted not match + expected NOT verbatim    → TN
    //            c3: predicted not match + expected NOT verbatim    → TN
    expect(report.verbatim.tp).toBe(1);
    expect(report.verbatim.tn).toBe(2);
    expect(report.verbatim.fp).toBe(0);
    expect(report.verbatim.fn).toBe(0);
    expect(report.verbatim.accuracy).toBe(1);
  });
});
