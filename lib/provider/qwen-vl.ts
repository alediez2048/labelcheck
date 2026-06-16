/**
 * Qwen2.5-VL vision adapter (Alibaba, China-origin).
 *
 * ⚠ PENDING SECURITY REVIEW. Not approved for Treasury workloads.
 *
 * This adapter exists so the model bake-off can MEASURE Chinese-origin
 * candidates against the golden set on the same harness — but the
 * comparison report's recommendation template (lib/eval/bakeoff/
 * report.ts) ensures this adapter is NEVER in the lead position of
 * the recommendation paragraph regardless of measured accuracy.
 *
 * Reference: techstack.md "Stakeholder framing rule".
 *
 * Posture:
 *   - Vendor: Alibaba.
 *   - Country of origin: China.
 *   - License: Custom OSS.
 *   - In-boundary: yes (self-hosted; no external endpoint).
 *   - Security review: PENDING — not approved for Treasury workloads.
 *
 * Wire shape mirrors `lib/provider/olmocr.ts` so the bake-off compares
 * candidates on the same surface (D8). Requires `QWEN_VL_ENDPOINT`; throws
 * "Qwen2.5-VL endpoint not configured" if missing.
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

export class QwenVlVisionProvider implements VisionProvider {
  readonly name = "qwen-vl";
  private readonly endpoint: string;

  constructor() {
    const endpoint = process.env.QWEN_VL_ENDPOINT;
    if (!endpoint) {
      throw new Error(
        "Qwen2.5-VL endpoint not configured (set QWEN_VL_ENDPOINT). PENDING SECURITY REVIEW — not approved for Treasury workloads without executive review.",
      );
    }
    this.endpoint = endpoint.replace(/\/+$/, "");
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
        `Qwen2.5-VL endpoint unreachable at ${this.endpoint}: ${detail}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Qwen2.5-VL endpoint returned ${response.status} ${response.statusText}`,
      );
    }

    const raw: unknown = await response.json();
    const validated = ExtractionResponseSchema.safeParse(raw);
    if (!validated.success) {
      throw new Error(
        `Qwen2.5-VL response did not match schema: ${validated.error.message}`,
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
      new Error("Qwen2.5-VL re-read not implemented — mock provider only"),
    );
  }
}
