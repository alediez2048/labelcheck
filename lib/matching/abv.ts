/**
 * Alcohol content matching — stated-equals-stated (FR-9, A19).
 *
 * Both sides are normalised via `parseAbvPercent`, then compared as
 * numbers. TTB's real ABV tolerance tables vary by beverage type and
 * are not implemented in the prototype; encoding them slightly wrong
 * would be silently wrong, which is worse than visibly simplified
 * (see config/tolerances.json `alcoholContent.note`).
 */

import type { FaceKind } from "@/types";

import { parseAbvPercent } from "./normalize";
import type { MatchResult } from "./types";

export type AbvInput = {
  formValue: string;
  extracted: { value: string; face: FaceKind } | null;
};

export function matchAbv(input: AbvInput): MatchResult {
  if (input.extracted === null) {
    return {
      field: "alcohol_content",
      formValue: input.formValue,
      extractedValue: null,
      verdict: "not_found",
      reason: "Alcohol content not found on any label face",
      margin: -1,
      sourceFace: null,
    };
  }

  const formAbv = parseAbvPercent(input.formValue);
  const extAbv = parseAbvPercent(input.extracted.value);

  if (formAbv === null) {
    return {
      field: "alcohol_content",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "mismatch",
      reason: `Form alcohol content "${input.formValue}" could not be parsed as a percentage`,
      margin: -1,
      sourceFace: input.extracted.face,
    };
  }

  if (extAbv === null) {
    return {
      field: "alcohol_content",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "low_confidence",
      reason: `Label alcohol content "${input.extracted.value}" could not be parsed`,
      margin: 0,
      sourceFace: input.extracted.face,
    };
  }

  if (formAbv === extAbv) {
    return {
      field: "alcohol_content",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `Alcohol content matches (${formAbv}%)`,
      margin: 1,
      sourceFace: input.extracted.face,
    };
  }

  return {
    field: "alcohol_content",
    formValue: input.formValue,
    extractedValue: input.extracted.value,
    verdict: "mismatch",
    reason: `Alcohol content mismatch: form ${formAbv}% vs label ${extAbv}%`,
    margin: -1,
    sourceFace: input.extracted.face,
  };
}
