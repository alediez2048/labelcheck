/**
 * Matching engine orchestrator (FR-7 through FR-12, FR-25, D4, D5, D6).
 *
 * Walks the per-beverage-type required fields, dispatches each to the
 * right per-field matcher, and returns a `MatchResult[]`. The model has
 * produced the transcription (P1-2); from here every decision is code
 * (D4). Confidence derivation is P1-4; this engine reports `margin` so
 * P1-4 can convert.
 *
 * All thresholds and the canonical warning text come from `lib/config`
 * (FR-25); nothing in this engine is hardcoded.
 */

import { getTolerances, getWarningConfig, getRequiredFields, type FieldRule, type TolerancesConfig, type WarningConfig } from "@/lib/config";
import type { ExtractionResponse, FaceExtraction } from "@/lib/provider";
import type { BeverageType, FaceKind, FieldName, FieldResult } from "@/types";

import { matchAbv } from "./abv";
import {
  deriveConfidence,
  ruleInputFor,
  type LegibilitySignal,
} from "./confidence";
import { matchFuzzy } from "./fuzzy";
import { matchNetContents } from "./netContents";
import { matchOrigin } from "./origin";
import type { MatchResult } from "./types";
import { matchWarning } from "./warning";

export type { MatchResult } from "./types";

type ConfidenceRuleArg = ReturnType<typeof ruleInputFor> | { kind: "warning" };

/**
 * Form fields as they arrive at the matching engine — camelCase keys
 * matching `FormFields` in `types/domain.ts`.
 */
export type FormFieldsInput = {
  brandName?: string;
  fancifulName?: string;
  classType?: string;
  alcoholContent?: string;
  netContents?: string;
  producerName?: string;
  producerAddress?: string;
  countryOfOrigin?: string;
};

/**
 * Map between the snake_case wire vocabulary (`FieldName`) and the
 * camelCase form-side / config-side vocabulary. Same translation as
 * `lib/extraction/service.ts`'s map but in the reverse direction.
 */
const FIELD_NAME_TO_CONFIG_KEY: Readonly<Record<FieldName, string>> = {
  brand_name: "brandName",
  fanciful_name: "fancifulName",
  class_type: "classType",
  alcohol_content: "alcoholContent",
  net_contents: "netContents",
  producer_name: "producerName",
  producer_address: "producerAddress",
  country_of_origin: "countryOfOrigin",
  government_warning: "government_warning",
};

const FIELD_LABELS: Readonly<Record<FieldName, string>> = {
  brand_name: "Brand name",
  fanciful_name: "Fanciful name",
  class_type: "Class / type",
  alcohol_content: "Alcohol content",
  net_contents: "Net contents",
  producer_name: "Producer name",
  producer_address: "Producer address",
  country_of_origin: "Country of origin",
  government_warning: "Government warning",
};

/**
 * Find an extracted value for a given field across all faces.
 * Returns the first face's value (D12 — "satisfied if found on ANY face").
 * The multi-face merge in P1-6 will refine this with priority + dedup;
 * for now first-found-wins.
 */
function findExtracted(
  faces: ReadonlyArray<FaceExtraction>,
  field: FieldName,
): { value: string; face: FaceKind } | null {
  for (const face of faces) {
    const value = face.fields[field];
    if (typeof value === "string" && value.length > 0) {
      return { value, face: face.kind };
    }
  }
  return null;
}

function getRule(tolerances: TolerancesConfig, field: FieldName): FieldRule | undefined {
  const configKey = FIELD_NAME_TO_CONFIG_KEY[field];
  return (tolerances as unknown as Record<string, FieldRule>)[configKey];
}

function getFormValue(form: FormFieldsInput, field: FieldName): string {
  const configKey = FIELD_NAME_TO_CONFIG_KEY[field];
  const value = (form as unknown as Record<string, string | undefined>)[configKey];
  return value ?? "";
}

const CONFIG_KEY_TO_FIELD_NAME: Readonly<Record<string, FieldName>> = {
  brandName: "brand_name",
  fancifulName: "fanciful_name",
  classType: "class_type",
  alcoholContent: "alcohol_content",
  netContents: "net_contents",
  producerName: "producer_name",
  producerAddress: "producer_address",
  countryOfOrigin: "country_of_origin",
  government_warning: "government_warning",
};

/**
 * Inputs for the orchestrator. `tolerances` and `warningConfig` are
 * exposed so tests can supply fixed values rather than relying on
 * `config/warning.json`'s A18 placeholder. In production the route
 * handler passes nothing and the orchestrator reads from `lib/config`.
 */
export type MatchApplicationInput = {
  beverageType: BeverageType;
  form: FormFieldsInput;
  extraction: ExtractionResponse;
  tolerances?: TolerancesConfig;
  warningConfig?: WarningConfig;
};

/**
 * Look up the model's per-region legibility flag for the face a field
 * was found on. For the prototype we use the face's `warning.legibility`
 * as a proxy for the WHOLE face's image quality — the warning is the
 * smallest, hardest-to-read region, so if it's legible the rest of the
 * face very likely is too. P5-2 calibration will tell us if this proxy
 * is too coarse; per-field legibility is a future provider concern.
 */
function legibilityFor(
  faces: ReadonlyArray<FaceExtraction>,
  sourceFace: FaceKind | null,
): LegibilitySignal {
  if (sourceFace === null) return "good";
  const face = faces.find((f) => f.kind === sourceFace);
  return face?.warning.legibility ?? "good";
}

/**
 * Promote a `MatchResult` to a `FieldResult` by deriving confidence in
 * code from the margin + legibility (D5). `margin` is internal to the
 * matching engine; `confidence` is what the triage classifier reads.
 */
function attachConfidence(
  result: MatchResult,
  rule: ConfidenceRuleArg,
  legibility: LegibilitySignal,
  confidenceConfig: TolerancesConfig["confidence"],
): FieldResult {
  const confidence = deriveConfidence({
    verdict: result.verdict,
    margin: result.margin,
    rule,
    legibility,
    config: confidenceConfig,
  });
  return {
    field: result.field,
    formValue: result.formValue,
    extractedValue: result.extractedValue,
    verdict: result.verdict,
    confidence,
    reason: result.reason,
    sourceFace: result.sourceFace,
  };
}

export function matchApplication(input: MatchApplicationInput): FieldResult[] {
  const tolerances = input.tolerances ?? getTolerances();
  const warningConfig = input.warningConfig ?? getWarningConfig();
  const requiredFields = getRequiredFields(input.beverageType);

  const results: FieldResult[] = [];

  for (const configKey of requiredFields) {
    const field = CONFIG_KEY_TO_FIELD_NAME[configKey];
    if (field === undefined) continue;

    if (field === "government_warning") {
      const warningResult = matchWarning({
        faces: input.extraction.faces,
        config: warningConfig,
      });
      results.push(
        attachConfidence(
          warningResult,
          { kind: "warning" },
          legibilityFor(input.extraction.faces, warningResult.sourceFace),
          tolerances.confidence,
        ),
      );
      continue;
    }

    const formValue = getFormValue(input.form, field);
    const extracted = findExtracted(input.extraction.faces, field);
    const rule = getRule(tolerances, field);

    if (!rule) {
      const matchResult: MatchResult = {
        field,
        formValue,
        extractedValue: extracted?.value ?? null,
        verdict: "low_confidence",
        reason: `No tolerance rule configured for ${FIELD_LABELS[field]}`,
        margin: 0,
        sourceFace: extracted?.face ?? null,
      };
      results.push(
        attachConfidence(
          matchResult,
          { kind: "exact" },
          legibilityFor(input.extraction.faces, matchResult.sourceFace),
          tolerances.confidence,
        ),
      );
      continue;
    }

    const matchResult = dispatch({ field, formValue, extracted, rule });
    results.push(
      attachConfidence(
        matchResult,
        ruleInputFor(rule),
        legibilityFor(input.extraction.faces, matchResult.sourceFace),
        tolerances.confidence,
      ),
    );
  }

  return results;
}

function dispatch(opts: {
  field: FieldName;
  formValue: string;
  extracted: { value: string; face: FaceKind } | null;
  rule: FieldRule;
}): MatchResult {
  switch (opts.field) {
    case "alcohol_content":
      return matchAbv({ formValue: opts.formValue, extracted: opts.extracted });
    case "net_contents":
      return matchNetContents({ formValue: opts.formValue, extracted: opts.extracted });
    case "country_of_origin":
      return matchOrigin({ formValue: opts.formValue, extracted: opts.extracted });
    default: {
      // brand_name, class_type, producer_name, producer_address, fanciful_name
      const minSim = opts.rule.rule === "fuzzy" ? opts.rule.minSimilarity : 0.92;
      return matchFuzzy({
        field: opts.field,
        formValue: opts.formValue,
        extracted: opts.extracted,
        minSimilarity: minSim,
        fieldLabel: FIELD_LABELS[opts.field],
      });
    }
  }
}
