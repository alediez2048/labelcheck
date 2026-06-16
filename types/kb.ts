/**
 * Knowledge base domain types — the corpus the read-only assistant (P4-2)
 * is allowed to ground in.
 *
 * Mirrors the `knowledge_base` table in docs/02-design/schema.md so the
 * production swap (in-memory + file-backed → pgvector) is a persistence
 * change, not a refactor. The KB is distinct from the Configuration store
 * (CONTEXT.md "Knowledge base vs Configuration store"): KB holds
 * admin-uploaded help articles, onboarding notes, and best-practice
 * guidance; the verbatim 27 CFR § 16.21 warning text lives in
 * `config/warning.json` (P0-4), not here.
 *
 * The shape exported here is what the upload UI (P4-1 UI half) and the
 * retrieval helper (P4-2) consume; the internal store and embedder seams
 * follow the swappable-adapter pattern (D8) used by the vision provider
 * in `lib/provider/`.
 */

/**
 * Per-document lifecycle. Mirrors `knowledge_base.status` in schema.md
 * with one addition: the schema models the three terminal-ish states
 * (`processing`, `indexed`, `failed`) but the ingestion orchestrator
 * needs a distinct "accepted but not yet picked up" state so the upload
 * route can return immediately. `queued` is that pre-`indexing` state.
 *
 * - queued    — upload accepted, background work not yet started
 * - indexing  — parse + chunk + embed in progress
 * - ready     — chunks written, source is retrievable (schema: `indexed`)
 * - failed    — parse/chunk/embed threw; see `errorReason` on the source
 */
export type IngestStatus = "queued" | "indexing" | "ready" | "failed";

/**
 * One row per uploaded document version. The UI lists these in the
 * Knowledge Base tab and polls for status while any source is mid-flight.
 *
 * `version` + `effectiveFrom`/`effectiveTo` mirror the rule_config
 * versioning pattern (schema.md): re-uploading a filename bumps version,
 * stamps the prior version's `effectiveTo`, and writes fresh chunks at
 * the new version. Nothing is deleted, so traces in observability can
 * tie back to the indexed version at the time of retrieval.
 */
export type KnowledgeBaseSource = {
  sourceFilename: string;
  topic: string;
  uploadedBy: string;
  uploadedAt: string;
  status: IngestStatus;
  errorReason?: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  chunkCount: number;
};

/**
 * One row per chunk. The body is what the assistant cites from; the
 * embedding is a unit vector used for cosine similarity in the prototype
 * and for `embedding <=> $1` in the pgvector production path.
 *
 * `embedding` is `ReadonlyArray<number>` so consumers can't mutate the
 * cached vector and break the file-backed store's invariants.
 */
export type KnowledgeBaseChunk = {
  id: string;
  topic: string;
  title: string;
  body: string;
  sourceFilename: string;
  uploadedBy: string;
  uploadedAt: string;
  status: IngestStatus;
  embedding: ReadonlyArray<number>; // unit vector
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
};

/**
 * Embedder seam (D8 — swappable adapter, mirrors `VisionProvider`).
 *
 * Production swap: the Anthropic SDK has no public embeddings API as of
 * 2026-06; the Anthropic-recommended production embedder is Voyage AI
 * (`voyage-3` / `voyage-3-large`). For an OpenAI-backed pipeline,
 * `text-embedding-3-small` (1536-dim) is the drop-in. The mock
 * implementation in `lib/kb/embed.ts` returns a deterministic 384-dim
 * hash-derived vector so tests run with no key.
 */
export type KnowledgeBaseEmbedder = {
  readonly name: string;
  embed(text: string): Promise<ReadonlyArray<number>>;
};

/**
 * Store seam — the only point at which persistence is concrete. The
 * prototype implementation is in-memory + file-backed under `.data/kb/`;
 * production lands the same surface area on pgvector with a single
 * adapter (`searchByEmbedding` becomes `ORDER BY embedding <=> $1
 * LIMIT k`).
 *
 * `listCurrentChunks` is the slice P4-2's retrieval reads: only chunks
 * whose source row has no `effectiveTo` (i.e. is not superseded).
 */
export type KnowledgeBaseStore = {
  upsertSource(source: KnowledgeBaseSource): void;
  upsertChunks(chunks: ReadonlyArray<KnowledgeBaseChunk>): void;
  listSources(): KnowledgeBaseSource[];
  getSource(filename: string): KnowledgeBaseSource | null;
  listChunks(filename: string, version?: number): KnowledgeBaseChunk[];
  /** Returns all CURRENT (effectiveTo undefined) chunks across all sources. Used by P4-2's retrieval. */
  listCurrentChunks(): KnowledgeBaseChunk[];
  /** Mark a source's prior version superseded. Sets effectiveTo on the source row and all its chunks. */
  supersedeSource(filename: string, version: number, supersededAt: string): void;
};
