/**
 * OpenRouter vision adapter — failover slot when Anthropic AND OpenAI
 * are both unavailable.
 *
 * Targets the OpenRouter chat-completions endpoint
 * (https://openrouter.ai/api/v1) via the OpenAI-compatible SDK. Default
 * model is `google/gemini-2.5-flash` — fast, cheap (~$0.001/COLA),
 * reliable, US vendor. Override via OPENROUTER_MODEL if needed.
 *
 * Keep deliberately minimal — this is the last real provider in the
 * chain before the request fails outright.
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

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_REFERER = "https://github.com/labelcheck/labelcheck";
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

export class OpenRouterVisionProvider implements VisionProvider {
  readonly name = "openrouter";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY not set. Set the env var or remove `openrouter` from the PROVIDER chain.",
      );
    }
    const baseURL = process.env.OPENROUTER_ENDPOINT ?? DEFAULT_ENDPOINT;
    const referer = process.env.OPENROUTER_REFERER ?? DEFAULT_REFERER;
    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        "HTTP-Referer": referer,
        "X-Title": "LabelCheck",
      },
    });
    this.model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
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
      messages: [{ role: "user", content }],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("OpenRouter response missing text content");
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
    // Gemini 2.5 Flash via OpenRouter: ~$0.001 per multi-face COLA.
    return 0.001;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rereadWarning(_input: WarningRereadInput): Promise<WarningRereadResponse> {
    return Promise.reject(
      new Error("Not implemented — fallback adapter only does first-pass extraction"),
    );
  }
}
