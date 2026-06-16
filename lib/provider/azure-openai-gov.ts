/**
 * Azure OpenAI vision adapter — recommended production path (P5-4, P6-1).
 *
 * Target: GPT-4o family deployment on **Azure OpenAI in Azure Government**
 * (FedRAMP High, US vendor, no external endpoint). This is the recommended
 * in-boundary path per `docs/02-design/techstack.md` (Model Selection ->
 * Path one). The endpoint is consumed inside the Azure Gov boundary; the
 * model is not reachable from the public Azure region.
 *
 * Posture:
 *   - Vendor: Microsoft (Azure Government).
 *   - Country of origin: United States.
 *   - License: Commercial SaaS.
 *   - In-boundary: yes (via Azure Government).
 *   - Security review: approved (FedRAMP High inherited).
 *
 * Config (env, all required):
 *   - AZURE_OPENAI_GOV_ENDPOINT — Azure Gov resource URL,
 *     e.g. `https://<resource>.openai.azure.us/`.
 *   - AZURE_OPENAI_GOV_API_KEY — Azure Gov resource key.
 *   - AZURE_OPENAI_GOV_DEPLOYMENT — deployment name for the vision model.
 *
 * If any env var is missing, the constructor throws a clear "not
 * provisioned" message and the bake-off marks this candidate as `not-run`
 * in the comparison report. The adapter is implemented end-to-end against
 * the `openai` SDK's Azure client; a configured Azure Gov deployment will
 * run through it. The serving prompt is the same one P1-2 uses
 * (`lib/extraction/prompt`), reusing the shared response shape — same
 * adapter surface for every candidate (D8) is the whole point of the
 * bake-off.
 */

import { AzureOpenAI } from "openai";
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

const DEFAULT_API_VERSION = "2024-08-01-preview";
const MAX_TOKENS = 2048;

// ---------------------------------------------------------------------------
// Response validation — mirrors the Anthropic adapter so the comparison is
// on equal footing.
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
  fields: z.record(FieldNameSchema, z.string()),
  warning: WarningFlagsSchema,
});

const ExtractionResponseSchema = z.object({
  faces: z.array(FaceExtractionSchema),
});

export class AzureOpenAIGovVisionProvider implements VisionProvider {
  readonly name = "azure-openai-gov";
  private readonly client: AzureOpenAI;
  private readonly deployment: string;

  constructor() {
    const endpoint = process.env.AZURE_OPENAI_GOV_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_GOV_API_KEY;
    const deployment = process.env.AZURE_OPENAI_GOV_DEPLOYMENT;
    if (!endpoint || !apiKey || !deployment) {
      throw new Error(
        "Azure OpenAI Gov not provisioned (set AZURE_OPENAI_GOV_ENDPOINT, AZURE_OPENAI_GOV_API_KEY, AZURE_OPENAI_GOV_DEPLOYMENT)",
      );
    }
    const apiVersion =
      process.env.AZURE_OPENAI_GOV_API_VERSION ?? DEFAULT_API_VERSION;
    this.client = new AzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion,
    });
    this.deployment = deployment;
  }

  async extract(input: ExtractionRequest): Promise<ExtractionResponse> {
    const prompt = buildExtractionPrompt({
      beverageType: input.beverageType,
      fieldSchema: input.fieldSchema,
      faces: input.faces.map((f) => f.kind),
    });

    // Chat Completions multimodal: image_url with a data: URI carries the
    // base64 bytes inline. Same shape Anthropic uses, swapped for OpenAI's.
    const userContent = [
      ...input.faces.map((face) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${face.mime};base64,${face.bytes.toString("base64")}`,
        },
      })),
      { type: "text" as const, text: prompt },
    ];

    const response = await this.client.chat.completions.create({
      model: this.deployment,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("Azure OpenAI Gov response missing text content");
    }

    const parsed = parseJsonStrict(text);
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

  /**
   * The targeted warning re-read (P3-2) is mock-only today; the live
   * Anthropic adapter rejects, and so does this one. A real call lands
   * when the live provider is exercised against a real cost budget.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rereadWarning(_input: WarningRereadInput): Promise<WarningRereadResponse> {
    return Promise.reject(
      new Error(
        "Not implemented in Phase 5 prototype — mock provider only for re-read",
      ),
    );
  }
}

/**
 * Best-effort JSON parser tolerant of a wrapped code fence the model
 * sometimes adds despite the JSON-mode instruction.
 */
function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? (fenced[1] ?? trimmed) : trimmed;
  return JSON.parse(body);
}
