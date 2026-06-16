/**
 * Vision provider adapter — the single seam to the outside world (D8).
 *
 * The model returns text only — no verdicts, no overall confidence numbers
 * (D4, D5). The matching engine (P1-3) and the triage classifier (P1-5)
 * are what turn extractions into verdicts and lanes; the provider is
 * deliberately dumb.
 *
 * One call per Application carrying all faces (D14). Mock and every live
 * provider (Claude Sonnet 4.6 in P1-2, Azure OpenAI in P6-1, self-hosted
 * olmOCR in P6-1's alt path) implement the same `extract()` shape, so the
 * rest of the system is provider-agnostic.
 */

import type { BeverageType, FaceKind, FieldName, WarningFlags } from "@/types";

/**
 * One face's preprocessed bytes plus its role on the bottle.
 *
 * Bytes live only in the request lifecycle — never persisted (NFR-4).
 * Preprocessing (orientation + cap at provider max resolution per D7) is
 * handled upstream by `lib/image/preprocess.ts` (P0-5) before this type
 * is constructed.
 */
export type ProviderFaceInput = {
  kind: FaceKind;
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
};

/**
 * One Application's extraction request — all faces + the field schema.
 *
 * `applicationId` is the sample fixture key for the mock and an
 * opaque correlation id for real providers (used for tracing in P5-1).
 *
 * `fieldSchema` is the list of fields the model should look for on this
 * Application's labels, driven by the beverage type (FR-3). Sourced from
 * `config/fields-by-type.json` (P0-4); the provider does not author it.
 */
export type ExtractionRequest = {
  applicationId: string;
  beverageType: BeverageType;
  faces: ReadonlyArray<ProviderFaceInput>;
  fieldSchema: ReadonlyArray<FieldName>;
};

/**
 * What the model transcribed from one face (D4 — text only).
 *
 * `fields` is a partial map because the model often will not find every
 * field on every face. The multi-face merge (P1-6) reconciles across
 * faces — a field is satisfied if found on ANY face (D12).
 *
 * `warning` carries the structural flags on the government warning that
 * the model can report from this face alone (presence, all-caps, bold
 * confidence, legibility per D6). Bold is best-effort — `boldConfident`
 * uses the three-value flag (yes | no | uncertain), not a boolean, so
 * P1-5 can route "uncertain" to the review lane rather than forcing a
 * false binary on an unreliable styling read.
 */
export type FaceExtraction = {
  kind: FaceKind;
  fields: Partial<Record<FieldName, string>>;
  warning: WarningFlags;
};

/**
 * One Application's extraction response — per face, text only.
 *
 * No `verdict`, `match`, or `confidence` at this level. That is the
 * matching engine's job (P1-3). A future agent tempted to add one is
 * doing P1-3's work in the wrong place.
 *
 * `degraded` is set by the extraction service (P1-9) when the provider
 * call could not complete cleanly within the retry budget — `"timeout"`
 * for a terminal timeout, `"transient"` for an exhausted-retry transient
 * error. When set, `faces` is empty and the route handler builds the
 * "could not verify in time" review-lane result rather than running
 * matching against a degenerate input.
 */
export type ExtractionResponse = {
  faces: FaceExtraction[];
  degraded?: "timeout" | "transient";
};

/**
 * Targeted high-resolution re-read of just the warning region (P3-2, D7).
 *
 * After the first-pass `extract()` returns, the extraction service inspects
 * each face's `warning.legibility`. When the warning is on a face the
 * matcher pins to and the legibility came back `"low"` (the model's signal
 * — the decision to re-read is in code per D4 + D5), the service calls
 * `rereadWarning()` with the cropped warning region from that face's
 * preprocessed bytes. At most ONE re-read per application (D14): the
 * warning is a single field, and a re-read is a targeted slice — not a
 * multi-pass chain.
 *
 * The cropped bytes share the same MIME as the source face. Bytes live
 * only in the request lifecycle, never persisted (NFR-4).
 */
export type WarningRereadInput = {
  applicationId: string;
  /** The cropped warning region's bytes. */
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  /** Which face the crop came from, for the response. */
  sourceFace: FaceKind;
};

/**
 * What the second-pass re-read returns. Same shape as the warning slice
 * of a `FaceExtraction` (warning text + the three structural flags) —
 * no verdict, no overall confidence (D4, D5).
 *
 * The extraction service merges this back onto the source face IFF the
 * re-read came back with `legibility: "good"` and non-empty text. A
 * still-low re-read is treated as "no rescue available" and the
 * first-pass result is kept — the triage classifier then routes it to
 * the low-confidence lane per FR-16 + FR-26b.
 */
export type WarningRereadResponse = {
  /** The new transcription (may be empty if the re-read also fails). */
  warningText: string;
  /** New legibility signal from the second pass. */
  legibility: "good" | "low";
  /** Best-effort flags from the second pass. */
  allCaps: boolean;
  boldConfident: "yes" | "no" | "uncertain";
};

/**
 * The single seam every model integration sits behind (D8).
 *
 * Implementations: `MockVisionProvider` (this ticket); `ClaudeProvider`
 * (P1-2); `AzureOpenAIProvider` and `OlmOCRProvider` (P6-1). They all
 * implement this exact contract so the rest of the system never knows
 * which model is on.
 *
 * `rereadWarning` is OPTIONAL on purpose: only the mock implements a
 * real second pass for P3-2's tests. The live Anthropic adapter throws
 * `"Not implemented in Phase 3 prototype"` when the seam is exercised;
 * a real Claude prompt for the cropped region lands when the live
 * provider is exercised against a real cost budget (out of scope for
 * P3-2). The extraction service handles a missing method gracefully —
 * `attempted: false` and the first-pass result is kept.
 */
export type VisionProvider = {
  readonly name: string;
  extract(input: ExtractionRequest): Promise<ExtractionResponse>;
  rereadWarning?(input: WarningRereadInput): Promise<WarningRereadResponse>;
};
