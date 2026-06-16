/**
 * P5-5 — CI eval gate: regression comparator.
 *
 * Given a current `EvalReport` and an `EvalBaseline`, decide whether the
 * run passes the gate. The headline metric (false-negative rate) is a
 * hard fail on ANY positive delta beyond its tolerance — default `0.0`,
 * meaning a single leaked real-negative tanks the build. Other metrics
 * fail only when they move outside their tolerances.
 *
 * The result also surfaces:
 *   - regressionsWithinTolerance — moves the wrong way but inside the
 *     tolerance band; reported, not blocking. Noise vs. signal split.
 *   - improvements — moves the right way; reported to celebrate.
 *
 * A `golden_set_version` mismatch is a special early-exit: the only
 * legitimate fix is a deliberate re-baseline (see `docs/EVAL-BASELINE.md`),
 * so we return early without evaluating the rest of the metrics. The
 * caller renders a remediation pointer instead of a metric diff.
 */

import type { EvalReport } from "../types";

import type { EvalBaseline } from "./baseline";

/**
 * A metric moved in the wrong direction. `outOfTolerance` distinguishes
 * a noise wobble (false) from a true regression (true). Reports use
 * the same `Regression` row in two different sections.
 */
export type Regression = {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  tolerance: number;
  outOfTolerance: boolean;
};

export type Improvement = {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
};

export type GateResult = {
  passed: boolean;
  goldenSetVersionMismatch: boolean;
  baselineGoldenSetVersion: string;
  currentGoldenSetVersion: string;
  /** Regressions whose delta crossed the tolerance — these fail the gate. */
  regressions: Regression[];
  /** Within-tolerance noise wobbles — not failing, surfaced for review. */
  regressionsWithinTolerance: Regression[];
  improvements: Improvement[];
  /**
   * The headline metric delta (current − baseline). Positive = worse.
   * Surfaced explicitly so the one-line pass log and the failure log
   * can lead with it without re-deriving from the metric list.
   */
  headlineDelta: number;
};

/**
 * Direction conventions used below:
 *   - "lower-is-better" metrics:  ECE, false-negative rate, p95 latency.
 *     A positive delta (current − baseline > 0) is a regression.
 *   - "higher-is-better" metrics: accuracies (lane, warning sub-checks).
 *     A negative delta (current − baseline < 0) is a regression.
 *
 * `tolerance` is always a non-negative magnitude.
 */

function checkLowerIsBetter(
  metric: string,
  baseline: number,
  current: number,
  tolerance: number,
): Regression | Improvement | null {
  const delta = current - baseline;
  if (delta > 0) {
    return {
      metric,
      baseline,
      current,
      delta,
      tolerance,
      outOfTolerance: delta > tolerance,
    } satisfies Regression;
  }
  if (delta < 0) {
    return { metric, baseline, current, delta } satisfies Improvement;
  }
  return null;
}

function checkHigherIsBetter(
  metric: string,
  baseline: number,
  current: number,
  tolerance: number,
): Regression | Improvement | null {
  const delta = current - baseline;
  if (delta < 0) {
    return {
      metric,
      baseline,
      current,
      delta,
      tolerance,
      outOfTolerance: -delta > tolerance,
    } satisfies Regression;
  }
  if (delta > 0) {
    return { metric, baseline, current, delta } satisfies Improvement;
  }
  return null;
}

function isRegression(
  value: Regression | Improvement,
): value is Regression {
  return "tolerance" in value;
}

export function compareToBaseline(
  report: EvalReport,
  baseline: EvalBaseline,
  currentGoldenSetVersion: string,
): GateResult {
  const baselineGoldenSetVersion = baseline.golden_set_version;

  // Golden-set version mismatch — early exit. Only a deliberate
  // re-baseline (new commit, docs/EVAL-BASELINE.md convention) clears
  // this; the rest of the metric diff is moot until then.
  if (baselineGoldenSetVersion !== currentGoldenSetVersion) {
    return {
      passed: false,
      goldenSetVersionMismatch: true,
      baselineGoldenSetVersion,
      currentGoldenSetVersion,
      regressions: [],
      regressionsWithinTolerance: [],
      improvements: [],
      headlineDelta: 0,
    };
  }

  const tol = baseline.tolerances;
  const regressions: Regression[] = [];
  const within: Regression[] = [];
  const improvements: Improvement[] = [];

  // ----- Headline: false-negative rate (lower is better; tolerance default 0.0).
  const baselineFn = baseline.metrics.falseNegativeRate.rate;
  const currentFn = report.falseNegativeRate.rate;
  const headlineDelta = currentFn - baselineFn;
  const headline = checkLowerIsBetter(
    "falseNegativeRate.rate",
    baselineFn,
    currentFn,
    tol.falseNegativeRate,
  );
  if (headline) {
    if (isRegression(headline)) {
      if (headline.outOfTolerance) regressions.push(headline);
      else within.push(headline);
    } else {
      improvements.push(headline);
    }
  }

  // ----- Lane confusion overall accuracy (higher is better).
  const lane = checkHigherIsBetter(
    "laneConfusion.overall",
    baseline.metrics.laneConfusion.overall,
    report.laneConfusion.overall,
    tol.laneAccuracy,
  );
  if (lane) {
    if (isRegression(lane)) {
      if (lane.outOfTolerance) regressions.push(lane);
      else within.push(lane);
    } else {
      improvements.push(lane);
    }
  }

  // ----- Warning check sub-accuracies (higher is better).
  const warningSubchecks: Array<{
    metric: string;
    baseline: number;
    current: number;
    tolerance: number;
  }> = [
    {
      metric: "warningCheck.presence.accuracy",
      baseline: baseline.metrics.warningCheck.presence.accuracy,
      current: report.warningCheck.presence.accuracy,
      tolerance: tol.warningPresenceAccuracy,
    },
    {
      metric: "warningCheck.verbatim.accuracy",
      baseline: baseline.metrics.warningCheck.verbatim.accuracy,
      current: report.warningCheck.verbatim.accuracy,
      tolerance: tol.warningVerbatimAccuracy,
    },
    {
      metric: "warningCheck.allCaps.accuracy",
      baseline: baseline.metrics.warningCheck.allCaps.accuracy,
      current: report.warningCheck.allCaps.accuracy,
      tolerance: tol.warningAllCapsAccuracy,
    },
  ];
  for (const s of warningSubchecks) {
    const v = checkHigherIsBetter(s.metric, s.baseline, s.current, s.tolerance);
    if (!v) continue;
    if (isRegression(v)) {
      if (v.outOfTolerance) regressions.push(v);
      else within.push(v);
    } else {
      improvements.push(v);
    }
  }

  // ----- Calibration ECE (lower is better).
  const ece = checkLowerIsBetter(
    "calibration.ece",
    baseline.metrics.calibration.ece,
    report.calibration.ece,
    tol.calibrationEce,
  );
  if (ece) {
    if (isRegression(ece)) {
      if (ece.outOfTolerance) regressions.push(ece);
      else within.push(ece);
    } else {
      improvements.push(ece);
    }
  }

  // ----- p95 latency — hard budget ceiling, not a delta. NFR-1 says
  // p95 must stay ≤ 5000ms; budget breach IS the regression regardless
  // of where the baseline sat. We still record the delta vs. baseline
  // so the report shows the size of the move.
  const baselineP95 = baseline.metrics.latency.p95;
  const currentP95 = report.latency.p95;
  const p95Delta = currentP95 - baselineP95;
  if (currentP95 > tol.latencyP95BudgetMs) {
    regressions.push({
      metric: "latency.p95",
      baseline: baselineP95,
      current: currentP95,
      delta: p95Delta,
      tolerance: tol.latencyP95BudgetMs,
      outOfTolerance: true,
    });
  } else if (p95Delta < 0) {
    improvements.push({
      metric: "latency.p95",
      baseline: baselineP95,
      current: currentP95,
      delta: p95Delta,
    });
  }

  const passed = regressions.length === 0;
  return {
    passed,
    goldenSetVersionMismatch: false,
    baselineGoldenSetVersion,
    currentGoldenSetVersion,
    regressions,
    regressionsWithinTolerance: within,
    improvements,
    headlineDelta,
  };
}
