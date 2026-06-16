/**
 * Offline eval harness — types (P5-2).
 *
 * One source of truth for the shapes the harness produces. Imported by
 * the runner (`runner.ts`), each metric function under `metrics/`, and
 * the report builders (`report/`). P5-4 (model bake-off) and P5-5 (CI
 * gate) read the same `EvalReport` shape so this file is part of the
 * stable surface — extend in additive ways.
 *
 * Golden-set manifest note
 * ------------------------
 * The ticket spec calls for `tests/golden/manifest.json`. The Phase 1
 * golden set ships as a typed array at `tests/golden/index.ts` — the
 * typed array IS the manifest, and the runner imports it directly.
 * Duplicating it as JSON would be drift bait; the `GoldenCase` type
 * below is the same shape `GoldenEntry` already exposes.
 */

import type { SampleForm } from "@/fixtures/samples";
import type {
  BeverageType,
  FaceKind,
  FieldName,
  Lane,
  Verdict,
} from "@/types";

/**
 * One row from the golden set, in the shape the eval runner consumes.
 * Structurally identical to `GoldenEntry` from `tests/golden/index.ts`;
 * re-declared here so the eval public API doesn't pull a `tests/`
 * import into downstream callers (the runner itself lives outside the
 * Next build and is fine).
 */
export type GoldenCase = {
  id: string;
  category: string;
  acceptanceCriterion: string;
  notes: string;
  beverageType: BeverageType;
  form: SampleForm;
  expectedLane: Lane;
  expectedFlaggedFields?: ReadonlyArray<FieldName>;
  laneMustNotBe?: Lane;
};

/**
 * One pipeline run. The runner produces a `CaseRun` per golden entry;
 * every metric function reads only this shape. `predictedFlaggedFields`
 * is derived from `fields` (verdict !== "match") but is precomputed for
 * convenience and to keep the metric functions pure.
 */
export type CaseRun = {
  caseId: string;
  category: string;
  expectedLane: Lane;
  predictedLane: Lane;
  expectedFlaggedFields: ReadonlyArray<FieldName>;
  predictedFlaggedFields: ReadonlyArray<FieldName>;
  /** Per-field result rows the pipeline produced. */
  fields: ReadonlyArray<{
    field: FieldName;
    verdict: Verdict;
    confidence: number;
    sourceFace: FaceKind | null;
  }>;
  overallConfidence: number;
  durationMs: number;
  extractionFailed: boolean;
};

/**
 * Per-field precision / recall / F1 — observability.md "Per-field
 * precision and recall". A field is a "positive prediction" iff its
 * predicted verdict is anything other than `match` (the field landed
 * in `predictedFlaggedFields`).
 */
export type PerFieldMetric = {
  field: FieldName;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1: number;
};

/**
 * 3x3 lane confusion — observability.md "Lane classification accuracy".
 * `matrix[expected][predicted]` is the count. Per-lane accuracy is the
 * diagonal cell divided by the row sum (expected count for that lane).
 */
export type LaneConfusion = {
  matrix: Record<Lane, Record<Lane, number>>;
  perLaneAccuracy: Record<Lane, number>;
  overall: number;
};

/**
 * The headline safety metric — observability.md "False-negative rate
 * on real mismatches". `totalRealNegatives` is the count of cases whose
 * expected lane is mismatch OR review (a "real" negative — the system
 * should NOT have cleared it). `leakedToMatch` is the subset that
 * predicted `match`. `rate` is the ratio (0 if denom is 0).
 *
 * `leakedCaseIds` lets the Markdown report list the specific cases that
 * failed; debug surface, not a metric.
 */
export type FalseNegativeReport = {
  totalRealNegatives: number;
  leakedToMatch: number;
  rate: number;
  leakedCaseIds: ReadonlyArray<string>;
};

/**
 * Government-warning check accuracy — observability.md
 * "Government-warning check accuracy", FR-11 / FR-12. Three sub-metrics:
 * presence, verbatim, ALL CAPS. The current golden manifest doesn't
 * break ground-truth out into these three sub-signals; the runner
 * treats the warning field's expected verdict as the ground truth for
 * all three (documented in `metrics/warningCheck.ts`). A sharper
 * breakdown lands when the golden manifest gains explicit warning
 * sub-labels.
 */
export type WarningCheckReport = {
  presence: { tp: number; tn: number; fp: number; fn: number; accuracy: number };
  verbatim: { tp: number; tn: number; fp: number; fn: number; accuracy: number };
  allCaps: { tp: number; tn: number; fp: number; fn: number; accuracy: number };
};

/**
 * One row of the confidence calibration curve — D5 validates the
 * code-derived confidence by buckets of predicted confidence vs.
 * observed accuracy.
 */
export type CalibrationBucket = {
  /** Bucket lower bound (inclusive). */
  lower: number;
  /** Bucket upper bound (exclusive; inclusive on the top bucket where upper === 1). */
  upper: number;
  count: number;
  /** Mean of confidences in this bucket; 0 when count === 0. */
  predictedMean: number;
  /** Fraction of cases where predictedLane === expectedLane; 0 when count === 0. */
  observedAccuracy: number;
};

/**
 * Calibration report — 10 fixed-width buckets + the Expected Calibration
 * Error (ECE). Reference: Guo et al. 2017 (https://arxiv.org/abs/1706.04599).
 */
export type CalibrationReport = {
  buckets: ReadonlyArray<CalibrationBucket>;
  /** Sum over non-empty buckets of (count / total) * |observedAccuracy - predictedMean|. */
  ece: number;
};

/**
 * Latency report — observability.md "Latency distribution", NFR-1.
 * `budgetBreaches` carries the case ids whose `durationMs` exceeded
 * `budgetMs` so the Markdown report can list them.
 */
export type LatencyReport = {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  budgetMs: number;
  budgetBreaches: ReadonlyArray<string>;
};

/**
 * The structured eval report — the shape the JSON file at
 * `eval-reports/<ts>/report.json` carries and the Markdown renderer in
 * `report/markdown.ts` reads.
 *
 * No applicant text — case ids are internal stable strings, lane / verdict
 * are enums, confidences are derived numbers. NFR-4 holds at this seam.
 */
export type EvalReport = {
  runStartedAt: string;
  /**
   * Dataset / provider tag for the report. `mock` and `live` flag a
   * golden-set run on the mock or live vision provider; `corrections`
   * flags an `eval --dataset=corrections` run over the accumulated
   * agent-correction corpus (P5-3).
   */
  provider: "mock" | "live" | "corrections";
  caseCount: number;
  /** Headline metric — printed first in the Markdown. */
  falseNegativeRate: FalseNegativeReport;
  laneConfusion: LaneConfusion;
  warningCheck: WarningCheckReport;
  calibration: CalibrationReport;
  perField: ReadonlyArray<PerFieldMetric>;
  latency: LatencyReport;
};
