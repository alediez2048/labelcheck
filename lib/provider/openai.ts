/**
 * OpenAI vision adapter — failover slot when Anthropic is unavailable.
 *
 * Targets the OpenAI chat-completions endpoint with a vision-capable
 * model (default gpt-4o). Implements the same `VisionProvider`
 * interface every other adapter does so the rest of the system stays
 * provider-agnostic.
 *
 * Keep the file deliberately small — this is a fallback, not the
 * production answer. No bake-off integration, no exotic prompt forks,
 * no retry-on-this-specific-error-shape special cases.
 */

import { OpenAI } from "openai";
import { z } from "zod";

import { buildExtractionPrompt, EXTRACTION_PROMPT_VERSION } from "@/lib/extraction/prompt";
import type { FaceKind, FieldName } from "@/types";

import {
  coerceNullFieldsToEmptyStrings,
  parseJsonStrict,
} from "./openaiCompatibleParse";
import type {
  ExtractionRequest,
  ExtractionResponse,
  FaceExtraction,
  VisionProvider,
  WarningRereadInput,
  WarningRereadResponse,
} from "./types";

const DEFAULT_MODEL = "gpt-4o";
const MAX_TOKENS = 2048;

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
  fields: z.record(
    FieldNameSchema,
    z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v) => v ?? ""),
  ),
  warning: WarningFlagsSchema,
});
const ExtractionResponseSchema = z.object({
  faces: z.array(FaceExtractionSchema),
});

export class OpenAIVisionProvider implements VisionProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY not set. Set the env var or remove `openai` from the PROVIDER chain.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  async extract(input: ExtractionRequest): Promise<ExtractionResponse> {
    const prompt = buildExtractionPrompt({
      beverageType: input.beverageType,
      fieldSchema: input.fieldSchema,
      faces: input.faces.map((f) => f.kind),
    });

    const content = [
      ...input.faces.map((face) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${face.mime};base64,${face.bytes.toString("base64")}`,
        },
      })),
      { type: "text" as const, text: prompt },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI response missing text content");
    }

    const parsed = parseJsonStrict(text);
    coerceNullFieldsToEmptyStrings(parsed);
    const validated = ExtractionResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(
        `Extraction response did not match schema (prompt ${EXTRACTION_PROMPT_VERSION}): ${validated.error.message}`,
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

  cost_per_case(): number {
    // GPT-4o vision ~$0.01-0.02 per multi-face COLA at full resolution.
    return 0.015;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rereadWarning(_input: WarningRereadInput): Promise<WarningRereadResponse> {
    return Promise.reject(
      new Error("Not implemented — fallback adapter only does first-pass extraction"),
    );
  }
}
