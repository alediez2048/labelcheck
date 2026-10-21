/**
 * Vision provider adapter — the single seam to the outside world.
 *
 * The model returns text only — no verdicts, no overall confidence numbers
 *. The matching engine and the triage classifier
 * are what turn extractions into verdicts and lanes; the provider is
 * deliberately dumb.
 *
 * One call per Application carrying all faces. Mock and every live
 * provider (Claude Sonnet 4.6 later, Azure OpenAI later, self-hosted
 * olmOCR in the alt path) implement the same `extract` shape, so the
 * rest of the system is provider-agnostic.
 */

import type { StructuredError } from "@/lib/errors/types";
import type { BeverageType, FaceKind, FieldName, WarningFlags } from "@/types";

/**
 * One face's preprocessed bytes plus its role on the bottle.
 *
 * Bytes live only in the request lifecycle — never persisted.
 * Preprocessing (orientation + cap at provider max resolution) is
 * handled upstream by `lib/image/preprocess.ts` before this type
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
 * opaque correlation id for real providers (used for tracing).
 *
 * `fieldSchema` is the list of fields the model should look for on this
 * Application's labels, driven by the beverage type. Sourced from
 * `config/fields-by-type.json`; the provider does not author it.
 */
export type ExtractionRequest = {
  applicationId: string;
  beverageType: BeverageType;
  faces: ReadonlyArray<ProviderFaceInput>;
  fieldSchema: ReadonlyArray<FieldName>;
};

/**
 * What the model transcribed from one face (text only).
 *
 * `fields` is a partial map because the model often will not find every
 * field on every face. The multi-face merge reconciles across
 * faces — a field is satisfied if found on ANY face.
 *
 * `warning` carries the structural flags on the government warning that
 * the model can report from this face alone (presence, all-caps, bold
 * confidence, legibility). Bold is best-effort — `boldConfident`
 * uses the three-value flag (yes | no | uncertain), not a boolean, so
 * Can route "uncertain" to the review lane rather than forcing a
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
 * matching engine's job. A future agent tempted to add one is
 * doing the work in the wrong place.
 *
 * `degraded` is set by the extraction service when the provider
 * call could not complete cleanly within the retry budget — `"timeout"`
 * for a terminal timeout, `"transient"` for an exhausted-retry transient
 * error. When set, `faces` is empty and the route handler builds the
 * "could not verify in time" review-lane result rather than running
 * matching against a degenerate input.
 */
export type ExtractionResponse = {
  faces: FaceExtraction[];
  degraded?: "timeout" | "transient";
  /**
   * the richer signal alongside the legacy `degraded` flag. When
   * the extraction service degrades because of a provider failure, this
   * field carries the structured error the route handler converts into
   * a degraded `VerificationResult`. Older callers that only read
   * `degraded` keep working; new callers prefer `degradedError`.
   */
  degradedError?: StructuredError;
  /**
   * did the warning re-read path fire on this request?
   *
   * Set inside `lib/extraction/service.ts` next to the `extraction.reread`
   * log emission. `runVerification` reads this for the `verify.timing`
   * structured log so the operator can see at a glance how often the
   * re-read rescues a low-legibility warning. Pure observability — does
   * NOT affect routing or merge logic. Optional so producers that don't
   * exercise the re-read path (the live Anthropic adapter today) keep
   * working without a flag flip.
   */
  rereadAttempted?: boolean;
};

/**
 * Targeted high-resolution re-read of just the warning region.
 *
 * After the first-pass `extract` returns, the extraction service inspects
 * each face's `warning.legibility`. When the warning is on a face the
 * matcher pins to and the legibility came back `"low"` (the model's signal
 * — the decision to re-read is in code), the service calls
 * `rereadWarning` with the cropped warning region from that face's
 * preprocessed bytes. At most ONE re-read per application: the
 * warning is a single field, and a re-read is a targeted slice — not a
 * multi-pass chain.
 *
 * The cropped bytes share the same MIME as the source face. Bytes live
 * only in the request lifecycle, never persisted.
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
 * no verdict, no overall confidence.
 *
 * The extraction service merges this back onto the source face IFF the
 * re-read came back with `legibility: "good"` and non-empty text. A
 * still-low re-read is treated as "no rescue available" and the
 * first-pass result is kept — the triage classifier then routes it to
 * the low-confidence lane.
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
 * The single seam every model integration sits behind.
 *
 * Implementations: `MockVisionProvider` (this ticket); `ClaudeProvider`
 *; `AzureOpenAIProvider` and `OlmOCRProvider`. They all
 * implement this exact contract so the rest of the system never knows
 * which model is on.
 *
 * `rereadWarning` is OPTIONAL on purpose: only the mock implements a
 * real second pass for the tests. The live Anthropic adapter throws
 * `"Not implemented in Phase 3 prototype"` when the seam is exercised;
 * a real Claude prompt for the cropped region lands when the live
 * provider is exercised against a real cost budget (out of scope for
 *). The extraction service handles a missing method gracefully —
 * `attempted: false` and the first-pass result is kept.
 */
export type VisionProvider = {
  readonly name: string;
  extract(input: ExtractionRequest): Promise<ExtractionResponse>;
  rereadWarning?(input: WarningRereadInput): Promise<WarningRereadResponse>;
};
