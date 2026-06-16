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

import type { VisionProvider } from "./types";

/**
 * Lazy-load each adapter on demand so the cold-start phase never
 * imports SDKs we won't use (P5-8 Vercel hardening). The previous
 * top-of-file eager imports pulled in `openai` + Anthropic SDK +
 * provider clients on every route that depended on this module,
 * and one of those SDKs was crashing the function's cold-start.
 */
async function loadProvider(name: string): Promise<VisionProvider> {
  switch (name) {
    case "mock": {
      const { MockVisionProvider } = await import("./mock");
      return new MockVisionProvider();
    }
    case "anthropic": {
      const { AnthropicVisionProvider } = await import("./anthropic");
      return new AnthropicVisionProvider();
    }
    case "azure-openai-gov": {
      const { AzureOpenAIGovVisionProvider } = await import("./azure-openai-gov");
      return new AzureOpenAIGovVisionProvider();
    }
    case "olmocr": {
      const { OlmocrVisionProvider } = await import("./olmocr");
      return new OlmocrVisionProvider();
    }
    case "glm-ocr": {
      const { GlmOcrVisionProvider } = await import("./glm-ocr");
      return new GlmOcrVisionProvider();
    }
    case "qwen-vl": {
      const { QwenVlVisionProvider } = await import("./qwen-vl");
      return new QwenVlVisionProvider();
    }
    default:
      throw new Error(
        `Unknown PROVIDER value "${name}". ` +
          `Known: ${[...KNOWN_PROVIDERS].sort().join(", ")}.`,
      );
  }
}

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
export async function getProvider(): Promise<VisionProvider> {
  const name = (process.env.PROVIDER ?? "mock").toLowerCase();
  return loadProvider(name);
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
