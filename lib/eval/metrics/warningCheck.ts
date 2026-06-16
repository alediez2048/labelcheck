/**
 * Government warning check accuracy (P5-2; observability.md
 * "Government-warning check accuracy", FR-11/FR-12).
 *
 * Reports three sub-numbers — presence, verbatim, ALL CAPS — over the
 * `government_warning` field result of each case.
 *
 * Ground-truth caveat
 * -------------------
 * The Phase 1 golden manifest doesn't tag cases with the three signals
 * independently (the existing shape exposes `expectedFlaggedFields`
 * only). The pragmatic shortcut: treat the warning's expected verdict
 * (mismatch iff `government_warning` is in `expectedFlaggedFields`,
 * otherwise match) as the ground truth for ALL three sub-metrics.
 * Where the golden case is structurally about a missing warning we
 * treat presence's ground truth as "absent"; otherwise "present".
 *
 * A sharper breakdown (separate ground truth per sub-check) lands when
 * the golden manifest gains explicit warning sub-labels — a future
 * ticket. Until then the three numbers move together, but they're at
 * least consistent with the case-level expected lane.
 */

import type { CaseRun, WarningCheckReport } from "../types";

type SubMetric = WarningCheckReport["presence"];

function emptySub(): SubMetric {
  return { tp: 0, tn: 0, fp: 0, fn: 0, accuracy: 0 };
}

function accuracy(sub: SubMetric): number {
  const total = sub.tp + sub.tn + sub.fp + sub.fn;
  return total === 0 ? 0 : (sub.tp + sub.tn) / total;
}

/**
 * Sentinel id for the structurally missing-warning case in the Phase 1
 * golden set. When the manifest grows a dedicated `presenceExpected`
 * flag we can drop this string check.
 */
const MISSING_WARNING_IDS: ReadonlySet<string> = new Set([
  "sample-warning-missing-001",
]);

function expectPresent(caseId: string, category: string): boolean {
  if (MISSING_WARNING_IDS.has(caseId)) return false;
  if (category === "unreadableImages") return false;
  return true;
}

export function computeWarningCheckMetrics(
  runs: ReadonlyArray<CaseRun>,
): WarningCheckReport {
  const presence = emptySub();
  const verbatim = emptySub();
  const allCaps = emptySub();

  for (const run of runs) {
    const warningField = run.fields.find((f) => f.field === "government_warning");
    const expectedFlagged = run.expectedFlaggedFields.includes("government_warning");

    // -------------------------------------------------------------------
    // Presence — was the warning treated as present?
    //   predicted positive (= present) when the field came back as
    //   anything other than `not_found`.
    //   ground-truth positive when the golden case isn't a structurally
    //   missing-warning case (id check) and isn't unreadable.
    // -------------------------------------------------------------------
    const predictedPresent =
      warningField !== undefined && warningField.verdict !== "not_found";
    const expectedPresent = expectPresent(run.caseId, run.category);

    if (predictedPresent && expectedPresent) presence.tp += 1;
    else if (predictedPresent && !expectedPresent) presence.fp += 1;
    else if (!predictedPresent && expectedPresent) presence.fn += 1;
    else presence.tn += 1;

    // -------------------------------------------------------------------
    // Verbatim — pragmatic shortcut, see header note. Predicted match
    // on the warning field == positive; expected match == positive.
    // -------------------------------------------------------------------
    const predictedVerbatim =
      warningField !== undefined && warningField.verdict === "match";
    const expectedVerbatim = !expectedFlagged;

    if (predictedVerbatim && expectedVerbatim) verbatim.tp += 1;
    else if (predictedVerbatim && !expectedVerbatim) verbatim.fp += 1;
    else if (!predictedVerbatim && expectedVerbatim) verbatim.fn += 1;
    else verbatim.tn += 1;

    // -------------------------------------------------------------------
    // ALL CAPS — same shortcut as verbatim. Only meaningful when
    // presence is true; we still tally so the table is honest about
    // the count.
    // -------------------------------------------------------------------
    const predictedAllCaps =
      warningField !== undefined && warningField.verdict === "match";
    const expectedAllCaps = !expectedFlagged;

    if (predictedAllCaps && expectedAllCaps) allCaps.tp += 1;
    else if (predictedAllCaps && !expectedAllCaps) allCaps.fp += 1;
    else if (!predictedAllCaps && expectedAllCaps) allCaps.fn += 1;
    else allCaps.tn += 1;
  }

  presence.accuracy = accuracy(presence);
  verbatim.accuracy = accuracy(verbatim);
  allCaps.accuracy = accuracy(allCaps);

  return { presence, verbatim, allCaps };
}
