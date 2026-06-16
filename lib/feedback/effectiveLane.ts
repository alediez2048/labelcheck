/**
 * Derive the agent's effective lane from a disposition + structured
 * reason summary (P5-3).
 *
 * Pure function — no I/O, no state, no time. Same input always returns
 * the same lane. The override detector (`override.ts`) then compares
 * the predicted lane against this lane to decide flag / clear /
 * agreement. The two-step split keeps the rules testable in isolation.
 *
 * Rules (observability.md "The agent-correction feedback loop"):
 *
 *   - `approve`              → `match`     (agent says it's fine)
 *   - `return_for_correction`:
 *     - any `failedFields[i].reason` matches the unreadable pattern
 *                              → `review`  (FR-26b unreadable path)
 *     - otherwise              → `mismatch`(at least one per-field defect)
 *
 * The unreadable pattern is intentionally broad — it covers the
 * matcher's structured reason output AND the variants an agent might
 * leave the failedField reason as. Same discipline as D4: the lane
 * derivation lives in code, the model never decides it.
 */

import type { Lane } from "@/types";

const UNREADABLE_PATTERN = /unreadable|please re-?upload|re-?submit a clearer/i;

export type EffectiveLaneInput = {
  kind: "approve" | "return_for_correction";
  returnReason?: {
    failedFields?: ReadonlyArray<{ reason: string }>;
  };
};

export function deriveEffectiveLane(
  disposition: EffectiveLaneInput,
): Lane {
  if (disposition.kind === "approve") {
    return "match";
  }
  const failedFields = disposition.returnReason?.failedFields ?? [];
  for (const f of failedFields) {
    if (UNREADABLE_PATTERN.test(f.reason)) {
      return "review";
    }
  }
  return "mismatch";
}
