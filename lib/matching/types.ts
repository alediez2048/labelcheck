/**
 * Internal type returned by every per-field matcher.
 *
 * Distinct from `FieldResult` in `@/types` because `confidence` is
 * derived later by P1-4 from `margin` plus the model's per-region
 * legibility flag — keeping the two types separate makes it impossible
 * for a matcher to accidentally populate a confidence number itself,
 * which would silently violate D5.
 *
 * `margin` is signed: positive on a pass (distance from threshold,
 * larger = more confident), zero on borderline, negative on a fail
 * (distance into the fail region). P1-4 reads margin and converts to a
 * normalised 0..1 confidence per the field's rule. For exact-match
 * passes / fails margin is `1` / `-1` because there's no continuous
 * distance metric.
 */

import type { FaceKind, FieldName, Verdict } from "@/types";

export type MatchResult = {
  field: FieldName;
  formValue: string;
  extractedValue: string | null;
  verdict: Verdict;
  reason: string;
  margin: number;
  sourceFace: FaceKind | null;
};
