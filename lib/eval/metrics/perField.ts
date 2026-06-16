/**
 * Per-field precision / recall / F1 (P5-2; observability.md
 * "Per-field precision and recall").
 *
 * For each `FieldName`:
 *   - A "positive prediction" is the field appearing in
 *     `CaseRun.predictedFlaggedFields` (the matcher returned a verdict
 *     other than `match`).
 *   - The ground-truth positive is the field appearing in
 *     `CaseRun.expectedFlaggedFields`.
 *
 * Precision = TP / (TP + FP); recall = TP / (TP + FN); F1 = 2PR / (P + R).
 * All three are 0 when the denominator is 0 — a field that never
 * appeared as either a prediction or a ground-truth positive carries
 * 0/0/0 and a row of zeros in the report, which is intentionally
 * neutral: it neither props up nor drags the overall picture.
 *
 * The field set comes from the canonical `FieldName` enum so the report
 * is stable run-to-run; missing fields show as zero rows rather than
 * disappearing.
 */

import type { FieldName } from "@/types";

import type { CaseRun, PerFieldMetric } from "../types";

const ALL_FIELDS: ReadonlyArray<FieldName> = [
  "brand_name",
  "fanciful_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "producer_name",
  "producer_address",
  "country_of_origin",
  "government_warning",
];

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function computePerFieldMetrics(
  runs: ReadonlyArray<CaseRun>,
): PerFieldMetric[] {
  return ALL_FIELDS.map((field) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    for (const run of runs) {
      const predicted = run.predictedFlaggedFields.includes(field);
      const expected = run.expectedFlaggedFields.includes(field);
      if (predicted && expected) tp += 1;
      else if (predicted && !expected) fp += 1;
      else if (!predicted && expected) fn += 1;
      else tn += 1;
    }

    const precision = safeDivide(tp, tp + fp);
    const recall = safeDivide(tp, tp + fn);
    const f1 = safeDivide(2 * precision * recall, precision + recall);

    return {
      field,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      trueNegatives: tn,
      precision,
      recall,
      f1,
    };
  });
}
