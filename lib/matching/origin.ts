/**
 * Country of origin matching — exact, case-folded, whitespace-collapsed.
 *
 * Only invoked when the beverage type requires it (e.g. imports per
 * `config/fields-by-type.json`). For domestic spirits the field is not
 * in the required-fields list and the orchestrator never calls this
 * matcher.
 */

import type { FaceKind } from "@/types";

import type { MatchResult } from "./types";

export type OriginInput = {
  formValue: string;
  extracted: { value: string; face: FaceKind } | null;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchOrigin(input: OriginInput): MatchResult {
  if (input.extracted === null) {
    return {
      field: "country_of_origin",
      formValue: input.formValue,
      extractedValue: null,
      verdict: "not_found",
      reason: "Country of origin not found on any label face",
      margin: -1,
      sourceFace: null,
    };
  }

  const formNorm = normalize(input.formValue);
  const extNorm = normalize(input.extracted.value);

  if (formNorm.length > 0 && formNorm === extNorm) {
    return {
      field: "country_of_origin",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `Country of origin matches (${input.extracted.value})`,
      margin: 1,
      sourceFace: input.extracted.face,
    };
  }

  return {
    field: "country_of_origin",
    formValue: input.formValue,
    extractedValue: input.extracted.value,
    verdict: "mismatch",
    reason: `Country of origin mismatch: form "${input.formValue}" vs label "${input.extracted.value}"`,
    margin: -1,
    sourceFace: input.extracted.face,
  };
}
