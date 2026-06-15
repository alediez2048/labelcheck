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
import { getProvider } from "@/lib/provider";
import type {
  ExtractionRequest,
  ExtractionResponse,
  ProviderFaceInput,
} from "@/lib/provider";
import {
  isTransientError,
  TimeoutError,
  withRetry,
  withTimeout,
} from "@/lib/provider/withTimeout";
import { getRequiredFields } from "@/lib/config";
import type { BeverageType, FaceKind, FieldName } from "@/types";

/**
 * D10 numbers, in one place. Tuning knobs live here so a future P5-2
 * calibration sweep (or a provider swap in P6-1) doesn't have to chase
 * literals scattered across the codebase. The 8000ms per-attempt timeout
 * is a degradation knob, not a hard kill — p95-under-5s is the goal the
 * route is measured against (NFR-1), not the per-call cutoff.
 */
const PROVIDER_TIMEOUT_MS = 8000;
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
  const provider = getProvider();
  const modelStart = performance.now();
  let outcome: "ok" | "timeout" | "transient" | "error" = "ok";
  try {
    const response = await withRetry(
      () =>
        withTimeout(
          (_signal) => provider.extract(request),
          PROVIDER_TIMEOUT_MS,
        ),
      {
        attempts: PROVIDER_RETRY_ATTEMPTS,
        backoffMs: PROVIDER_RETRY_BACKOFF_MS,
        retryOn: isTransientError,
      },
    );
    return response;
  } catch (err) {
    if (err instanceof TimeoutError) {
      outcome = "timeout";
      return { faces: [], degraded: "timeout" };
    }
    if (isTransientError(err)) {
      // Exhausted-retry transient error (e.g. provider 503 on both
      // attempts). The right behaviour is the same as a timeout — the
      // agent sees an actionable review-lane result, not a stack trace.
      outcome = "transient";
      return { faces: [], degraded: "transient" };
    }
    outcome = "error";
    throw err;
  } finally {
    const modelMs = Math.round(performance.now() - modelStart);
    // Structured log line — id, face count, duration, outcome only.
    // No bytes, no transcribed text, no form values (observability.md
    // Privacy + NFR-4).
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        event: "extraction.call",
        applicationId: application.id,
        provider: provider.name,
        faceCount: application.faces.length,
        modelMs,
        outcome,
      }),
    );
  }
}
