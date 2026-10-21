/**
 * Canonical domain types for LabelCheck.
 *
 * Names and enums come straight from `docs/02-design/CONTEXT.md` (the glossary).
 * This file is types only — no runtime values, no logic. The same shapes are
 * consumed by the API route handler, the matching engine, the
 * triage classifier, and the review UI. One contract, no drift.
 *
 * Wire-format identifiers (FieldName, enum literals) use snake_case to match
 * `schema.md` column names. TypeScript field names use camelCase per project
 * style. The boundary is the wire layer.
 */

// ---------------------------------------------------------------------------
// String-literal enums (CONTEXT.md)
// ---------------------------------------------------------------------------

/**
 * Three-lane triage outcome for one Application (CONTEXT.md: Lane).
 *
 * Distinct from `Disposition` — Lane is the AI's automatic triage call;
 * Disposition is the human's decision. Adding "approve" or "approved" here
 * would collapse that distinction and is the anti-pattern called out in
 * systemsdesign.md "Decisions That Look Wrong But Are Deliberate".
 */
export type Lane = "match" | "mismatch" | "review";

/**
 * Per-field verification outcome (CONTEXT.md: Verdict).
 *
 * Emitted by the matching engine per field, then rolled into a
 * single Lane by the triage classifier.
 */
export type Verdict =
  | "match"
  | "mismatch"
  | "not_found"
  | "low_confidence";

/**
 * The human's decision on an Application (CONTEXT.md: Disposition).
 *
 * Whole-application only — never per-face, never per-field. Rejection is
 * not a manual disposition; it happens automatically after the 30-day
 * correction window lapses, written as a system-generated record.
 */
export type Disposition = "approve" | "return_for_correction";

/**
 * Beverage type drives which Form fields are mandatory (assumption).
 *
 * Identifiers match `schema.md` (snake_case) and the routing specialization
 * keys in `lib/router/`.
 */
export type BeverageType =
  | "wine"
  | "distilled_spirits"
  | "malt_beverage";

/**
 * Which face of the label artwork (CONTEXT.md: Label face).
 *
 * Multi-face merge rule: a field is satisfied if found on ANY face;
 * the government warning is checked ACROSS all faces.
 */
export type FaceKind = "front" | "back" | "neck";

/**
 * Two effective roles in the prototype (CONTEXT.md: Admin, Agent).
 *
 * `agent` reviews exception applications; `admin` (a division supervisor)
 * sees global views and bulk-confirms the match lane. Production identity
 * (PIV/CAC + SSO) maps onto these two values.
 */
export type Role = "agent" | "admin";

/**
 * Names of the verifiable fields on an Application (to).
 *
 * Stable wire-format identifiers (snake_case) used as lookup keys by the
 * matching engine and as audit-trail values on `field_result` rows in
 * production (schema.md).
 */
export type FieldName =
  | "brand_name"
  | "fanciful_name"
  | "class_type"
  | "alcohol_content"
  | "net_contents"
  | "producer_name"
  | "producer_address"
  | "country_of_origin"
  | "government_warning";

// ---------------------------------------------------------------------------
// Application (the unit of verification)
// ---------------------------------------------------------------------------

/**
 * The typed application fields as submitted on the form.
 *
 * Standing in for a COLAs Online record in the prototype (assumption).
 * Required vs optional — the matching engine consults
 * `config/fields-by-type.json` for the per-beverage-type rules.
 *
 * Country of origin is optional because it applies primarily to imports.
 */
export type FormFields = {
  brandName: string;
  fancifulName?: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producerName: string;
  producerAddress: string;
  countryOfOrigin?: string;
};

/**
 * One label face submitted with an Application.
 *
 * `imageRef` is a transient in-memory handle — a key into the request-scope
 * buffer pool. It must NEVER be a URL to durable storage or a `Buffer` /
 * `Uint8Array` itself; the image bytes live in the request lifecycle and
 * disappear when it ends (no persistence of applicant PII).
 */
export type LabelFace = {
  kind: FaceKind;
  imageRef: string;
};

/**
 * One Application — the atomic unit of verification (CONTEXT.md).
 *
 * `correctionCycle` and `parentApplicationId` model the resubmission
 * lifecycle (CONTEXT.md: Resubmission): a returned-for-correction
 * Application can be resubmitted as a NEW Application linked to its parent
 * via `parentApplicationId`. Verification re-runs end to end on all faces
 * — no per-face caching.
 *
 * In the prototype these last two fields are unused (no persistence /
 * lifecycle), but the type carries them so attaches cleanly.
 */
export type Application = {
  id: string;
  beverageType: BeverageType;
  form: FormFields;
  faces: LabelFace[];
  correctionCycle?: number;
  parentApplicationId?: string | null;
};

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

/**
 * Structural flags on the government warning.
 *
 * - `presence`: was a warning block detected at all?
 * - `allCaps`: is the heading rendered in ALL CAPS? (verified in code from
 *   transcribed text; strict pass/fail)
 * - `boldConfident`: is the heading confidently bold? (best-effort flag from
 *   the model; "uncertain" routes the case to the review lane rather
 *   than auto-passing or auto-failing on the styling read)
 * - `legibility`: model-reported legibility of the warning region; "low"
 *   triggers the targeted high-res re-read later.
 */
export type WarningFlags = {
  presence: boolean;
  allCaps: boolean;
  boldConfident: "yes" | "no" | "uncertain";
  legibility: "good" | "low";
};

/**
 * One per-field verification outcome.
 *
 * `extractedValue` is the model's transcribed text only — never a
 * verdict and never the model's self-reported confidence. `confidence`
 * here is the CODE-DERIVED signal (D5: match margin plus the model's
 * per-region legibility flag), never the model's self-reported number.
 *
 * `sourceFace` records which face the field was found on (D12: a field is
 * satisfied if found on any face); null when the field is not found.
 */
export type FieldResult = {
  field: FieldName;
  formValue: string;
  extractedValue: string | null;
  verdict: Verdict;
  confidence: number;
  reason: string;
  sourceFace: FaceKind | null;
};

/**
 * The structured verification result returned by the API and rendered by
 * the UI. The SAME shape on both sides — no separate "render
 * model" or "API DTO". This is the single source of truth.
 *
 * - `lane`: the triage classifier's call for this Application.
 * - `overallConfidence`: code-derived overall confidence — not the
 *   model's number.
 * - `fields`: per-field breakdown so the agent's attention goes to the
 *   specific differing field.
 * - `warning`: structural flags on the government warning specifically.
 * - `flags`: short human-readable strings the UI can surface (e.g.
 *   "ABV mismatch: form 40% vs label 45%").
 * - `extractionFailed`: deterministic system signal — extraction returned
 *   no usable text on at least one face. Distinct from a
 *   low-confidence reading.
 * - `recommendation`: when extraction failed, the system surfaces a
 *   default operator action. `return_unreadable_image` for a
 *   genuinely unreadable face; `retry_service_slow` for a provider
 *   timeout / rate-limit / 5xx where the artwork may be fine and the
 *   operator should re-process before bouncing the application.
 */
export type VerificationResult = {
  applicationId: string;
  lane: Lane;
  overallConfidence: number;
  fields: FieldResult[];
  warning: WarningFlags;
  flags: string[];
  extractionFailed: boolean;
  recommendation?: "return_unreadable_image" | "retry_service_slow";
};

// ---------------------------------------------------------------------------
// Disposition (whole-application only)
// ---------------------------------------------------------------------------

/**
 * Structured reason summary attached to a Return-for-correction
 * disposition.
 *
 * What the applicant sees and acts on. Derived from the latest
 * verification's per-field results so resubmissions know exactly what to
 * fix. Without this, applicants resubmit blind and the 30-day correction
 * cycle churns.
 */
export type ReturnReasonSummary = {
  failedFields: Array<{
    field: FieldName;
    formValue: string;
    extractedValue: string | null;
    reason: string;
  }>;
  agentNote?: string;
};

/**
 * One disposition record — the human's decision on a whole Application
 * (CONTEXT.md: Disposition).
 *
 * Whole-application ONLY: there is no `face` or `field` discriminator on
 * this type, so per-face / per-field dispositions are unrepresentable.
 * That's structural enforcement of the atomic-disposition constraint.
 *
 * `returnReason` is required when `disposition === "return_for_correction"`
 * by FR-26a; the type carries it as optional and enforcement lives in the
 * disposition write path. A discriminated union would be stricter
 * but adds noise without preventing a real bug class — the write path
 * validates with Zod.
 *
 * `decidedAt` is an ISO timestamp; `decidedBy` is the agent / admin id
 * (Role mapped onto an identity).
 */
export type DispositionRecord = {
  applicationId: string;
  disposition: Disposition;
  returnReason?: ReturnReasonSummary;
  decidedAt: string;
  decidedBy: string;
};
