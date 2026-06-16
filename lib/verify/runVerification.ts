/**
 * Reusable per-application verification pipeline.
 *
 * Extracted from `app/api/verify/route.ts` so the synchronous API route
 * and the batch orchestrator (`lib/batch/orchestrator.ts`) compose the
 * same end-to-end flow: extract → degraded-check → unreadable-check →
 * match → triage → result. The wire-decoding and route logging stays in
 * the route handler; this function operates on already-validated,
 * already-decoded buffers.
 *
 * D14: one provider call per Application carrying all faces.
 * D4 / D5: model reads, code decides; never let model verdicts leak.
 */

import { toDegradedResult } from "@/lib/errors/toResult";
import {
  internalError,
  unreadableImage,
} from "@/lib/errors/types";
import { extract, type ExtractableApplication } from "@/lib/extraction/service";
import { matchApplication } from "@/lib/matching/match";
import type { SampleForm } from "@/fixtures/samples";
import type {
  BeverageType,
  FaceKind,
  VerificationResult,
} from "@/types";

import {
  buildSuccessResult,
  buildTimeoutResult,
  unreadableFaces,
} from "./result";

const FACE_LABELS: Readonly<Record<FaceKind, string>> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
};

export type RunVerificationInput = {
  applicationId: string;
  beverageType: BeverageType;
  form: SampleForm;
  faces: ReadonlyArray<{
    kind: FaceKind;
    bytes: Buffer;
    mime: "image/jpeg" | "image/png";
  }>;
};

/**
 * Run the per-application pipeline end to end and return a
 * `VerificationResult`. Mirrors the shape the `/api/verify` route returns
 * (200 in every branch — degraded, unreadable, match, mismatch). Caller
 * decides how to surface the result (HTTP body vs. batch job item).
 */
export async function runVerification(
  input: RunVerificationInput,
): Promise<VerificationResult> {
  // 1. Build the extraction request. Bytes never leave this function.
  const extractable: ExtractableApplication = {
    id: input.applicationId,
    beverageType: input.beverageType,
    faces: input.faces.map((f) => ({
      kind: f.kind,
      bytes: f.bytes,
      mime: f.mime,
    })),
  };

  // 2. Run extraction. An extraction-pipeline failure (decode error,
  //    provider exception that isn't transient) is treated as an
  //    INTERNAL structured error rather than a thrown error — the agent
  //    sees a defensive review-lane result, not a stack trace (P3-3).
  let extraction;
  try {
    extraction = await extract(extractable);
  } catch {
    return toDegradedResult(input.applicationId, internalError());
  }

  // 3a. Short-circuit on a degraded extraction (D10 — timeout or
  //     exhausted-retry transient). P3-3 prefers the structured-error
  //     `degradedError` field when present; the legacy
  //     `buildTimeoutResult` is the defensive fallback for older
  //     extraction outputs.
  if (extraction.degraded) {
    if (extraction.degradedError) {
      return toDegradedResult(input.applicationId, extraction.degradedError);
    }
    return buildTimeoutResult({
      applicationId: input.applicationId,
      degraded: extraction.degraded,
    });
  }

  // 3b. Short-circuit if any face is unreadable (FR-26b). The structured
  //     `UNREADABLE_IMAGE` error carries the FR-26b recommendation; the
  //     reason message names the affected face(s) so the agent knows
  //     which artwork to look at.
  const unreadable = unreadableFaces(extraction);
  if (unreadable.length > 0) {
    const reason = unreadable
      .map(
        (f) =>
          `${FACE_LABELS[f]} face is unreadable — please re-upload a clearer image.`,
      )
      .join(" ");
    return toDegradedResult(input.applicationId, unreadableImage(reason));
  }

  // 4. Match → triage.
  const fieldResults = matchApplication({
    beverageType: input.beverageType,
    form: input.form,
    extraction,
  });

  return buildSuccessResult({
    applicationId: input.applicationId,
    fields: fieldResults,
    extraction,
  });
}
