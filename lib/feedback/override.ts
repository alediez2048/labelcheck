/**
 * Override detector (P5-3).
 *
 * Pure function comparing the tool's predicted lane to the agent's
 * effective lane and classifying the result into one of three
 * buckets. Same D4 discipline as `effectiveLane.ts` — the decision is
 * in code, not in the model, and is deterministic + unit-testable.
 *
 * Buckets:
 *   - `agreement` — same lane both sides.
 *   - `flag`      — tool said `match`, agent disagreed → the tool likely
 *                   missed a defect.
 *   - `clear`     — tool said `mismatch` or `review`, agent approved →
 *                   the tool likely over-flagged.
 *
 * Edge case: both lanes non-match but DIFFERENT (e.g. tool said
 * `mismatch`, agent said `review`). The agent's call is still ground
 * truth; treat as `flag` because the downstream consumer (bake-off,
 * fine-tuner) needs to know the tool's lane was wrong.
 */

import type { Lane } from "@/types";

import type { OverrideKind } from "./types";

export function detectOverride(
  predictedLane: Lane,
  effectiveLane: Lane,
): OverrideKind {
  if (predictedLane === effectiveLane) {
    return "agreement";
  }
  if (predictedLane === "match" && effectiveLane !== "match") {
    return "flag";
  }
  if (predictedLane !== "match" && effectiveLane === "match") {
    return "clear";
  }
  // Both non-match but different (e.g. mismatch → review).
  // Agent's call is ground truth, treat as a flag for downstream.
  return "flag";
}
