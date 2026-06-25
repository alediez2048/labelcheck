/**
 * Extraction service — the seam between a validated Application and the
 * vision provider (D14). One call per Application carrying all faces;
 * the model returns transcribed text and warning structural flags only
 * (D4). Matching, confidence, and triage live in code (D5).
 *
 * P1-7 (Result API) calls `extract()` from the verify route handler
 * after preprocessing each face through `lib/image/preprocess`. The
 * matching engine (P1-3) consumes the result.
 */

import { preprocessImage, type ImageMime } from "@/lib/image";
import { getProvider, getProviderChain } from "@/lib/provider";
import type {
  ExtractionRequest,
  ExtractionResponse,
  FaceExtraction,
  ProviderFaceInput,
  VisionProvider,
} from "@/lib/provider";
import {
  isTransientError,
  TimeoutError,
  toStructuredError,
  withRetry,
  withTimeout,
} from "@/lib/provider/withTimeout";
import { withFailover } from "@/lib/provider/withFailover";
import { SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "@/lib/observability/tracing";
import { rereadWarning } from "./rereadWarning";
import { getRequiredFields } from "@/lib/config";
import type { BeverageType, FaceKind, FieldName } from "@/types";

/**
 * D10 numbers, in one place. Tuning knobs live here so a future P5-2
 * calibration sweep (or a provider swap in P6-1) doesn't have to chase
 * literals scattered across the codebase. The per-attempt timeout is a
 * degradation knob, not a hard kill — p95-under-5s is the goal the route
 * is measured against (NFR-1), not the per-call cutoff.
 *
 * 20s was 8s. PDFs with multi-image label pages (e.g. BARENJAGER —
 * page 2 carries three embedded JPEGs totalling ~380k px²) routinely
 * exceeded 8s on Vercel cold-starts and surfaced as PROVIDER_TIMEOUT.
 * The /api/verify route already allows >20s wall time; the previous
 * cap was the bottleneck.
 */
const PROVIDER_TIMEOUT_MS = 20000;
const PROVIDER_RETRY_ATTEMPTS = 2;
const PROVIDER_RETRY_BACKOFF_MS = 250;

/**
 * Server-side view of an Application — the same shape as `Application`
 * from `types/domain.ts` but with face IMAGE BYTES instead of the
 * client-side `imageRef` handle. The verify route handler (P1-7)
 * constructs this from the multipart submission before calling
 * `extract()`.
 *
 * Lives in the extraction module so callers don't import a server-only
 * shape from the public domain types module — keeping the "Application
 * is in-memory only" boundary visible.
 */
export type ExtractableApplication = {
  id: string;
  beverageType: BeverageType;
  faces: ReadonlyArray<{
    kind: FaceKind;
    bytes: Buffer;
    mime: ImageMime;
  }>;
};

/**
 * Translate the config's camelCase form-field keys (and the snake_case
 * `government_warning` outlier) into the snake_case `FieldName`
 * vocabulary the matching engine and provider both use. The boundary
 * between the form-side identifier vocabulary and the wire-side
 * identifier vocabulary is documented in `types/domain.ts`.
 */
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
 * Derive the per-beverage-type field schema for the extraction prompt.
 *
 * Reads `getRequiredFields(beverageType)` from `lib/config` and maps
 * each key to its snake_case `FieldName` equivalent. Always appends
 * `government_warning` because the warning is checked across every
 * Application regardless of beverage type (D6, FR-11) — even though
 * the config does include it explicitly, the `add()` is idempotent.
 */
function fieldSchemaFor(beverageType: BeverageType): ReadonlyArray<FieldName> {
  const required = getRequiredFields(beverageType);
  const schema = new Set<FieldName>();
  for (const key of required) {
    const mapped = CONFIG_KEY_TO_FIELD_NAME[key];
    if (mapped) schema.add(mapped);
  }
  schema.add("government_warning");
  return Array.from(schema);
}

/**
 * Run preprocessing + extraction for one Application.
 *
 * The preprocessing loop is concurrent across faces (Promise.all) — image
 * preprocessing is independent per face and sharp releases the GIL
 * effectively. The provider call itself is exactly ONE round trip
 * carrying all faces (D14).
 *
 * After the first-pass response returns, the service inspects each face's
 * `warning.legibility`. When a face has `warning.presence === true` AND
 * `warning.legibility === "low"`, the service kicks off at most ONE
 * targeted re-read of the warning region (P3-2 / D7). The re-read uses
 * the SAME preprocessed bytes the first pass saw — we hold the buffer
 * map next to the response rather than bleeding bytes through the
 * `ExtractionResponse` shape (the response is what the route handler
 * logs / hashes; carrying buffers through it risks accidental
 * logging per NFR-4). One re-read per application, no retry, shorter
 * timeout — see `rereadWarning.ts`.
 */
export async function extract(
  application: ExtractableApplication,
): Promise<ExtractionResponse> {
  // 1. Preprocess every face concurrently. Each face's bytes pass through
  //    EXIF normalisation + long-edge cap (D7).
  const preprocessedFaces: ProviderFaceInput[] = await Promise.all(
    application.faces.map(async (face) => {
      const result = await preprocessImage(face.bytes, face.mime);
      return {
        kind: face.kind,
        bytes: result.bytes,
        mime: result.mime,
      };
    }),
  );

  // Side-table of preprocessed bytes keyed by FaceKind so the re-read
  // step can crop from the exact bytes the model saw on the first pass.
  // Stays scoped to this function so the bytes never escape the request
  // lifecycle (NFR-4).
  const preprocessedByKind = new Map<FaceKind, ProviderFaceInput>();
  for (const f of preprocessedFaces) {
    preprocessedByKind.set(f.kind, f);
  }

  // 2. Build one request carrying all faces.
  const fieldSchema = fieldSchemaFor(application.beverageType);
  const request: ExtractionRequest = {
    applicationId: application.id,
    beverageType: application.beverageType,
    faces: preprocessedFaces,
    fieldSchema,
  };

  // 3. One provider round trip (D14), wrapped in the timeout + retry
  //    budget from D10. A terminal timeout returns a degraded
  //    ExtractionResponse rather than throwing — the route handler in
  //    P1-7 surfaces it as the "could not verify in time" review-lane
  //    result. Non-transient errors (validation, programming bugs)
  //    propagate so the caller can surface a real error.
  //
  //    Model-call duration is logged on every request (NFR-1 / P1-11)
  //    so observability has a per-request signal feeding the p95
  //    headline (observability.md: What We Instrument). PII (the
  //    applicationId IS the application's internal id, not an
  //    applicant identifier) stays out of the log values per NFR-4.
  //
  //    P5-1: wrap the provider round-trip in an `extraction.call`
  //    child span so model-call latency is captured separately from
  //    the end-to-end pipeline cost (the observability.md "model-call
  //    latency captured separately" requirement). The active-span
  //    context comes from the parent `verification` span set in the
  //    route handler — OTel's context propagation makes this child
  //    inherit it without manual threading.
  // Failover chain: try each provider in PROVIDER (comma-separated)
  // in order. Each slot gets the same per-provider retry+timeout
  // budget; advances on any error after the budget is exhausted.
  const chain = getProviderChain();
  const tracer = getTracer();
  const modelStart = performance.now();
  let outcome: "ok" | "timeout" | "transient" | "error" = "ok";
  let firstPass: ExtractionResponse | null = null;
  let finalProvider: VisionProvider | null = null;
  let finalProviderName = chain[0]?.id ?? "unknown";
  const childSpan = tracer.startSpan("extraction.call", {
    attributes: {
      "extraction.provider": finalProviderName,
      "extraction.face_count": application.faces.length,
    },
  });
  try {
    const failoverResult = await withFailover(chain, request, {
      attempts: PROVIDER_RETRY_ATTEMPTS,
      backoffMs: PROVIDER_RETRY_BACKOFF_MS,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });
    firstPass = failoverResult.response;
    finalProvider = failoverResult.finalProvider;
    finalProviderName = failoverResult.finalProvider.name;
    childSpan.setAttribute("extraction.provider", finalProviderName);
  } catch (err) {
    if (err instanceof TimeoutError) {
      outcome = "timeout";
      // P3-3: alongside the legacy `degraded` enum, attach the structured
      // error so the route handler can route through `toDegradedResult`
      // without re-classifying the cause.
      firstPass = {
        faces: [],
        degraded: "timeout",
        degradedError: toStructuredError(err),
      };
    } else if (isTransientError(err)) {
      // Exhausted-retry transient error (e.g. provider 503 on both
      // attempts). The right behaviour is the same as a timeout — the
      // agent sees an actionable review-lane result, not a stack trace.
      outcome = "transient";
      firstPass = {
        faces: [],
        degraded: "transient",
        degradedError: toStructuredError(err),
      };
    } else {
      outcome = "error";
      const exc = err instanceof Error ? err : new Error(String(err));
      childSpan.recordException(exc);
      childSpan.setStatus({ code: SpanStatusCode.ERROR, message: exc.message });
      throw err;
    }
  } finally {
    const modelMs = Math.round(performance.now() - modelStart);
    childSpan.setAttribute("extraction.outcome", outcome);
    childSpan.setAttribute("extraction.duration_ms", modelMs);
    childSpan.end();
    // Structured log line — id, face count, duration, outcome only.
    // No bytes, no transcribed text, no form values (observability.md
    // Privacy + NFR-4).
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        event: "extraction.call",
        applicationId: application.id,
        provider: finalProviderName,
        faceCount: application.faces.length,
        modelMs,
        outcome,
      }),
    );
  }

  // 4. Post-first-pass targeted re-read (P3-2 / D7). Degraded responses
  //    skip this entirely — there are no faces to inspect. Otherwise
  //    pick the first face whose warning is present AND reported low
  //    legibility; that's the slice worth a second look. The decision
  //    lives in code (D4 + D5); the legibility flag is the model's
  //    signal but the rule is ours.
  if (firstPass && !firstPass.degraded && firstPass.faces.length > 0 && finalProvider) {
    return maybeRereadWarning({
      provider: finalProvider,
      applicationId: application.id,
      firstPass,
      preprocessedByKind,
    });
  }

  return (
    firstPass ?? {
      faces: [],
      degraded: "transient",
      degradedError: toStructuredError(new Error("Unknown extraction failure")),
    }
  );
}

/**
 * Inspect the first-pass response for a low-legibility warning face and,
 * if found, kick off the bounded targeted re-read (P3-2). One re-read
 * per application — picks the first qualifying face. The warning is one
 * field (D12), so one rescue attempt is enough.
 */
async function maybeRereadWarning(opts: {
  provider: VisionProvider;
  applicationId: string;
  firstPass: ExtractionResponse;
  preprocessedByKind: Map<FaceKind, ProviderFaceInput>;
}): Promise<ExtractionResponse> {
  const { provider, applicationId, firstPass, preprocessedByKind } = opts;

  // Find the first face that (a) reports a warning present and (b) came
  // back low-legibility. Iterating in face order is deterministic and
  // gives us a clear "which slice did we try?" log entry.
  const target = firstPass.faces.find(
    (f) => f.warning.presence && f.warning.legibility === "low",
  );
  if (!target) {
    return firstPass;
  }

  const sourceBytes = preprocessedByKind.get(target.kind);
  if (!sourceBytes) {
    // The face appeared in the response but not in our preprocessed
    // map — shouldn't happen, but if it does we have nothing to crop.
    // Keep the first-pass result; the triage classifier handles the
    // low-legibility warning per FR-16.
    return firstPass;
  }

  const rereadStart = performance.now();
  const reread = await rereadWarning({
    provider,
    applicationId,
    faceBytes: sourceBytes.bytes,
    faceMime: sourceBytes.mime,
    sourceFace: target.kind,
    // Region hint is not surfaced through the current response shape
    // (D4 keeps the wire payload minimal). When a future ticket adds a
    // per-warning bounding box to the FaceExtraction, plumb it through
    // here. Today the crop falls back to the back-face bottom 40%.
    regionHint: undefined,
  });
  const rereadMs = Math.round(performance.now() - rereadStart);

  // Structured log — PII-redacted per NFR-4. No transcribed text in
  // the log values; the legibility-before / legibility-after pair is
  // what observability needs to measure how often the re-read rescues.
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "extraction.reread",
      applicationId,
      sourceFace: target.kind,
      attempted: reread.attempted,
      legibilityBefore: target.warning.legibility,
      legibilityAfter: reread.legibility,
      durationMs: rereadMs,
    }),
  );

  // Merge rule: replace the first-pass warning on the source face IFF
  // the re-read succeeded AND came back with good legibility AND non-
  // empty text. Anything else keeps the first-pass result — the triage
  // classifier already routes a low-legibility warning to FR-16's
  // "needs a better image" lane.
  const shouldMerge =
    reread.attempted &&
    reread.legibility === "good" &&
    reread.warningText.length > 0;
  if (!shouldMerge) {
    // P3-4: surface the fact that a re-read was attempted so the
    // `verify.timing` structured log can report `rereadTriggered: true`
    // even on the no-merge branch (a "tried but couldn't rescue" is
    // observability-worthy too).
    return { ...firstPass, rereadAttempted: reread.attempted };
  }

  const mergedFaces: FaceExtraction[] = firstPass.faces.map((f) => {
    if (f.kind !== target.kind) return f;
    return {
      kind: f.kind,
      fields: {
        ...f.fields,
        government_warning: reread.warningText,
      },
      warning: {
        presence: f.warning.presence,
        allCaps: reread.allCaps,
        boldConfident: reread.boldConfident,
        legibility: "good",
      },
    };
  });
  return { ...firstPass, faces: mergedFaces, rereadAttempted: true };
}
