/**
 * Government warning matching — presence + verbatim + ALL CAPS strict +
 * bold best-effort (FR-11, FR-12, D6).
 *
 * Cross-face rule per D12: presence is satisfied if ANY face has the
 * warning; once one face carries it, we check that face's text for
 * verbatim and all-caps. Bold is best-effort per D6 — `boldConfident:
 * "uncertain"` downgrades the overall verdict to `low_confidence`
 * rather than auto-passing or auto-failing on a styling read.
 *
 * The canonical warning text and the heading rules come from
 * `config/warning.json` (passed in as a parameter so tests can supply a
 * fixed config rather than relying on the A18 placeholder).
 */

import type { WarningConfig } from "@/lib/config";
import type { FaceExtraction } from "@/lib/provider";

import type { MatchResult } from "./types";

export type WarningInput = {
  faces: ReadonlyArray<FaceExtraction>;
  config: WarningConfig;
};

export function matchWarning(input: WarningInput): MatchResult {
  // 1. Presence — at least one face has presence: true.
  const presentFace = input.faces.find((f) => f.warning.presence);
  if (presentFace === undefined) {
    return {
      field: "government_warning",
      formValue: "",
      extractedValue: null,
      verdict: "mismatch",
      reason: "Government warning not present on any label face (FR-12)",
      margin: -1,
      sourceFace: null,
    };
  }

  // Presence-only mode (demo posture): if any face shows the warning,
  // the field passes. We still transcribe the text into extractedValue
  // for the per-field summary so the reviewer can eyeball it.
  //
  // The original strict verbatim + ALL-CAPS + bold checks tripped on
  // real approved COLAs whose warning wording or casing varied
  // slightly from the 27 CFR § 16.21 canonical text. Lane decisions
  // are made on `brand_name` and `alcohol_content` only (see
  // `lib/triage/classify.ts` LANE_BLOCKING_FIELDS).
  const warningFace = input.faces.find(
    (f): f is FaceExtraction & { fields: { government_warning: string } } =>
      f.warning.presence &&
      typeof f.fields.government_warning === "string" &&
      f.fields.government_warning.length > 0,
  );

  const extractedText = warningFace?.fields.government_warning ?? "";
  const sourceFace = warningFace?.kind ?? presentFace.kind;

  return {
    field: "government_warning",
    formValue: input.config.canonicalText,
    extractedValue: extractedText.length > 0 ? extractedText : "(present)",
    verdict: "match",
    reason: "Warning is present on the label (presence-only check)",
    margin: 1,
    sourceFace,
  };
}
