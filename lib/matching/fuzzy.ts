/**
 * Shared fuzzy matcher for brand, class/type, producer, address (FR-7, FR-8).
 *
 * Normalise → measure Levenshtein → compare similarity to the per-field
 * threshold from `config/tolerances.json`. Threshold is supplied by the
 * orchestrator, never baked into this file (FR-25).
 *
 * Similarity uses `1 − distance / max(len)` rather than a hand-rolled
 * formula because that's the canonical Levenshtein-similarity ratio and
 * the metric that calibration data (P5-2) will be expressed in.
 */

import { distance } from "fastest-levenshtein";

import type { FaceKind, FieldName } from "@/types";

import { normalizeForFuzzy } from "./normalize";
import type { MatchResult } from "./types";

export type FuzzyInput = {
  field: FieldName;
  formValue: string;
  extracted: { value: string; face: FaceKind } | null;
  minSimilarity: number;
  fieldLabel: string;
};

export function matchFuzzy(input: FuzzyInput): MatchResult {
  if (input.extracted === null) {
    return {
      field: input.field,
      formValue: input.formValue,
      extractedValue: null,
      verdict: "not_found",
      reason: `${input.fieldLabel} not found on any label face`,
      margin: -1,
      sourceFace: null,
    };
  }

  const formNorm = normalizeForFuzzy(input.formValue);
  const extNorm = normalizeForFuzzy(input.extracted.value);

  // Placeholder form values — when the PDF parser couldn't read this
  // field, the upload component substitutes "Unknown brand" / "UNKNOWN"
  // / "Unknown producer" / "Unknown address" / "Unknown". Treat these
  // as "no form signal" and approve whatever's on the label rather
  // than penalising the verdict for a parser miss.
  if (
    formNorm === "unknown" ||
    formNorm.startsWith("unknown ") ||
    formNorm === "0" ||
    formNorm === "0 ml"
  ) {
    return {
      field: input.field,
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `${input.fieldLabel}: form value not parseable, accepting label "${input.extracted.value}"`,
      margin: 1,
      sourceFace: input.extracted.face,
    };
  }

  // Empty form value against a non-empty label is a mismatch by definition.
  if (formNorm.length === 0) {
    return {
      field: input.field,
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "mismatch",
      reason: `${input.fieldLabel} on the form is empty but the label shows "${input.extracted.value}"`,
      margin: -1,
      sourceFace: input.extracted.face,
    };
  }

  // Substring containment — if every word from the form appears in the
  // label's value, treat it as a match. Brand names get padded on
  // labels with class/type / region / producer descriptors, so a form
  // value of "OLD CEDAR" should still match a label that reads
  // "OLD CEDAR DISTILLERY KENTUCKY STRAIGHT BOURBON".
  const formWords = formNorm.split(/\s+/).filter((w) => w.length > 0);
  const extWords = extNorm.split(/\s+/).filter((w) => w.length > 0);
  const extWordSet = new Set(extWords);
  if (
    formWords.length > 0 &&
    formWords.every((w) => extWordSet.has(w))
  ) {
    return {
      field: input.field,
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `${input.fieldLabel} matches (form words found on label)`,
      margin: 1,
      sourceFace: input.extracted.face,
    };
  }

  const dist = distance(formNorm, extNorm);
  const maxLen = Math.max(formNorm.length, extNorm.length, 1);
  const similarity = 1 - dist / maxLen;
  const margin = similarity - input.minSimilarity;

  if (similarity >= input.minSimilarity) {
    return {
      field: input.field,
      formValue: input.formValue,
      extractedValue: input.extracted.value,
      verdict: "match",
      reason: `${input.fieldLabel} matches (similarity ${(similarity * 100).toFixed(1)}%)`,
      margin,
      sourceFace: input.extracted.face,
    };
  }

  return {
    field: input.field,
    formValue: input.formValue,
    extractedValue: input.extracted.value,
    verdict: "mismatch",
    reason: `${input.fieldLabel}: form "${input.formValue}" vs label "${input.extracted.value}"`,
    margin,
    sourceFace: input.extracted.face,
  };
}
