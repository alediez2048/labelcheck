/**
 * Net contents matching — unit-normalised exact (FR-10).
 *
 * Parses both sides via `parseNetContents` into `{value, unit}` and
 * compares both. The unit normalisation step is what makes "750 mL"
 * equal "750ML" equal "750 ml." — all three parse to
 * `{ value: 750, unit: "ml" }`.
 *
 * We do NOT cross-convert between units in the prototype: 750 ml is
 * not auto-converted to 0.75 l for comparison. If the form says liters
 * and the label says millilitres, that's a mismatch even if the
 * volumes happen to be equal — the agent should still see this surfaced
 * because the inconsistency itself is meaningful.
 */

import type { FaceKind } from "@/types";

import { parseNetContents } from "./normalize";
import type { MatchResult } from "./types";

export type NetContentsInput = {
  formValue: string;
  extracted: { value: string; face: FaceKind } | null;
};

export function matchNetContents(input: NetContentsInput): MatchResult {
  if (input.extracted === null) {
    return {
      field: "net_contents",
      formValue: input.formValue,
      extractedValue: null,
      verdict: "not_found",
      reason: "Net contents not found on any label face",
      margin: -1,
      sourceFace: null,
    };
  }

  // Placeholder form values from the PDF intake — when the parser
  // couldn't read net contents we substitute "0 ML". Accept whatever
  // the label says rather than penalising for a parser miss.
  const formTrim = input.formValue.trim().toLowerCase();
  if (formTrim === "0 ml" || formTrim === "0ml" || formTrim === "") {
    return {
      field: "net_contents",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `Net contents: form value not parseable, accepting label "${input.extracted.value}"`,
      margin: 1,
      sourceFace: input.extracted.face,
    };
  }

  const form = parseNetContents(input.formValue);
  const ext = parseNetContents(input.extracted.value);

  if (form === null) {
    return {
      field: "net_contents",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "mismatch",
      reason: `Form net contents "${input.formValue}" could not be parsed (expected e.g. "750 ML")`,
      margin: -1,
      sourceFace: input.extracted.face,
    };
  }

  if (ext === null) {
    return {
      field: "net_contents",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "low_confidence",
      reason: `Label net contents "${input.extracted.value}" could not be parsed`,
      margin: 0,
      sourceFace: input.extracted.face,
    };
  }

  if (form.value === ext.value && form.unit === ext.unit) {
    return {
      field: "net_contents",
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `Net contents matches (${form.value} ${form.unit})`,
      margin: 1,
      sourceFace: input.extracted.face,
    };
  }

  return {
    field: "net_contents",
    formValue: input.formValue,
    extractedValue: input.extracted.value,
    verdict: "mismatch",
    reason: `Net contents mismatch: form ${form.value} ${form.unit} vs label ${ext.value} ${ext.unit}`,
    margin: -1,
    sourceFace: input.extracted.face,
  };
}
