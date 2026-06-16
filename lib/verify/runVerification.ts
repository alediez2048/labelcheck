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
 *
 * P3-4: per-stage timing instrumentation. Every successful trip through
 * the pipeline emits one `verify.timing` structured log line carrying
 * the totals + per-stage breakdown. The route handler's existing
 * `verify.request` end-to-end log line (P1-11) stays — that's the wire
 * boundary; this one is the in-pipeline view that lets us attribute
 * latency to extract / match / triage when the p95 walks. PII-redacted
 * per NFR-4: no extracted values, no form values, no bytes.
 */

import type { WarningConfig } from "@/lib/config";
import { timed } from "@/lib/observability/timing";
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

/**
 * Optional observability hook for P5-1. The route handler wraps the
 * call in `withVerificationSpan` and passes the resulting context
 * here; the pipeline forwards face-count, per-field events, and the
 * final lane / overall_confidence to it as the stages complete.
 *
 * Kept optional so the batch orchestrator (which spans differently)
 * and the latency bench (which has no span context at all) can call
 * `runVerification` without setting up an OTel parent.
 */
export type RunVerificationObservability = {
  setAttributes(
    attrs: Record<string, string | number | boolean | undefined>,
  ): void;
  addFieldEvent(
    fieldName: string,
    verdict: string,
    confidence: number,
    sourceFace: string | null,
  ): void;
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
  /** Optional P5-1 hook — wires the verification span into the pipeline. */
  observability?: RunVerificationObservability;
  /**
   * Optional warning-config override. P5-2: the eval harness threads a
   * canonical-text config through so the A18 placeholder in
   * `config/warning.json` doesn't fail every green case. The matching
   * engine's `MatchApplicationInput.warningConfig` already accepts an
   * override; this just plumbs it through the pipeline entrypoint. The
   * route handler doesn't pass it, so request-path behaviour is unchanged.
   */
  warningConfig?: WarningConfig;
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
  const pipelineStart = performance.now();
  const obs = input.observability;

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
  obs?.setAttributes({ "verification.face_count": input.faces.length });

  // 2. Run extraction. An extraction-pipeline failure (decode error,
  //    provider exception that isn't transient) is treated as an
  //    INTERNAL structured error rather than a thrown error — the agent
  //    sees a defensive review-lane result, not a stack trace (P3-3).
  //
  //    P3-4: `extractMs` here wraps preprocessing + the provider round
  //    trip + the (optional) warning re-read. Finer-grained split (sharp
  //    preprocess vs. provider wall-clock) lands in P5-1's OpenTelemetry
  //    spans; the `extraction.call` log emitted INSIDE `extract()` already
  //    carries the inner `modelMs` for callers that need it today.
  let extraction;
  let extractMs = 0;
  try {
    const t = await timed(() => extract(extractable));
    extraction = t.result;
    extractMs = t.durationMs;
  } catch (err) {
    // TEMP debug: bubble the underlying error message into the
    // degraded result so production failures don't look like silent
    // "stuck in review". Trim to one line; no stack, no PII.
    const message = err instanceof Error ? err.message : String(err);
    const internal = internalError();
    internal.message = `Extraction error: ${message.slice(0, 200)}`;
    return toDegradedResult(input.applicationId, internal);
  }

  // 3a. Short-circuit on a degraded extraction (D10 — timeout or
  //     exhausted-retry transient). P3-3 prefers the structured-error
  //     `degradedError` field when present; the legacy
  //     `buildTimeoutResult` is the defensive fallback for older
  //     extraction outputs.
  if (extraction.degraded) {
    const result = extraction.degradedError
      ? toDegradedResult(input.applicationId, extraction.degradedError)
      : buildTimeoutResult({
          applicationId: input.applicationId,
          degraded: extraction.degraded,
        });
    obs?.setAttributes({
      "verification.lane": result.lane,
      "verification.overall_confidence": result.overallConfidence,
    });
    emitTiming({
      applicationId: input.applicationId,
      totalMs: Math.round(performance.now() - pipelineStart),
      extractMs,
      matchMs: 0,
      triageMs: 0,
      faceCount: input.faces.length,
      lane: result.lane,
      degraded: true,
      rereadTriggered: extraction.rereadAttempted ?? false,
    });
    return result;
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
    const result = toDegradedResult(input.applicationId, unreadableImage(reason));
    obs?.setAttributes({
      "verification.lane": result.lane,
      "verification.overall_confidence": result.overallConfidence,
    });
    emitTiming({
      applicationId: input.applicationId,
      totalMs: Math.round(performance.now() - pipelineStart),
      extractMs,
      matchMs: 0,
      triageMs: 0,
      faceCount: input.faces.length,
      lane: result.lane,
      degraded: false,
      rereadTriggered: extraction.rereadAttempted ?? false,
    });
    return result;
  }

  // 4. Match → triage. Each stage is wrapped in `timed(...)` so the
  //    per-stage contribution to the request total is visible per
  //    request. `buildSuccessResult` internally calls `classify(...)` —
  //    we time it as one composite "triage" stage because the synchronous
  //    classify is cheap and splitting it would invite double-counting.
  const { result: fieldResults, durationMs: matchMs } = await timed(
    async () =>
      matchApplication({
        beverageType: input.beverageType,
        form: input.form,
        extraction,
        ...(input.warningConfig ? { warningConfig: input.warningConfig } : {}),
      }),
  );

  // P5-1: emit per-field events on the active verification span. The
  // matching engine itself stays pure (it doesn't import the span
  // helper); the observability hook is a thin pass-through the route
  // handler wires up. The trade-off vs. emitting events inside
  // `matchApplication` is documented in `lib/observability/spans.ts`.
  if (obs) {
    for (const f of fieldResults) {
      obs.addFieldEvent(f.field, f.verdict, f.confidence, f.sourceFace);
    }
  }

  const { result: verificationResult, durationMs: triageMs } = await timed(
    async () =>
      buildSuccessResult({
        applicationId: input.applicationId,
        fields: fieldResults,
        extraction,
      }),
  );

  obs?.setAttributes({
    "verification.lane": verificationResult.lane,
    "verification.overall_confidence": verificationResult.overallConfidence,
  });

  emitTiming({
    applicationId: input.applicationId,
    totalMs: Math.round(performance.now() - pipelineStart),
    extractMs,
    matchMs,
    triageMs,
    faceCount: input.faces.length,
    lane: verificationResult.lane,
    degraded: extraction.degraded !== undefined,
    rereadTriggered: extraction.rereadAttempted ?? false,
  });

  return verificationResult;
}

/**
 * Structured per-request timing log line (P3-4).
 *
 * One line per request, on every successful trip through the pipeline.
 * PII-redacted per NFR-4: no extracted values, no form values, no bytes.
 * The `applicationId` is an internal id (not an applicant identifier);
 * the lane is the AI's verdict, not a personal field. The `degraded`
 * boolean only reports whether the provider path degraded — the limit
 * of what we can know from this seam today; a richer
 * "retry actually fired" signal would need extra plumbing in
 * `withTimeout.ts` and lands later.
 */
function emitTiming(line: {
  applicationId: string;
  totalMs: number;
  extractMs: number;
  matchMs: number;
  triageMs: number;
  faceCount: number;
  lane: VerificationResult["lane"];
  degraded: boolean;
  rereadTriggered: boolean;
}): void {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "verify.timing",
      applicationId: line.applicationId,
      totalMs: line.totalMs,
      extractMs: line.extractMs,
      matchMs: line.matchMs,
      triageMs: line.triageMs,
      faceCount: line.faceCount,
      lane: line.lane,
      degraded: line.degraded,
      rereadTriggered: line.rereadTriggered,
    }),
  );
}
