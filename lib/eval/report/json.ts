/**
 * JSON report writer (P5-2).
 *
 * The structured machine-readable form of `EvalReport`. P5-4 (bake-off)
 * reads this; P5-5 (CI gate) reads this. Pretty-printed with 2-space
 * indent so the diff between two runs is human-skimmable when the
 * operator opens it.
 *
 * No applicant text lives in `EvalReport` — all values are enums,
 * counts, ratios, and stable case ids. NFR-4 holds at this seam without
 * additional redaction.
 */

import type { EvalReport } from "../types";

export function buildJsonReport(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}
