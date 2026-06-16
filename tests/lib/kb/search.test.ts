/**
 * Cosine-similarity search tests.
 *
 * Limitation documented up front: the prototype embedder is a FNV-1a
 * hash fold (`MockEmbedder`). It guarantees the structural property
 * "same text → same vector" but NOT the semantic property "similar
 * texts → similar vectors". A real embedder would.
 *
 * These tests therefore assert structural properties only:
 *   - A chunk's own body, when used as the query, ranks the chunk
 *     itself first with a similarity of 1 (it's the same vector).
 *   - `limit` is honoured and ordering is descending by score.
 *   - An empty corpus returns an empty result, not a throw.
 */

import { describe, expect, it } from "vitest";

import { MockEmbedder } from "@/lib/kb/embed";
import { searchByEmbedding } from "@/lib/kb/search";
import type {
  KnowledgeBaseChunk,
  KnowledgeBaseSource,
  KnowledgeBaseStore,
} from "@/types/kb";

const EMBEDDER = new MockEmbedder();

/**
 * In-memory store stub. We don't want these tests to touch the real
 * file-backed singleton, so we build a minimal store that only
 * implements `listCurrentChunks` (the slice `searchByEmbedding` reads).
 */
function makeStubStore(chunks: KnowledgeBaseChunk[]): KnowledgeBaseStore {
  return {
    upsertSource: () => undefined,
    upsertChunks: () => undefined,
    listSources: () => [] as KnowledgeBaseSource[],
    getSource: () => null,
    listChunks: () => [],
    listCurrentChunks: () => chunks,
    supersedeSource: () => undefined,
  };
}

async function makeChunk(
  id: string,
  body: string,
): Promise<KnowledgeBaseChunk> {
  const embedding = await EMBEDDER.embed(body);
  return {
    id,
    topic: "test",
    title: body.slice(0, 50),
    body,
    sourceFilename: "test.md",
    uploadedBy: "tester",
    uploadedAt: "2026-06-15T00:00:00.000Z",
    status: "ready",
    embedding,
    version: 1,
    effectiveFrom: "2026-06-15T00:00:00.000Z",
  };
}

describe("searchByEmbedding", () => {
  it("returns an empty array on an empty corpus", () => {
    const store = makeStubStore([]);
    const queryEmbedding = [1, 0, 0];
    expect(searchByEmbedding(store, queryEmbedding, 5)).toEqual([]);
  });

  it("ranks a chunk first when queried with its own body (structural)", async () => {
    const chunkA = await makeChunk("a", "warnings about case and bold");
    const chunkB = await makeChunk("b", "low-legibility re-read behaviour");
    const chunkC = await makeChunk("c", "configuration store separation");
    const store = makeStubStore([chunkA, chunkB, chunkC]);

    // Query is the literal body of chunk B. The mock embedder is
    // deterministic, so chunk B's stored vector equals the query
    // vector exactly. Cosine sim = 1.
    const query = await EMBEDDER.embed(chunkB.body);
    const results = searchByEmbedding(store, query, 3);

    expect(results).toHaveLength(3);
    expect(results[0]?.chunk.id).toBe("b");
    expect(results[0]?.score).toBeCloseTo(1, 6);
  });

  it("returns results in descending score order, capped at limit", async () => {
    const chunkA = await makeChunk("a", "alpha alpha alpha");
    const chunkB = await makeChunk("b", "beta beta beta");
    const chunkC = await makeChunk("c", "gamma gamma gamma");
    const store = makeStubStore([chunkA, chunkB, chunkC]);

    const query = await EMBEDDER.embed("alpha alpha alpha");
    const results = searchByEmbedding(store, query, 2);

    expect(results).toHaveLength(2);
    // Top result is chunk A (same vector as the query).
    expect(results[0]?.chunk.id).toBe("a");
    // Descending order.
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? -1);
  });

  it("returns no results when limit is zero", async () => {
    const chunkA = await makeChunk("a", "alpha");
    const store = makeStubStore([chunkA]);
    const query = await EMBEDDER.embed("alpha");
    expect(searchByEmbedding(store, query, 0)).toEqual([]);
  });
});
