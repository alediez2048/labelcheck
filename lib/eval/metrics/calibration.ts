/**
 * Confidence calibration (P5-2; observability.md "Confidence
 * calibration"; systemsdesign.md D5).
 *
 * 10 fixed-width buckets — [0.0, 0.1), [0.1, 0.2), ..., [0.9, 1.0]. The
 * top bucket is inclusive of 1 so a perfectly-confident case isn't
 * silently dropped. Per bucket we report:
 *   - count
 *   - predictedMean: mean confidence of cases in the bucket
 *   - observedAccuracy: fraction where predictedLane === expectedLane
 *
 * ECE (Expected Calibration Error) = sum over non-empty buckets of
 * (count / total) * |observedAccuracy - predictedMean|. Reference:
 * Guo et al. 2017, https://arxiv.org/abs/1706.04599.
 *
 * Empty buckets carry count=0 and 0s for both means; they do not
 * contribute to the ECE.
 *
 * Why this matters: D5 says the code-derived confidence has to track
 * correctness or the lane thresholds are wrong. The calibration table
 * is how that claim gets tested with evidence.
 */

import type {
  CalibrationBucket,
  CalibrationReport,
  CaseRun,
} from "../types";

const BUCKET_COUNT = 10;

/**
 * Pick the bucket a confidence belongs to. Bucket i covers
 * [i/10, (i+1)/10). The top bucket (i=9) is inclusive of 1.
 */
function bucketIndex(confidence: number): number {
  if (confidence >= 1) return BUCKET_COUNT - 1;
  if (confidence < 0) return 0;
  return Math.floor(confidence * BUCKET_COUNT);
}

export function computeCalibration(
  runs: ReadonlyArray<CaseRun>,
): CalibrationReport {
  const grouped: CaseRun[][] = Array.from({ length: BUCKET_COUNT }, () => []);
  for (const run of runs) {
    const idx = bucketIndex(run.overallConfidence);
    const bucket = grouped[idx];
    if (bucket !== undefined) bucket.push(run);
  }

  const buckets: CalibrationBucket[] = [];
  let ece = 0;
  const total = runs.length;

  for (let i = 0; i < BUCKET_COUNT; i++) {
    const lower = i / BUCKET_COUNT;
    const upper = (i + 1) / BUCKET_COUNT;
    const bucketRuns = grouped[i] ?? [];
    const count = bucketRuns.length;
    if (count === 0) {
      buckets.push({
        lower,
        upper,
        count: 0,
        predictedMean: 0,
        observedAccuracy: 0,
      });
      continue;
    }
    const predictedMean =
      bucketRuns.reduce((acc, r) => acc + r.overallConfidence, 0) / count;
    const correct = bucketRuns.filter(
      (r) => r.predictedLane === r.expectedLane,
    ).length;
    const observedAccuracy = correct / count;
    buckets.push({ lower, upper, count, predictedMean, observedAccuracy });
    if (total > 0) {
      ece += (count / total) * Math.abs(observedAccuracy - predictedMean);
    }
  }

  return { buckets, ece };
}
