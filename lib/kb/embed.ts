/**
 * Mock embedder — deterministic 384-dim unit vectors derived from a
 * FNV-1a hash of the input text.
 *
 * Why this is the prototype's "real" embedder, even with the Anthropic
 * SDK available: the SDK has no public embeddings API as of 2026-06.
 * The path forward is provider-specific:
 *
 *   - Anthropic pipelines → Voyage AI (`voyage-3` / `voyage-3-large`).
 *     Anthropic explicitly recommends Voyage for retrieval workloads
 *     paired with Claude. Drop-in: implement `KnowledgeBaseEmbedder`
 *     against `@voyageai/voyageai`, return the unit-normalised vector.
 *   - OpenAI pipelines → `text-embedding-3-small` (1536-dim). Drop-in:
 *     implement against `openai` package; same shape.
 *   - Federal / air-gapped → a self-hosted embedder (e.g. sentence-
 *     transformers running alongside olmOCR per techstack.md model
 *     selection).
 *
 * The mock guarantees structural correctness only: identical input →
 * identical vector → cosine similarity 1. It does NOT guarantee that
 * semantically similar inputs produce close vectors; that's a property
 * of a real embedder. Tests that need semantic ordering should assert
 * the self-similarity property (a chunk should rank itself first when
 * queried with its own body) rather than cross-document semantic
 * similarity.
 */

import type { KnowledgeBaseEmbedder } from "@/types/kb";

const EMBED_DIM = 384;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Mock embedder. The output is a function of the input bytes:
 *
 *   1. Fold the input through FNV-1a once per output dimension, seeded
 *      with the dimension index so the components are decorrelated.
 *   2. Map the resulting uint32 into [-1, 1] by dividing by 2^31.
 *   3. L2-normalise so the vector lies on the unit hypersphere — cosine
 *      similarity becomes a plain dot product.
 *
 * The result is deterministic, dimension-stable, and free of NaN/Inf
 * for any non-empty input. Empty input produces a non-zero vector too
 * (the FNV offset basis is itself non-zero).
 */
export class MockEmbedder implements KnowledgeBaseEmbedder {
  readonly name = "mock-hash-fnv1a";

  embed(text: string): Promise<ReadonlyArray<number>> {
    const bytes = Buffer.from(text, "utf8");
    const raw = new Float64Array(EMBED_DIM);
    for (let dim = 0; dim < EMBED_DIM; dim++) {
      // Seed with dimension index so the same input maps to a
      // dimension-stable but decorrelated vector across components.
      // We mix the seed into the offset basis to avoid the constant
      // tail bits that bare FNV would otherwise leak across dimensions.
      let hash = (FNV_OFFSET_BASIS ^ ((dim + 1) * 0x9e3779b1)) >>> 0;
      for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i] ?? 0;
        // FNV-1a multiply, kept in uint32 space.
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
      }
      // Map uint32 → signed → [-1, 1]. (hash | 0) sign-extends to int32.
      raw[dim] = (hash | 0) / 0x80000000;
    }
    return Promise.resolve(normalise(raw));
  }
}

/**
 * Embedder factory — mirrors `getProvider()` in `lib/provider/index.ts`.
 *
 * Today: always returns the mock. The production swap reads an env var
 * (`PROVIDER_EMBED`) and dispatches to Voyage AI (Anthropic pipelines)
 * or OpenAI text-embedding-3-small. This is a config change, not a
 * refactor — every call site already goes through this factory.
 */
export function getEmbedder(): KnowledgeBaseEmbedder {
  return new MockEmbedder();
}

/**
 * L2-normalise in place, returning a fresh number[] so callers can hold
 * it as `ReadonlyArray<number>`. A zero-magnitude input (vanishingly
 * unlikely with FNV but guarded for type safety) returns a uniform
 * vector with the same orientation across calls.
 */
function normalise(raw: Float64Array): number[] {
  let sumSq = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i] ?? 0;
    sumSq += v * v;
  }
  const mag = Math.sqrt(sumSq);
  const out = new Array<number>(raw.length);
  if (mag === 0) {
    // Pathological — handed back a unit vector along the first axis.
    out[0] = 1;
    for (let i = 1; i < raw.length; i++) {
      out[i] = 0;
    }
    return out;
  }
  for (let i = 0; i < raw.length; i++) {
    out[i] = (raw[i] ?? 0) / mag;
  }
  return out;
}
