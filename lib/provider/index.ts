/**
 * Provider factory — env-driven, single seam (D8).
 *
 * `PROVIDER=mock` is the default and gets P0-7 CI green without an API
 * key. Live provider implementations land in P1-2 (Anthropic Claude
 * Sonnet 4.6 per D8) and P6-1 (Azure OpenAI in Azure Government as the
 * recommended production path, with self-hosted olmOCR as the air-gapped
 * fallback — see techstack.md Model Selection).
 */

import { AnthropicVisionProvider } from "./anthropic";
import { MockVisionProvider } from "./mock";
import type { VisionProvider } from "./types";

const KNOWN_LIVE_PROVIDERS = new Set(["anthropic", "openai", "olmocr", "azure-openai"]);

/**
 * Return the configured vision provider.
 *
 * - `PROVIDER` unset or `"mock"` → MockVisionProvider (the default).
 * - `PROVIDER=anthropic` → AnthropicVisionProvider (Claude Sonnet 4.6).
 *   Requires `ANTHROPIC_API_KEY`.
 * - `PROVIDER` is `azure-openai` or `olmocr` → throws with a pointer to
 *   P6-1 (the in-boundary implementations).
 * - `PROVIDER` is anything else → throws with the list of known values.
 */
export function getProvider(): VisionProvider {
  const name = (process.env.PROVIDER ?? "mock").toLowerCase();

  if (name === "mock") {
    return new MockVisionProvider();
  }

  if (name === "anthropic") {
    return new AnthropicVisionProvider();
  }

  if (KNOWN_LIVE_PROVIDERS.has(name)) {
    throw new Error(
      `Live provider "${name}" is not yet implemented. ` +
        `See P6-1 (azure-openai / olmocr) ticket.`,
    );
  }

  throw new Error(
    `Unknown PROVIDER value "${name}". ` +
      `Known: mock, ${[...KNOWN_LIVE_PROVIDERS].sort().join(", ")}.`,
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
