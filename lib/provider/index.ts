/**
 * Provider factory — env-driven, single seam (D8).
 *
 * `PROVIDER=mock` is the default and gets P0-7 CI green without an API
 * key. Live provider implementations land in P1-2 (Anthropic Claude
 * Sonnet 4.6 per D8) and P6-1 (Azure OpenAI in Azure Government as the
 * recommended production path, with self-hosted olmOCR as the air-gapped
 * fallback — see techstack.md Model Selection).
 *
 * Selection table — the model bake-off (P5-4) also keys candidates by the
 * same ids via `lib/provider/registry.ts`.
 *
 * | PROVIDER          | Adapter                       | Notes                              |
 * | ---               | ---                           | ---                                 |
 * | (unset) / mock    | MockVisionProvider            | CI default; no env required        |
 * | anthropic         | AnthropicVisionProvider       | Requires ANTHROPIC_API_KEY         |
 * | azure-openai-gov  | AzureOpenAIGovVisionProvider  | Requires AZURE_OPENAI_GOV_*        |
 * | olmocr            | OlmocrVisionProvider          | Reads OLMOCR_ENDPOINT              |
 * | glm-ocr           | GlmOcrVisionProvider          | Requires GLM_OCR_ENDPOINT; pending |
 * | qwen-vl           | QwenVlVisionProvider          | Requires QWEN_VL_ENDPOINT; pending |
 */

import { AnthropicVisionProvider } from "./anthropic";
import { AzureOpenAIGovVisionProvider } from "./azure-openai-gov";
import { GlmOcrVisionProvider } from "./glm-ocr";
import { MockVisionProvider } from "./mock";
import { OlmocrVisionProvider } from "./olmocr";
import { QwenVlVisionProvider } from "./qwen-vl";
import type { VisionProvider } from "./types";

const KNOWN_PROVIDERS = new Set([
  "mock",
  "anthropic",
  "azure-openai-gov",
  "olmocr",
  "glm-ocr",
  "qwen-vl",
]);

/**
 * Return the configured vision provider.
 *
 * Throws with a clear "not provisioned" / "not yet implemented" message
 * when the requested adapter is missing required env, so the bake-off
 * can catch it and mark the candidate `not-run`.
 */
export function getProvider(): VisionProvider {
  const name = (process.env.PROVIDER ?? "mock").toLowerCase();

  if (name === "mock") {
    return new MockVisionProvider();
  }

  if (name === "anthropic") {
    return new AnthropicVisionProvider();
  }

  if (name === "azure-openai-gov") {
    return new AzureOpenAIGovVisionProvider();
  }

  if (name === "olmocr") {
    return new OlmocrVisionProvider();
  }

  if (name === "glm-ocr") {
    return new GlmOcrVisionProvider();
  }

  if (name === "qwen-vl") {
    return new QwenVlVisionProvider();
  }

  throw new Error(
    `Unknown PROVIDER value "${name}". ` +
      `Known: ${[...KNOWN_PROVIDERS].sort().join(", ")}.`,
  );
}

export type {
  ExtractionRequest,
  ExtractionResponse,
  FaceExtraction,
  ProviderFaceInput,
  VisionProvider,
  WarningRereadInput,
  WarningRereadResponse,
} from "./types";
