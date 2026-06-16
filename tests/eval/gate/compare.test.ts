/**
 * P5-5 — CI eval gate: unit tests for the regression comparator.
 *
 * Each test plants a single, named regression (or improvement) and
 * asserts the comparator's pass / fail decision and the metric it
 * flagged. These are the unit-level proxies for the "planted regression"
 * manual check named in the ticket — together they cover every metric
 * the gate is responsible for.
 */

import { describe, expect, it } from "vitest";

import type { EvalBaseline } from "@/lib/eval/gate/baseline";
import { compareToBaseline } from "@/lib/eval/gate/compare";
import type { EvalReport } from "@/lib/eval/types";

const GOLDEN_VERSION = "deadbeef".repeat(8); // 64-char placeholder hash

function baseline(overrides: Partial<EvalBaseline> = {}): EvalBaseline {
  const base: EvalBaseline = {
    version: 1,
    created_at: "2026-06-16T14:37:21.422Z",
    golden_set_version: GOLDEN_VERSION,
    metrics: {
      falseNegativeRate: {
        totalRealNegatives: 7,
        leakedToMatch: 0,
        rate: 0,
        leakedCaseIds: [],
      },
      laneConfusion: {
        matrix: {
          match: { match: 2, mismatch: 0, review: 0 },
          mismatch: { match: 0, mismatch: 6, review: 0 },
          review: { match: 0, mismatch: 0, review: 1 },
        },
        perLaneAccuracy: { match: 1, mismatch: 1, review: 1 },
        overall: 1,
      },
      warningCheck: {
        presence: { tp: 7, tn: 1, fp: 1, fn: 0, accuracy: 0.88 },
        verbatim: { tp: 5, tn: 3, fp: 0, fn: 1, accuracy: 0.88 },
        allCaps: { tp: 5, tn: 3, fp: 0, fn: 1, accuracy: 0.88 },
      },
      calibration: { ece: 0.1 },
      perField: [],
      latency: { p50: 1.5, p95: 7.5, p99: 7.5, max: 7.5 },
    },
    tolerances: {
      falseNegativeRate: 0.0,
      laneAccuracy: 0.01,
      warningPresenceAccuracy: 0.01,
      warningVerbatimAccuracy: 0.01,
      warningAllCapsAccuracy: 0.01,
      calibrationEce: 0.02,
      latencyP95BudgetMs: 5000,
    },
  };
  return { ...base, ...overrides };
}

function report(overrides: Partial<EvalReport> = {}): EvalReport {
  const b = baseline().metrics;
  const base: EvalReport = {
    runStartedAt: "2026-06-16T15:00:00.000Z",
    provider: "mock",
    caseCount: 9,
    falseNegativeRate: { ...b.falseNegativeRate },
    laneConfusion: {
      matrix: {
        match: { ...b.laneConfusion.matrix.match },
        mismatch: { ...b.laneConfusion.matrix.mismatch },
        review: { ...b.laneConfusion.matrix.review },
      },
      perLaneAccuracy: { ...b.laneConfusion.perLaneAccuracy },
      overall: b.laneConfusion.overall,
    },
    warningCheck: {
      presence: { ...b.warningCheck.presence },
      verbatim: { ...b.warningCheck.verbatim },
      allCaps: { ...b.warningCheck.allCaps },
    },
    calibration: {
      buckets: [],
      ece: b.calibration.ece,
    },
    perField: [],
    latency: {
      count: 9,
      p50: b.latency.p50,
      p95: b.latency.p95,
      p99: b.latency.p99,
      max: b.latency.max,
      budgetMs: 5000,
      budgetBreaches: [],
    },
  };
  return { ...base, ...overrides };
}

describe("compareToBaseline — headline FN-rate", () => {
  it("fails when one extra real-negative leaks to match", () => {
    // Baseline has 0 leaked of 7 real negatives (rate 0). Planted
    // regression: one leaked. Headline tolerance is +0.0 so this fails.
    const b = baseline();
    const r = report({
      falseNegativeRate: {
        totalRealNegatives: 7,
        leakedToMatch: 1,
        rate: 1 / 7,
        leakedCaseIds: ["sample-fn-probe-warning-case-001"],
      },
    });
    const result = compareToBaseline(r, b, GOLDEN_VERSION);
    expect(result.passed).toBe(false);
    expect(result.regressions.map((x) => x.metric)).toContain(
      "falseNegativeRate.rate",
    );
    expect(result.headlineDelta).toBeGreaterThan(0);
  });

  it("passes when FN-rate equals baseline", () => {
    const result = compareToBaseline(report(), baseline(), GOLDEN_VERSION);
    expect(result.passed).toBe(true);
    expect(result.headlineDelta).toBe(0);
  });

  it("passes and records an improvement when FN-rate drops", () => {
    // Build a baseline with a leaked case so an improvement is possible.
    const b = baseline({
      metrics: {
        ...baseline().metrics,
        falseNegativeRate: {
          totalRealNegatives: 7,
          leakedToMatch: 1,
          rate: 1 / 7,
          leakedCaseIds: ["sample-fn-probe-warning-case-001"],
        },
      },
    });
    const r = report();
    const result = compareToBaseline(r, b, GOLDEN_VERSION);
    expect(result.passed).toBe(true);
    expect(result.improvements.map((x) => x.metric)).toContain(
      "falseNegativeRate.rate",
    );
    expect(result.headlineDelta).toBeLessThan(0);
  });
});

describe("compareToBaseline — lane accuracy", () => {
  it("passes with a within-tolerance regression listed separately", () => {
    // Lane accuracy down 0.005 with tolerance 0.01 — noise wobble.
    const r = report({
      laneConfusion: {
        ...report().laneConfusion,
        overall: 0.995,
      },
    });
    const result = compareToBaseline(r, baseline(), GOLDEN_VERSION);
    expect(result.passed).toBe(true);
    expect(result.regressions).toHaveLength(0);
    expect(
      result.regressionsWithinTolerance.map((x) => x.metric),
    ).toContain("laneConfusion.overall");
  });

  it("fails on an out-of-tolerance regression", () => {
    const r = report({
      laneConfusion: {
        ...report().laneConfusion,
        overall: 0.98,
      },
    });
    const result = compareToBaseline(r, baseline(), GOLDEN_VERSION);
    expect(result.passed).toBe(false);
    expect(result.regressions.map((x) => x.metric)).toContain(
      "laneConfusion.overall",
    );
  });
});

describe("compareToBaseline — calibration ECE", () => {
  it("fails when ECE rises beyond tolerance", () => {
    // Baseline ECE 0.10, tolerance 0.02. Current 0.13 → delta +0.03 fails.
    const r = report({
      calibration: { buckets: [], ece: 0.13 },
    });
    const result = compareToBaseline(r, baseline(), GOLDEN_VERSION);
    expect(result.passed).toBe(false);
    expect(result.regressions.map((x) => x.metric)).toContain(
      "calibration.ece",
    );
  });
});

describe("compareToBaseline — p95 latency", () => {
  it("fails when p95 exceeds the budget", () => {
    const r = report({
      latency: {
        count: 9,
        p50: 100,
        p95: 5500,
        p99: 6000,
        max: 6100,
        budgetMs: 5000,
        budgetBreaches: ["some-case"],
      },
    });
    const result = compareToBaseline(r, baseline(), GOLDEN_VERSION);
    expect(result.passed).toBe(false);
    expect(result.regressions.map((x) => x.metric)).toContain("latency.p95");
  });
});

describe("compareToBaseline — golden-set version mismatch", () => {
  it("fails loudly without evaluating other metrics", () => {
    // Plant a fat regression so we can confirm it is NOT in the result.
    const r = report({
      falseNegativeRate: {
        totalRealNegatives: 7,
        leakedToMatch: 3,
        rate: 3 / 7,
        leakedCaseIds: ["a", "b", "c"],
      },
      laneConfusion: {
        ...report().laneConfusion,
        overall: 0.5,
      },
    });
    const result = compareToBaseline(r, baseline(), "different-hash-entirely");
    expect(result.passed).toBe(false);
    expect(result.goldenSetVersionMismatch).toBe(true);
    expect(result.regressions).toEqual([]);
    expect(result.regressionsWithinTolerance).toEqual([]);
    expect(result.improvements).toEqual([]);
  });
});

describe("compareToBaseline — all improved", () => {
  it("passes and lists every improvement", () => {
    // Baseline carries non-trivial numbers so improvements are possible.
    const b = baseline({
      metrics: {
        ...baseline().metrics,
        warningCheck: {
          presence: { tp: 7, tn: 1, fp: 1, fn: 0, accuracy: 0.85 },
          verbatim: { tp: 5, tn: 3, fp: 0, fn: 1, accuracy: 0.85 },
          allCaps: { tp: 5, tn: 3, fp: 0, fn: 1, accuracy: 0.85 },
        },
        calibration: { ece: 0.15 },
        laneConfusion: {
          ...baseline().metrics.laneConfusion,
          overall: 0.95,
        },
        latency: { p50: 100, p95: 200, p99: 250, max: 300 },
      },
    });
    const r = report({
      warningCheck: {
        presence: { tp: 8, tn: 1, fp: 0, fn: 0, accuracy: 0.95 },
        verbatim: { tp: 6, tn: 3, fp: 0, fn: 0, accuracy: 0.95 },
        allCaps: { tp: 6, tn: 3, fp: 0, fn: 0, accuracy: 0.95 },
      },
      calibration: { buckets: [], ece: 0.05 },
      laneConfusion: { ...report().laneConfusion, overall: 1 },
      latency: {
        count: 9,
        p50: 50,
        p95: 100,
        p99: 120,
        max: 150,
        budgetMs: 5000,
        budgetBreaches: [],
      },
    });
    const result = compareToBaseline(r, b, GOLDEN_VERSION);
    expect(result.passed).toBe(true);
    expect(result.regressions).toEqual([]);
    const improvedMetrics = result.improvements.map((x) => x.metric);
    expect(improvedMetrics).toContain("laneConfusion.overall");
    expect(improvedMetrics).toContain("warningCheck.presence.accuracy");
    expect(improvedMetrics).toContain("warningCheck.verbatim.accuracy");
    expect(improvedMetrics).toContain("warningCheck.allCaps.accuracy");
    expect(improvedMetrics).toContain("calibration.ece");
    expect(improvedMetrics).toContain("latency.p95");
  });
});
