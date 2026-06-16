/**
 * Ingestion orchestrator — the upload-to-indexed pipeline.
 *
 * Public contract (consumed by the upload route in `app/api/kb/upload`):
 *   - `ingestUpload(input)` returns IMMEDIATELY with the assigned
 *     filename + version. The parse / chunk / embed / upsert happens
 *     off the request path via `setImmediate`, mirroring the
 *     systemsdesign Assistant note: "an ingestion step (off the chat
 *     path)".
 *   - The UI polls `/api/kb/sources` while any source is `queued` or
 *     `indexing`, watching status transition through queued → indexing
 *     → ready (or failed with a reason).
 *
 * Versioning: re-uploading a filename bumps `version`, writes new chunks
 * at the new version, and supersedes the prior version (sets
 * `effectiveTo`). Nothing is deleted; observability traces tie to the
 * version that was indexed at the time of a retrieval.
 *
 * Production swap (D8 seams):
 *   - The store seam (`getStore()`) moves from in-memory + file-backed
 *     to pgvector; the orchestrator doesn't change.
 *   - The embedder seam (`getEmbedder()`) moves from the mock hash to
 *     Voyage AI (Anthropic) or OpenAI text-embedding-3-small; the
 *     orchestrator doesn't change.
 *   - The `setImmediate` background dispatch becomes a real job queue
 *     (BullMQ / Inngest / similar); the public function signature
 *     doesn't change.
 */

import { randomUUID } from "node:crypto";

import type {
  IngestStatus,
  KnowledgeBaseChunk,
  KnowledgeBaseEmbedder,
  KnowledgeBaseSource,
  KnowledgeBaseStore,
} from "@/types/kb";

import { chunkText } from "./chunk";
import { getEmbedder } from "./embed";
import { parseDocument } from "./parse";
import { getStore } from "./store";

export type IngestInput = {
  filename: string;
  bytes: Buffer;
  mime: string;
  uploadedBy: string;
};

export type IngestKickoff = {
  sourceFilename: string;
  version: number;
};

/**
 * Kick off ingestion. Returns immediately with the source filename and
 * the version that will be assigned. The actual parse + embed happens
 * off the request path.
 *
 * Side effects before return:
 *   - One `KnowledgeBaseSource` row upserted at status `queued`.
 *   - If a prior CURRENT version exists for this filename, it stays
 *     CURRENT until the background work succeeds — we don't want a
 *     half-flipped state where the new version is `queued` and the
 *     prior version is already superseded. Supersession happens at the
 *     ready transition.
 */
export function ingestUpload(input: IngestInput): IngestKickoff {
  const store = getStore();
  const embedder = getEmbedder();
  const now = new Date().toISOString();

  const prior = store.getSource(input.filename);
  const version = (prior?.version ?? 0) + 1;

  const queuedSource: KnowledgeBaseSource = {
    sourceFilename: input.filename,
    topic: input.filename, // refined to the doc's real topic at indexing
    uploadedBy: input.uploadedBy,
    uploadedAt: now,
    status: "queued",
    version,
    effectiveFrom: now,
    chunkCount: 0,
  };
  store.upsertSource(queuedSource);

  // Off the request path — setImmediate yields back to the event loop
  // so the route handler returns its 200 before the heavy lifting
  // starts. The promise is intentionally unawaited; failures are
  // captured into the `failed` status, not propagated.
  setImmediate(() => {
    void runIngestion(store, embedder, input, queuedSource, prior);
  });

  return { sourceFilename: input.filename, version };
}

/**
 * Background pipeline. Each step updates the source row's `status` so
 * the UI poll observes the transition. On any throw, the source ends
 * at `failed` with an `errorReason`.
 */
async function runIngestion(
  store: KnowledgeBaseStore,
  embedder: KnowledgeBaseEmbedder,
  input: IngestInput,
  queuedSource: KnowledgeBaseSource,
  prior: KnowledgeBaseSource | null,
): Promise<void> {
  const markStatus = (
    status: IngestStatus,
    patch: Partial<KnowledgeBaseSource> = {},
  ): KnowledgeBaseSource => {
    const next: KnowledgeBaseSource = {
      ...queuedSource,
      ...patch,
      status,
    };
    Object.assign(queuedSource, next);
    store.upsertSource(next);
    return next;
  };

  markStatus("indexing");

  let parsed: { text: string; topic: string };
  try {
    parsed = await parseDocument(input.bytes, input.mime, input.filename);
  } catch (err) {
    markStatus("failed", { errorReason: messageOf(err) });
    return;
  }

  const chunkOutputs = chunkText({ text: parsed.text, topic: parsed.topic });
  if (chunkOutputs.length === 0) {
    // The chunker is contracted to return at least one chunk, but the
    // ingest contract is to bail with a clear reason if it ever doesn't.
    markStatus("failed", { errorReason: "no chunks produced" });
    return;
  }

  // Embed every chunk. Any embedder throw fails the whole upload —
  // partial corpora would silently shrink the assistant's grounding.
  const now = new Date().toISOString();
  const chunks: KnowledgeBaseChunk[] = [];
  try {
    for (const chunk of chunkOutputs) {
      const embedding = await embedder.embed(chunk.body);
      chunks.push({
        id: randomUUID(),
        topic: chunk.topic,
        title: chunk.title,
        body: chunk.body,
        sourceFilename: input.filename,
        uploadedBy: input.uploadedBy,
        uploadedAt: queuedSource.uploadedAt,
        status: "ready",
        embedding,
        version: queuedSource.version,
        effectiveFrom: queuedSource.effectiveFrom,
      });
    }
  } catch (err) {
    markStatus("failed", { errorReason: messageOf(err) });
    return;
  }

  store.upsertChunks(chunks);

  // Supersede the prior version AFTER the new one is fully indexed so
  // there is never a window where retrieval has zero current chunks
  // for this filename.
  if (prior && prior.effectiveTo === undefined) {
    store.supersedeSource(input.filename, prior.version, now);
  }

  markStatus("ready", { topic: parsed.topic, chunkCount: chunks.length });
}

function messageOf(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
