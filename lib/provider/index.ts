/**
 * Provider factory + chain — env-driven, single seam (D8).
 *
 * `PROVIDER` is either a single id (e.g. `anthropic`, `mock`) or a
 * comma-separated chain (e.g. `anthropic,openai,openrouter`). The
 * extraction service uses `getProviderChain()` + `withFailover()` to
 * try each slot in order; if every slot fails, the request surfaces a
 * degraded result. Single-id values still work via `getProvider()` for
 * test paths that stub the provider.
 *
 * Selection table:
 *
 * | id               | adapter                       | required env                 |
 * | ---              | ---                           | ---                           |
 * | mock             | MockVisionProvider            | none                          |
 * | anthropic        | AnthropicVisionProvider       | ANTHROPIC_API_KEY             |
 * | openai           | OpenAIVisionProvider          | OPENAI_API_KEY                |
 * | openrouter       | OpenRouterVisionProvider      | OPENROUTER_API_KEY            |
 * | azure-openai-gov | AzureOpenAIGovVisionProvider  | AZURE_OPENAI_GOV_*            |
 * | olmocr           | OlmocrVisionProvider          | OLMOCR_ENDPOINT               |
 * | glm-ocr          | GlmOcrVisionProvider          | GLM_OCR_ENDPOINT (review)     |
 * | qwen-vl          | QwenVlVisionProvider          | QWEN_VL_ENDPOINT (review)     |
 *
 * Adapters are lazy-loaded so the cold-start path never imports SDKs
 * we won't use.
 */

import type { VisionProvider } from "./types";

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
    case "openai": {
      const { OpenAIVisionProvider } = await import("./openai");
      return new OpenAIVisionProvider();
    }
    case "openrouter": {
      const { OpenRouterVisionProvider } = await import("./openrouter");
      return new OpenRouterVisionProvider();
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
  "openai",
  "openrouter",
  "azure-openai-gov",
  "olmocr",
  "glm-ocr",
  "qwen-vl",
]);

function parseProviderChain(): string[] {
  const raw = process.env.PROVIDER ?? "mock";
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (ids.length === 0) return ["mock"];
  for (const id of ids) {
    if (!KNOWN_PROVIDERS.has(id)) {
      throw new Error(
        `Unknown PROVIDER value "${id}". ` +
          `Known: ${[...KNOWN_PROVIDERS].sort().join(", ")}.`,
      );
    }
  }
  return ids;
}

/**
 * Single-provider accessor — returns the FIRST slot in the chain. Used
 * by tests that stub `getProvider()` directly, and by callers that
 * don't need failover (the bake-off, single-provider isolation tests).
 */
export async function getProvider(): Promise<VisionProvider> {
  const chain = parseProviderChain();
  return loadProvider(chain[0]!);
}

/**
 * Resolved provider chain in order. Each slot is loaded lazily so a
 * misconfigured fallback (missing API key on slot 2) doesn't block
 * startup of a healthy primary.
 */
export type ProviderChainSlot = {
  id: string;
  load(): Promise<VisionProvider>;
};

export function getProviderChain(): ProviderChainSlot[] {
  const ids = parseProviderChain();
  return ids.map((id, index) => ({
    id,
    async load(): Promise<VisionProvider> {
      // Slot 0 delegates to `getProvider()` via dynamic import so tests
      // that spy on `getProvider` continue to control the primary
      // adapter without per-test rewrites. Slots 1..N call
      // `loadProvider(id)` directly.
      if (index === 0) {
        const mod = await import("./index");
        return mod.getProvider();
      }
      return loadProvider(id);
    },
  }));
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
