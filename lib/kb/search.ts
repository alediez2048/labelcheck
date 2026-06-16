/**
 * Cosine-similarity search over the in-memory store.
 *
 * P4-2's retrieval consumes this. Production swap is a one-liner: in
 * pgvector this is `ORDER BY embedding <=> $1 LIMIT k` against the
 * `knowledge_base` table; the query shape and result ordering match.
 *
 * Both the query and the stored chunk embeddings are unit vectors (the
 * embedder normalises before returning), so cosine similarity reduces
 * to a plain dot product. We clamp the score into [0, 1] — exact 1.0
 * is structurally possible (same text → same vector under the mock
 * embedder) and tests rely on that signal.
 */

import type {
  KnowledgeBaseChunk,
  KnowledgeBaseStore,
} from "@/types/kb";

export type SearchResult = {
  chunk: KnowledgeBaseChunk;
  score: number; // cosine similarity, 0..1
};

/**
 * Brute-force scan over `listCurrentChunks()`. Returns the top `limit`
 * chunks ordered by descending score. A `limit` of zero returns an
 * empty array; a `limit` larger than the corpus returns the whole
 * corpus.
 *
 * Mismatched embedding dimensions (e.g. a stale chunk from a previous
 * embedder version) are skipped rather than thrown — the store is
 * append-only across embedder swaps, so partial corpora are a real
 * runtime case.
 */
export function searchByEmbedding(
  store: KnowledgeBaseStore,
  queryEmbedding: ReadonlyArray<number>,
  limit: number,
): SearchResult[] {
  if (limit <= 0) {
    return [];
  }
  const chunks = store.listCurrentChunks();
  const scored: SearchResult[] = [];
  for (const chunk of chunks) {
    if (chunk.embedding.length !== queryEmbedding.length) {
      continue;
    }
    const score = clamp(dot(queryEmbedding, chunk.embedding));
    scored.push({ chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function dot(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    acc += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return acc;
}

function clamp(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
