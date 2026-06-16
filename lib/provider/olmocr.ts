/**
 * olmOCR self-hosted vision adapter — provenance-safe air-gapped fallback.
 *
 * Reference: https://github.com/allenai/olmocr (Allen Institute for AI,
 * US-origin, Apache 2.0, fully open weights / training data / code).
 *
 * Posture:
 *   - Vendor: Allen Institute for AI.
 *   - Country of origin: United States.
 *   - License: Apache 2.0.
 *   - In-boundary: yes (self-hosted; no external endpoint).
 *   - Security review: approved (provenance-safe, US non-profit).
 *
 * This is the LEAD self-hosted candidate per `docs/02-design/techstack.md`
 * Path two. GLM-OCR / Qwen2.5-VL are the top-accuracy candidates but they
 * are Chinese-origin and pending security review — olmOCR is the
 * provenance-safe pick that gets recommended.
 *
 * Wire shape: this adapter posts to a local olmOCR serving endpoint over
 * `fetch`. The operator stands up the model server (the olmOCR repo ships
 * a serving example); this adapter's request shape is:
 *
 *   POST <OLMOCR_ENDPOINT>/extract
 *   {
 *     applicationId: string,
 *     beverageType: BeverageType,
 *     faces: [{ kind: FaceKind, mime: "image/jpeg" | "image/png", bytes: <base64> }],
 *     fieldSchema: FieldName[]
 *   }
 *
 *   200 OK -> ExtractionResponse JSON (same shape the mock returns).
 *   non-200 or unreachable -> throws; the bake-off marks this candidate
 *                              as `not-run` with the error message.
 *
 * The exact prompt + response shape gets nailed down when the operator
 * actually stands up the local model server — keeping the contract here
 * stable is what lets the bake-off compare candidates on the same surface.
 */

import { z } from "zod";

import type { FaceKind, FieldName } from "@/types";

import type {
  ExtractionRequest,
  ExtractionResponse,
  FaceExtraction,
  VisionProvider,
  WarningRereadInput,
  WarningRereadResponse,
} from "./types";

const DEFAULT_ENDPOINT = "http://localhost:8080";

const FaceKindSchema = z.enum(["front", "back", "neck"]);
const FieldNameSchema = z.enum([
  "brand_name",
  "fanciful_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "producer_name",
  "producer_address",
  "country_of_origin",
  "government_warning",
]);
const WarningFlagsSchema = z.object({
  presence: z.boolean(),
  allCaps: z.boolean(),
  boldConfident: z.enum(["yes", "no", "uncertain"]),
  legibility: z.enum(["good", "low"]),
});
const FaceExtractionSchema = z.object({
  kind: FaceKindSchema,
  fields: z.record(FieldNameSchema, z.string()),
  warning: WarningFlagsSchema,
});
const ExtractionResponseSchema = z.object({
  faces: z.array(FaceExtractionSchema),
});

export class OlmocrVisionProvider implements VisionProvider {
  readonly name = "olmocr";
  private readonly endpoint: string;

  constructor() {
    this.endpoint = (process.env.OLMOCR_ENDPOINT ?? DEFAULT_ENDPOINT).replace(
      /\/+$/,
      "",
    );
  }

  async extract(input: ExtractionRequest): Promise<ExtractionResponse> {
    const body = {
      applicationId: input.applicationId,
      beverageType: input.beverageType,
      faces: input.faces.map((face) => ({
        kind: face.kind,
        mime: face.mime,
        bytes: face.bytes.toString("base64"),
      })),
      fieldSchema: input.fieldSchema,
    };

    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `olmOCR endpoint unreachable at ${this.endpoint}: ${detail}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `olmOCR endpoint returned ${response.status} ${response.statusText}`,
      );
    }

    const raw: unknown = await response.json();
    const validated = ExtractionResponseSchema.safeParse(raw);
    if (!validated.success) {
      throw new Error(
        `olmOCR response did not match schema: ${validated.error.message}`,
      );
    }

    return {
      faces: validated.data.faces.map(
        (face): FaceExtraction => ({
          kind: face.kind as FaceKind,
          fields: face.fields as Partial<Record<FieldName, string>>,
          warning: face.warning,
        }),
      ),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rereadWarning(_input: WarningRereadInput): Promise<WarningRereadResponse> {
    return Promise.reject(
      new Error(
        "olmOCR re-read not implemented — mock provider handles the P3-2 re-read path",
      ),
    );
  }
}
