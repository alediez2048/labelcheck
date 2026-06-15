/**
 * Zod schemas for the JSON config files in `config/`.
 *
 * Every schema is `.strict()` — unknown keys are rejected loudly rather
 * than silently ignored. The whole point of FR-25 is that a compliance
 * reviewer can edit these files; a typo'd key like `"caps": true` instead
 * of `"headingCapsRequired": true` must fail the startup check, not
 * silently weaken the warning rule.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// warning.json — canonical text + heading rules (D6)
// ---------------------------------------------------------------------------

export const WarningConfigSchema = z
  .object({
    version: z.string(),
    /**
     * The verbatim 27 CFR § 16.21 text. Currently a clearly-marked
     * placeholder (`__TODO_VERBATIM_TEXT_A18__`) until A18 is resolved.
     */
    canonicalText: z.string(),
    /** The heading the matcher looks for, e.g. "GOVERNMENT WARNING:". */
    headingText: z.string(),
    /** FR-11: heading must be ALL CAPS — strict pass/fail. */
    headingCapsRequired: z.boolean(),
    /** FR-11: heading should be bold — but enforcement is best-effort per D6. */
    headingBoldRequired: z.boolean(),
    /**
     * D6: how strictly to enforce bold. `"best_effort"` means the
     * triage classifier routes "uncertain" model reads to the review
     * lane rather than auto-failing on a styling cue.
     */
    headingBoldEnforcement: z.enum(["strict", "best_effort"]),
  })
  .strict();

export type WarningConfig = z.infer<typeof WarningConfigSchema>;

// ---------------------------------------------------------------------------
// tolerances.json — per-field matching rules (FR-8, FR-9, FR-10, A19)
// ---------------------------------------------------------------------------

/** Normalization steps the matcher applies before comparison. */
const NormalizeStep = z.enum(["case", "punctuation", "whitespace", "unit"]);

const FuzzyRule = z
  .object({
    rule: z.literal("fuzzy"),
    minSimilarity: z.number().min(0).max(1),
    normalize: z.array(NormalizeStep),
  })
  .strict();

const ExactRule = z
  .object({
    rule: z.literal("exact"),
    normalize: z.array(NormalizeStep),
    note: z.string().optional(),
  })
  .strict();

const StatedEqualsStatedRule = z
  .object({
    rule: z.literal("stated_equals_stated"),
    normalize: z.array(NormalizeStep),
    note: z.string().optional(),
  })
  .strict();

/**
 * One field's matching rule. Discriminated by `rule` so Zod gives clear
 * error messages on a typo (e.g. `"rule": "fuzy"` produces a useful
 * "Invalid discriminator value" rather than "did not match any union member").
 */
export const FieldRuleSchema = z.discriminatedUnion("rule", [
  FuzzyRule,
  ExactRule,
  StatedEqualsStatedRule,
]);

export type FieldRule = z.infer<typeof FieldRuleSchema>;

/**
 * Confidence derivation parameters (P1-4, D5).
 *
 * `threshold` is the split between "confident" and "uncertain" that P1-5
 * triage uses. `legibilityFactors` multiply the base confidence per the
 * model's per-region legibility flag from `FaceExtraction.warning`.
 * `notFoundConfidence` and `lowConfidenceVerdict` set the mid-range
 * scalars for the corresponding `Verdict` values.
 *
 * The model's OWN overall self-reported confidence is never used here
 * (D5). It is logged-only.
 */
const ConfidenceConfigSchema = z
  .object({
    threshold: z.number().min(0).max(1),
    legibilityFactors: z
      .object({
        good: z.number().min(0).max(1),
        low: z.number().min(0).max(1),
      })
      .strict(),
    notFoundConfidence: z.number().min(0).max(1),
    lowConfidenceVerdict: z.number().min(0).max(1),
    note: z.string().optional(),
  })
  .strict();

export type ConfidenceConfig = z.infer<typeof ConfidenceConfigSchema>;

/**
 * Per-field tolerance table. Keys are the camelCase form field names
 * (matching `FormFields` in `types/domain.ts`); the values are the
 * matching rules the engine (P1-3) applies. `confidence` carries the
 * derivation parameters used by P1-4 / consumed by P1-5 triage.
 */
export const TolerancesConfigSchema = z
  .object({
    brandName: FieldRuleSchema,
    classType: FieldRuleSchema,
    alcoholContent: FieldRuleSchema,
    netContents: FieldRuleSchema,
    producerName: FieldRuleSchema,
    producerAddress: FieldRuleSchema,
    countryOfOrigin: FieldRuleSchema,
    confidence: ConfidenceConfigSchema,
  })
  .strict();

export type TolerancesConfig = z.infer<typeof TolerancesConfigSchema>;

// ---------------------------------------------------------------------------
// fields-by-type.json — required fields per beverage type (FR-3, A10)
// ---------------------------------------------------------------------------

/**
 * Field keys that may appear in a per-beverage-type required list.
 * Form fields use camelCase to match `FormFields`; `government_warning`
 * is the snake_case `FieldName` for the warning, which is a verifiable
 * field on the label rather than a form-side value.
 */
const FieldKey = z.enum([
  "brandName",
  "fancifulName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "producerAddress",
  "countryOfOrigin",
  "government_warning",
]);

export const FieldsByTypeConfigSchema = z
  .object({
    wine: z.array(FieldKey),
    distilled_spirits: z.array(FieldKey),
    malt_beverage: z.array(FieldKey),
  })
  .strict();

export type FieldsByTypeConfig = z.infer<typeof FieldsByTypeConfigSchema>;
export type ConfigFieldKey = z.infer<typeof FieldKey>;
