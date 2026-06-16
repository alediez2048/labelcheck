/**
 * Lane confusion matrix (P5-2; observability.md "Lane classification
 * accuracy").
 *
 * 3x3 matrix indexed `matrix[expected][predicted]`. Per-lane accuracy
 * is the diagonal cell divided by the row sum (the count of cases
 * whose ground-truth lane is that row). Overall accuracy is the sum of
 * the diagonal divided by the total number of cases.
 *
 * `safeDivide` returns 0 on a 0-denominator row so the report renders
 * cleanly for golden sets that don't cover every lane.
 */

import type { Lane } from "@/types";

import type { CaseRun, LaneConfusion } from "../types";

const LANES: ReadonlyArray<Lane> = ["match", "mismatch", "review"];

function emptyMatrix(): Record<Lane, Record<Lane, number>> {
  return {
    match: { match: 0, mismatch: 0, review: 0 },
    mismatch: { match: 0, mismatch: 0, review: 0 },
    review: { match: 0, mismatch: 0, review: 0 },
  };
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function computeLaneConfusion(
  runs: ReadonlyArray<CaseRun>,
): LaneConfusion {
  const matrix = emptyMatrix();
  for (const run of runs) {
    matrix[run.expectedLane][run.predictedLane] += 1;
  }

  const perLaneAccuracy: Record<Lane, number> = {
    match: 0,
    mismatch: 0,
    review: 0,
  };
  let diagonalSum = 0;
  for (const lane of LANES) {
    const row = matrix[lane];
    const rowSum = row.match + row.mismatch + row.review;
    perLaneAccuracy[lane] = safeDivide(row[lane], rowSum);
    diagonalSum += row[lane];
  }

  return {
    matrix,
    perLaneAccuracy,
    overall: safeDivide(diagonalSum, runs.length),
  };
}
