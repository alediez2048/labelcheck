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

import { normalizeWarningText } from "./normalize";
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

  // 2. Find the transcribed warning text on a face that reports presence.
  const warningFace = input.faces.find(
    (f): f is FaceExtraction & { fields: { government_warning: string } } =>
      f.warning.presence && typeof f.fields.government_warning === "string" && f.fields.government_warning.length > 0,
  );

  if (warningFace === undefined) {
    return {
      field: "government_warning",
      formValue: "",
      extractedValue: null,
      verdict: "low_confidence",
      reason: "Warning detected on a face but text could not be transcribed — route to human review",
      margin: 0,
      sourceFace: presentFace.kind,
    };
  }

  const extractedText = warningFace.fields.government_warning;
  const sourceFace = warningFace.kind;

  // 3. ALL CAPS heading check (strict per FR-11).
  if (
    input.config.headingCapsRequired &&
    !extractedText.includes(input.config.headingText)
  ) {
    return {
      field: "government_warning",
      formValue: input.config.canonicalText,
      extractedValue: extractedText,
      verdict: "mismatch",
      reason: `Warning heading must read "${input.config.headingText}" in ALL CAPS (FR-11)`,
      margin: -1,
      sourceFace,
    };
  }

  // 4. Verbatim text check — whitespace-normalised but byte-for-byte
  //    otherwise per FR-11.
  const canonicalNorm = normalizeWarningText(input.config.canonicalText);
  const extractedNorm = normalizeWarningText(extractedText);
  if (canonicalNorm !== extractedNorm) {
    return {
      field: "government_warning",
      formValue: input.config.canonicalText,
      extractedValue: extractedText,
      verdict: "mismatch",
      reason: "Warning text differs from the canonical 27 CFR § 16.21 wording (FR-11)",
      margin: -1,
      sourceFace,
    };
  }

  // 5. Bold best-effort (D6) — uncertain downgrades to low_confidence.
  if (warningFace.warning.boldConfident === "uncertain") {
    return {
      field: "government_warning",
      formValue: input.config.canonicalText,
      extractedValue: extractedText,
      verdict: "low_confidence",
      reason: "Warning text and ALL CAPS verified, but bold styling is uncertain — route to human review (D6)",
      margin: 0,
      sourceFace,
    };
  }

  if (input.config.headingBoldRequired && warningFace.warning.boldConfident === "no") {
    return {
      field: "government_warning",
      formValue: input.config.canonicalText,
      extractedValue: extractedText,
      verdict: "mismatch",
      reason: "Warning heading must be bold (FR-11)",
      margin: -1,
      sourceFace,
    };
  }

  // 6. Legibility (D7-driven re-read flag) — log only; doesn't change
  //    verdict at this layer (the triage classifier in P1-5 will route
  //    a low-legibility face into the review lane if confidence drops).

  return {
    field: "government_warning",
    formValue: input.config.canonicalText,
    extractedValue: extractedText,
    verdict: "match",
    reason: "Warning present, verbatim, ALL CAPS, bold confirmed",
    margin: 1,
    sourceFace,
  };
}
