/**
 * Anthropic Claude vision provider — the production default per D8.
 *
 * Lives behind the `VisionProvider` interface so the rest of the system
 * never knows whether it's hitting Claude, Azure OpenAI (P6-1), or
 * self-hosted olmOCR (P6-1 alt path). Selection is env-driven via
 * `lib/provider/index.ts`.
 *
 * The model returns text and warning structural flags only — never a
 * "matches" verdict (D4). The matching engine (P1-3) does the comparing.
 *
 * Model: `claude-sonnet-4-6` (techstack: Model Selection — accuracy-safe
 * default per D8). Override with `ANTHROPIC_MODEL` if needed for evals.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { buildExtractionPrompt, EXTRACTION_PROMPT_VERSION } from "@/lib/extraction/prompt";
import type { FaceKind, FieldName } from "@/types";

import type {
  ExtractionRequest,
  ExtractionResponse,
  FaceExtraction,
  VisionProvider,
  WarningRereadInput,
  WarningRereadResponse,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

// ---------------------------------------------------------------------------
// Response validation (Zod)
// ---------------------------------------------------------------------------

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
  // Accept null/undefined and coerce to empty string. Claude returns
  // null when a field isn't visible on the label, which is correct
  // behaviour — we keep "" downstream so the matcher treats it as
  // "not found" rather than rejecting the whole extraction.
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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AnthropicVisionProvider implements VisionProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. Set the env var or use PROVIDER=mock.",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async extract(input: ExtractionRequest): Promise<ExtractionResponse> {
    const prompt = buildExtractionPrompt({
      beverageType: input.beverageType,
      fieldSchema: input.fieldSchema,
      faces: input.faces.map((f) => f.kind),
    });

    const content: Anthropic.ContentBlockParam[] = [
      ...input.faces.map(
        (face): Anthropic.ImageBlockParam => ({
          type: "image",
          source: {
            type: "base64",
            media_type: face.mime,
            data: face.bytes.toString("base64"),
          },
        }),
      ),
      { type: "text", text: prompt },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      throw new Error("Anthropic response missing text content");
    }

    const parsed = parseJsonStrict(textBlock.text);
    // Claude correctly returns null for fields not visible on the label.
    // Our schema requires strings, so coerce nulls to "" before validation.
    // The matcher already treats "" as a missing value (no false-positive
    // match risk), so this is a safe transformation.
    coerceNullFieldsToEmptyStrings(parsed);
    const validated = ExtractionResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(
        `Extraction response did not match schema (prompt ${EXTRACTION_PROMPT_VERSION}): ${validated.error.message}`,
      );
    }

    // The validated shape is structurally identical to ExtractionResponse,
    // but TS doesn't infer that the `fields` Record narrowed to
    // Partial<Record<FieldName, string>>. Map through once so the public
    // contract is satisfied without a cast.
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
    // Rough per-application cost on Sonnet 4.6 with full-res multi-face
    // call: ~$0.025/app. Used by P5-4's bake-off cost estimate.
    return 0.025;
  }

  /**
   * Targeted high-resolution warning re-read (P3-2).
   *
   * The live Anthropic adapter intentionally throws today: a real Claude
   * prompt for the cropped region lands when the live provider is
   * exercised against a real cost budget (out of scope for P3-2). The
   * extraction service tolerates the throw via `withTimeout` and the
   * `rereadWarning` wrapper — the first-pass result is kept and the
   * triage classifier routes the application via FR-16 + FR-26b.
   *
   * The signature matches the `VisionProvider.rereadWarning` contract so
   * the live adapter compiles against the extended interface even though
   * the second pass is implemented mock-only for now.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rereadWarning(_input: WarningRereadInput): Promise<WarningRereadResponse> {
    return Promise.reject(
      new Error(
        "Not implemented in Phase 3 prototype — mock provider only",
      ),
    );
  }
}

/**
 * Best-effort JSON parser tolerant of a wrapped code fence the model
 * sometimes adds despite the "no markdown" instruction.
 */
function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? (fenced[1] ?? trimmed) : trimmed;
  return JSON.parse(body);
}

/**
 * Claude returns `null` for fields it cannot read off the label, but
 * our extraction schema requires strings. Walk `faces[].fields` and
 * convert any null/undefined/non-string values to "". The matcher
 * treats "" as a missing value, so this is safe — a missing field
 * still triggers the right per-field result, not a false-positive
 * match.
 */
function coerceNullFieldsToEmptyStrings(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") return;
  const root = parsed as { faces?: Array<{ fields?: Record<string, unknown> }> };
  if (!Array.isArray(root.faces)) return;
  for (const face of root.faces) {
    if (!face || typeof face !== "object" || !face.fields) continue;
    for (const k of Object.keys(face.fields)) {
      const v = face.fields[k];
      if (typeof v !== "string") {
        face.fields[k] = "";
      }
    }
  }
}
