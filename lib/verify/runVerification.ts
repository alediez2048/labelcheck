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
  buildUnreadableResult,
  unreadableFaces,
} from "./result";

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
  //    unreadable input rather than a thrown error (FR-16).
  let extraction;
  try {
    extraction = await extract(extractable);
  } catch {
    const allFaces = extractable.faces.map((f) => f.kind);
    return buildUnreadableResult({
      applicationId: input.applicationId,
      unreadable: allFaces,
    });
  }

  // 3a. Short-circuit on a degraded extraction (D10 — timeout or
  //     exhausted-retry transient).
  if (extraction.degraded) {
    return buildTimeoutResult({
      applicationId: input.applicationId,
      degraded: extraction.degraded,
    });
  }

  // 3b. Short-circuit if any face is unreadable (FR-26b).
  const unreadable = unreadableFaces(extraction);
  if (unreadable.length > 0) {
    return buildUnreadableResult({
      applicationId: input.applicationId,
      unreadable,
    });
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
