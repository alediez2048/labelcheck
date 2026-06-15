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
import { getRequiredFields } from "@/lib/config";
import type { BeverageType, FaceKind, FieldName } from "@/types";

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

  // 3. One provider round trip (D14).
  const provider = getProvider();
  return provider.extract(request);
}
