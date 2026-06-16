/**
 * Vision-provider registry (P5-4).
 *
 * A typed keyed list of every candidate the model bake-off can exercise.
 * Each entry carries:
 *   - the adapter factory (`build()`),
 *   - stakeholder-facing origin metadata (vendor, country, license,
 *     in-boundary status, security-review status),
 *   - an approximate per-call cost used as a tie-breaker by the
 *     comparison ranking.
 *
 * The order of `PROVIDER_REGISTRY` encodes the recommendation hierarchy
 * (Azure Gov first among production, olmOCR first among self-hosted), but
 * the comparison report still ranks by measured metrics. The framing
 * rule lives in `lib/eval/bakeoff/comparison.ts`.
 */

import { AnthropicVisionProvider } from "./anthropic";
import { AzureOpenAIGovVisionProvider } from "./azure-openai-gov";
import { GlmOcrVisionProvider } from "./glm-ocr";
import { MockVisionProvider } from "./mock";
import { OlmocrVisionProvider } from "./olmocr";
import { QwenVlVisionProvider } from "./qwen-vl";
import type { VisionProvider } from "./types";

export type ProviderOrigin = {
  /** Vendor name surfaced in the report ("Anthropic", "Microsoft", ...). */
  vendor: string;
  /** "United States", "China", or "n/a" for the in-repo mock. */
  countryOfOrigin: string;
  /** "Commercial SaaS", "Apache 2.0", "Custom OSS", "Internal". */
  license: string;
  /**
   * Whether the candidate is reachable inside the federal boundary.
   *   - "yes"                    — self-hosted; no external endpoint.
   *   - "no"                     — public API; out of boundary.
   *   - "via-azure-government"   — Azure Gov tenant (FedRAMP High).
   */
  inBoundary: "yes" | "no" | "via-azure-government";
  /**
   * Security-review posture for federal procurement.
   *   - "approved"     — cleared for Treasury workloads.
   *   - "not_required" — internal / dev fixture.
   *   - "pending"      — needs executive review before any Treasury use.
   */
  securityReview: "approved" | "not_required" | "pending";
  /** Free-form caveats / framing notes for the comparison report. */
  notes?: string;
};

export type ProviderEntry = {
  id: string;
  displayName: string;
  origin: ProviderOrigin;
  /** Cost per call in USD; approximate; documented at the entry. */
  estimatedCostPerCallUsd: number;
  /**
   * Constructs an adapter. Throws with a clear "not provisioned" message
   * when required env is missing — the bake-off catches and records the
   * candidate as `not-run` in the report.
   */
  build(): VisionProvider;
};

export const PROVIDER_REGISTRY: ReadonlyArray<ProviderEntry> = [
  {
    id: "mock",
    displayName: "Mock (CI baseline)",
    origin: {
      vendor: "LabelCheck",
      countryOfOrigin: "n/a",
      license: "Internal",
      inBoundary: "yes",
      securityReview: "not_required",
      notes: "Deterministic; for CI.",
    },
    estimatedCostPerCallUsd: 0,
    build(): VisionProvider {
      return new MockVisionProvider();
    },
  },
  {
    id: "anthropic",
    displayName: "Anthropic Claude Sonnet 4.6",
    origin: {
      vendor: "Anthropic",
      countryOfOrigin: "United States",
      license: "Commercial SaaS",
      inBoundary: "no",
      securityReview: "not_required",
      notes:
        "Prototype baseline. Not in-boundary for federal deploy.",
    },
    estimatedCostPerCallUsd: 0.012,
    build(): VisionProvider {
      return new AnthropicVisionProvider();
    },
  },
  {
    id: "azure-openai-gov",
    displayName: "Azure OpenAI GPT-4o (Azure Government)",
    origin: {
      vendor: "Microsoft",
      countryOfOrigin: "United States",
      license: "Commercial SaaS",
      inBoundary: "via-azure-government",
      securityReview: "approved",
      notes:
        "Recommended production path. FedRAMP High; no external endpoint.",
    },
    estimatedCostPerCallUsd: 0.008,
    build(): VisionProvider {
      return new AzureOpenAIGovVisionProvider();
    },
  },
  {
    id: "olmocr",
    displayName: "olmOCR (self-hosted)",
    origin: {
      vendor: "Allen Institute for AI",
      countryOfOrigin: "United States",
      license: "Apache 2.0",
      inBoundary: "yes",
      securityReview: "approved",
      notes:
        "Provenance-safe lead for air-gapped deploys. Self-hosted; no API costs.",
    },
    estimatedCostPerCallUsd: 0,
    build(): VisionProvider {
      return new OlmocrVisionProvider();
    },
  },
  {
    id: "glm-ocr",
    displayName: "GLM-OCR (self-hosted)",
    origin: {
      vendor: "Zhipu AI",
      countryOfOrigin: "China",
      license: "Custom OSS",
      inBoundary: "yes",
      securityReview: "pending",
      notes:
        "Top-accuracy candidate. PENDING SECURITY REVIEW — Chinese-origin model; not approved for Treasury workloads without an executive review.",
    },
    estimatedCostPerCallUsd: 0,
    build(): VisionProvider {
      return new GlmOcrVisionProvider();
    },
  },
  {
    id: "qwen-vl",
    displayName: "Qwen2.5-VL (self-hosted)",
    origin: {
      vendor: "Alibaba",
      countryOfOrigin: "China",
      license: "Custom OSS",
      inBoundary: "yes",
      securityReview: "pending",
      notes:
        "Top-accuracy candidate. PENDING SECURITY REVIEW — Chinese-origin model; same caveat as GLM-OCR.",
    },
    estimatedCostPerCallUsd: 0,
    build(): VisionProvider {
      return new QwenVlVisionProvider();
    },
  },
];

export function getProviderEntry(id: string): ProviderEntry | null {
  return PROVIDER_REGISTRY.find((entry) => entry.id === id) ?? null;
}
