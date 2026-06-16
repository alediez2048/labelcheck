/**
 * The headline safety metric (P5-2; observability.md "False-negative
 * rate on real mismatches").
 *
 * Definition: of the cases whose ground-truth lane is NOT `match`
 * (i.e. real `mismatch` or `review` cases), what fraction did the
 * system mistakenly clear into the `match` lane? In a compliance tool
 * one missed defect is worse than two extra reviews — observability.md
 * is explicit that this number leads the report.
 *
 * `leakedCaseIds` lists the offenders so the Markdown report can name
 * them and the operator can debug the regression.
 */

import type { CaseRun, FalseNegativeReport } from "../types";

export function computeFalseNegativeRate(
  runs: ReadonlyArray<CaseRun>,
): FalseNegativeReport {
  const realNegatives = runs.filter((r) => r.expectedLane !== "match");
  const leaked = realNegatives.filter((r) => r.predictedLane === "match");
  const total = realNegatives.length;
  const rate = total === 0 ? 0 : leaked.length / total;
  return {
    totalRealNegatives: total,
    leakedToMatch: leaked.length,
    rate,
    leakedCaseIds: leaked.map((r) => r.caseId),
  };
}
