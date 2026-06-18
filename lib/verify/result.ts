/**
 * Shared result-builders for the per-application verification pipeline.
 *
 * Extracted out of `app/api/verify/route.ts` so both the synchronous
 * `/api/verify` route handler AND the batch orchestrator (`lib/batch/`)
 * compose results through the SAME helpers. Duplicating these would
 * eventually drift — the wire shape of a "could not verify in time" or
 * "unreadable" result is part of the public contract (FR-14, FR-16,
 * FR-26b), and one source of truth keeps the batch path honest.
 *
 * No I/O here, no provider calls, no logging. Pure shape construction
 * from already-classified inputs.
 */

import { classify } from "@/lib/triage/classify";
import type { ExtractionResponse, FaceExtraction } from "@/lib/provider";
import type {
  FaceKind,
  FieldResult,
  VerificationResult,
  WarningFlags,
} from "@/types";

const FACE_LABELS: Readonly<Record<FaceKind, string>> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
};

/**
 * The sentinel WarningFlags used on the unreadable / timeout result paths.
 * Lane=review and overallConfidence=0 on those paths, so the warning
 * struct just needs a stable empty shape.
 */
export const EMPTY_WARNING: WarningFlags = {
  presence: false,
  allCaps: false,
  boldConfident: "uncertain",
  legibility: "low",
};

// ---------------------------------------------------------------------------
// Unreadable-image detection
// ---------------------------------------------------------------------------

/**
 * A face is "unreadable" when the extraction layer produced nothing the
 * matching engine could use against it. That's the AC-6 / FR-26b case:
 * the model couldn't transcribe text, declined, or reported low
 * legibility WITH no usable transcription. We short-circuit BEFORE
 * matching because there's nothing to compare — running matching would
 * generate a wall of not_found verdicts that drown the real signal.
 */
export function isFaceUnreadable(face: FaceExtraction): boolean {
  const hasFieldText = Object.values(face.fields).some(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (hasFieldText) return false;
  if (face.warning.presence) return false;
  return true;
}

export function unreadableFaces(extraction: ExtractionResponse): FaceKind[] {
  return extraction.faces.filter(isFaceUnreadable).map((f) => f.kind);
}

// ---------------------------------------------------------------------------
// Building the unreadable VerificationResult
// ---------------------------------------------------------------------------

function unreadableFlagFor(face: FaceKind): string {
  return `${FACE_LABELS[face]} face is unreadable — please re-upload a clearer image.`;
}

export function buildUnreadableResult(opts: {
  applicationId: string;
  unreadable: ReadonlyArray<FaceKind>;
}): VerificationResult {
  return {
    applicationId: opts.applicationId,
    lane: "review",
    overallConfidence: 0,
    fields: [],
    warning: EMPTY_WARNING,
    flags: opts.unreadable.map(unreadableFlagFor),
    extractionFailed: true,
    recommendation: "return_unreadable_image",
  };
}

/**
 * Build the structured "could not verify in time" result (D10, FR-16).
 *
 * Surfaced when the extraction service exhausted its timeout + retry
 * budget. Lane=review (input-quality issue, not a regulatory failure),
 * overall confidence pinned to zero so the triage classifier's "minimum
 * field confidence" intuition still reads, with a single flag the agent
 * can act on.
 */
export function buildTimeoutResult(opts: {
  applicationId: string;
  degraded: "timeout" | "transient";
}): VerificationResult {
  const message =
    opts.degraded === "timeout"
      ? "Could not verify in time — the label-reading service was slow to respond. Please try again, or request a better image from the applicant."
      : "Could not verify in time — the label-reading service is temporarily unavailable. Please try again in a moment.";
  return {
    applicationId: opts.applicationId,
    lane: "review",
    overallConfidence: 0,
    fields: [],
    warning: EMPTY_WARNING,
    flags: [message],
    extractionFailed: true,
    recommendation: "retry_service_slow",
  };
}

// ---------------------------------------------------------------------------
// Building the standard VerificationResult
// ---------------------------------------------------------------------------

/**
 * Compose the public WarningFlags for the response.
 *
 * The per-face warning flags differ across faces (the front usually has
 * presence:false, the back carries the warning). For the public result
 * we surface the flags from the face the warning matcher pinned the
 * verdict to — that's the face the agent's UI is going to point at.
 */
export function pickWarningFlags(
  fields: ReadonlyArray<FieldResult>,
  extraction: ExtractionResponse,
): WarningFlags {
  const warningField = fields.find((f) => f.field === "government_warning");
  const sourceFace = warningField?.sourceFace ?? null;
  if (sourceFace !== null) {
    const face = extraction.faces.find((f) => f.kind === sourceFace);
    if (face) return face.warning;
  }
  const first = extraction.faces[0];
  return first ? first.warning : EMPTY_WARNING;
}

export function buildSuccessResult(opts: {
  applicationId: string;
  fields: FieldResult[];
  extraction: ExtractionResponse;
}): VerificationResult {
  const triage = classify({ fieldResults: opts.fields });
  return {
    applicationId: opts.applicationId,
    lane: triage.lane,
    overallConfidence: triage.overallConfidence,
    fields: opts.fields,
    warning: pickWarningFlags(opts.fields, opts.extraction),
    flags: triage.reasons,
    extractionFailed: false,
  };
}
