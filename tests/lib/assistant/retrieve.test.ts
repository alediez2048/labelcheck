/**
 * Retrieval helper tests (P4-2).
 *
 * The mock embedder (`MockEmbedder`) is hash-based; it guarantees
 * "same text → same vector" but NOT "semantically similar texts →
 * close vectors". We therefore drive the "returns at least one
 * chunk" case with a query that EXACTLY matches a chunk's body
 * (structural similarity = 1) and the "below the floor" case with
 * an off-topic random query (cosine sim ≈ 0 against any unrelated
 * chunk in 384-dim space).
 *
 * Isolation: tests point `KB_DATA_DIR` at a per-suite tmpdir BEFORE
 * importing the store, so the real `.data/kb/` is never touched.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "assistant-retrieve-"));
process.env.KB_DATA_DIR = TMP_DIR;

const ingestModule = await import("@/lib/kb/ingest");
const storeModule = await import("@/lib/kb/store");
const retrieveModule = await import("@/lib/assistant/retrieve");

const { ingestUpload } = ingestModule;
const { getStore, __resetStoreForTests } = storeModule;
const { retrieveContext } = retrieveModule;

const GUIDANCE_PATH = resolve(
  process.cwd(),
  "fixtures/kb/sample-warning-guidance.md",
);

/**
 * Poll the store until the ingestion pipeline reaches a terminal
 * status. `ingestUpload` returns immediately and runs through
 * setImmediate; tests need to wait for the chunks to land.
 */
async function waitForReady(filename: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const row = getStore().getSource(filename);
    if (row && row.status === "ready") {
      return;
    }
    if (row && row.status === "failed") {
      throw new Error(`ingest failed: ${row.errorReason ?? "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`ingestion for ${filename} did not finish in time`);
}

beforeAll(async () => {
  __resetStoreForTests();
  const bytes = readFileSync(GUIDANCE_PATH);
  ingestUpload({
    filename: "sample-warning-guidance.md",
    bytes,
    mime: "text/markdown",
    uploadedBy: "admin-test",
  });
  await waitForReady("sample-warning-guidance.md");
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("retrieveContext", () => {
  it("returns at least one chunk when the query matches stored content", async () => {
    // Use the first current chunk's body as the query — the mock
    // embedder makes this a perfect cosine = 1 hit, so we're testing
    // the wiring (embed → search → filter → cite), not semantic
    // similarity (which the mock embedder doesn't model).
    const chunks = getStore().listCurrentChunks();
    expect(chunks.length).toBeGreaterThan(0);
    const queryText = chunks[0]?.body ?? "";

    const result = await retrieveContext(queryText);

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.citations.length).toBe(result.chunks.length);
    expect(result.citations[0]?.sourceFilename).toBe(
      "sample-warning-guidance.md",
    );
    expect(result.citations[0]?.version).toBe(1);
  });

  it("returns an empty result for an off-topic query below the similarity floor", async () => {
    // Random-orientation vector vs the stored chunk vectors: cosine
    // similarity in 384-dim space is centered on zero. With the
    // default floor of 0.55 in `config/assistant.json`, nothing
    // should survive the filter.
    const result = await retrieveContext("soccer scores last night");

    expect(result.chunks.length).toBe(0);
    expect(result.citations.length).toBe(0);
  });

  it("honours an explicit topK override", async () => {
    const chunks = getStore().listCurrentChunks();
    const queryText = chunks[0]?.body ?? "";
    // Force topK to 1 — even on a perfect self-similarity hit, we
    // should never see more than one result.
    const result = await retrieveContext(queryText, 1);
    expect(result.chunks.length).toBeLessThanOrEqual(1);
  });
});
