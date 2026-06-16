/**
 * Retrieval step (P4-2).
 *
 * Embed the latest user message, search the in-memory KB for the
 * top-K cosine-similar chunks, drop anything below the configured
 * similarity floor, return chunks + citation metadata. The assistant
 * turn (`./turn.ts`) consumes the result and folds the chunks into
 * the system prompt as the ONLY allowed knowledge source (FR-30,
 * FR-31; observability.md: groundedness).
 *
 * Knobs come from `config/assistant.json` (FR-25 spirit applied to
 * the assistant) — `topK` and `minSimilarity` are tunable without a
 * code change. Explicit args on the call site override the config,
 * which is what the tests need.
 *
 * Production swap: the store layer goes from in-memory to pgvector;
 * the retrieve helper's signature does not change. The embedder seam
 * already swaps to Voyage / OpenAI / olmOCR through `getEmbedder()`
 * (P4-1).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getEmbedder } from "@/lib/kb/embed";
import { searchByEmbedding } from "@/lib/kb/search";
import { getStore } from "@/lib/kb/store";
import type { Citation } from "@/types/assistant";
import type { KnowledgeBaseChunk } from "@/types/kb";

/**
 * What the orchestrator consumes. `chunks` go into the prompt body;
 * `citations` go onto the response footer chips. Kept separate so
 * the prompt builder doesn't have to re-derive citation metadata
 * from the chunk shape.
 */
export type RetrieveResult = {
  chunks: ReadonlyArray<KnowledgeBaseChunk>;
  citations: Citation[];
};

type AssistantConfig = {
  topK: number;
  minSimilarity: number;
  systemPromptVersion: number;
};

/**
 * Read `config/assistant.json` on every call. Reading on every call
 * is cheap (small JSON, OS page cache) and keeps the prototype admin
 * loop simple — edit JSON, hit reload, see new K take effect. A
 * future hot-path optimisation would memoise behind a config-version
 * watch, but this is not the hot path.
 */
function loadConfig(): AssistantConfig {
  const path = resolve(process.cwd(), "config/assistant.json");
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as AssistantConfig;
}

/**
 * Embed the query, search the KB, filter on similarity, project to
 * citations.
 *
 * - `query` is the latest user message. The orchestrator strips
 *   conversation history because the embedder works best on the
 *   single concrete question.
 * - `topK` / `minSimilarity` default to the values in
 *   `config/assistant.json`; explicit args override.
 *
 * An empty `query` still goes through the embedder (the mock
 * embedder is defined on empty input) — the similarity floor then
 * filters everything out and the orchestrator surfaces the "I don't
 * know" branch.
 */
export async function retrieveContext(
  query: string,
  topK?: number,
  minSimilarity?: number,
): Promise<RetrieveResult> {
  const config = loadConfig();
  const k = topK ?? config.topK;
  const floor = minSimilarity ?? config.minSimilarity;

  const embedder = getEmbedder();
  const queryEmbedding = await embedder.embed(query);

  const results = searchByEmbedding(getStore(), queryEmbedding, k);
  const surviving = results.filter((r) => r.score >= floor);

  const chunks = surviving.map((r) => r.chunk);
  const citations: Citation[] = surviving.map((r) => ({
    sourceFilename: r.chunk.sourceFilename,
    topic: r.chunk.topic,
    version: r.chunk.version,
    title: r.chunk.title,
  }));

  return { chunks, citations };
}
