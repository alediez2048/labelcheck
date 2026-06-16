/**
 * Ingestion orchestrator tests.
 *
 * `ingestUpload` returns immediately and dispatches the parse / chunk /
 * embed / upsert through `setImmediate`. To observe the terminal state
 * we await a small helper that polls the store until the source row
 * leaves the `queued` / `indexing` states.
 *
 * Isolation: tests point `KB_DATA_DIR` at a per-suite tmpdir BEFORE
 * importing the store, so the real `.data/kb/` is never touched. The
 * in-memory module state is reset between cases via the test-only
 * `__resetStoreForTests` export.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "kb-ingest-"));
process.env.KB_DATA_DIR = TMP_DIR;

// vi.mock is hoisted, so it runs before the ingest module is imported.
// We capture the real parser and let individual tests override it via
// the exported mock fn. The "no extractable text" PDF case overrides;
// the happy path delegates to the real implementation.
const realParseModule = await vi.importActual<typeof import("@/lib/kb/parse")>(
  "@/lib/kb/parse",
);
const parseDocumentMock = vi.fn(realParseModule.parseDocument);
vi.mock("@/lib/kb/parse", () => ({
  parseDocument: (...args: Parameters<typeof realParseModule.parseDocument>) =>
    parseDocumentMock(...args),
}));

// Imports MUST come after KB_DATA_DIR is set so the store's lazy
// directory resolution sees the test path.
const ingestModule = await import("@/lib/kb/ingest");
const storeModule = await import("@/lib/kb/store");

const { ingestUpload } = ingestModule;
const { getStore, __resetStoreForTests } = storeModule;

/**
 * Poll the store until the source for `filename` leaves the in-flight
 * states (queued / indexing) or the timeout trips. The orchestrator
 * uses `setImmediate`, so a handful of microtask flushes is plenty in
 * practice; we still cap the wait so a hang fails loudly.
 */
async function waitForTerminalStatus(
  filename: string,
  timeoutMs: number = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = getStore().getSource(filename);
    if (row && row.status !== "queued" && row.status !== "indexing") {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`ingestion for ${filename} did not terminate within ${timeoutMs}ms`);
}

beforeAll(() => {
  // First touch hydrates the store from the (empty) tmpdir.
  __resetStoreForTests();
});

afterEach(() => {
  // Reset module state so each test starts with a clean in-memory map.
  // The tmpdir on disk persists across cases — we use unique filenames
  // per test to avoid cross-contamination.
  __resetStoreForTests();
  // Restore the parser to its real implementation between cases.
  parseDocumentMock.mockReset();
  parseDocumentMock.mockImplementation(realParseModule.parseDocument);
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("ingestUpload", () => {
  it("transitions a markdown upload queued → indexing → ready", async () => {
    const filename = `md-happy-${Date.now()}.md`;
    const md =
      "# Guidance\n\nFirst paragraph that has enough words to look like actual content.\n\nSecond paragraph with additional reference material for the assistant.";

    const kickoff = ingestUpload({
      filename,
      bytes: Buffer.from(md, "utf8"),
      mime: "text/markdown",
      uploadedBy: "admin-1",
    });

    expect(kickoff.sourceFilename).toBe(filename);
    expect(kickoff.version).toBe(1);

    // Status at kickoff: queued.
    const initial = getStore().getSource(filename);
    expect(initial?.status).toBe("queued");

    await waitForTerminalStatus(filename);

    const final = getStore().getSource(filename);
    expect(final?.status).toBe("ready");
    expect(final?.chunkCount ?? 0).toBeGreaterThan(0);
    expect(final?.topic).toBe("Guidance");
    expect(final?.errorReason).toBeUndefined();

    const chunks = getStore().listChunks(filename, 1);
    expect(chunks.length).toBe(final?.chunkCount);
    for (const chunk of chunks) {
      expect(chunk.embedding.length).toBeGreaterThan(0);
      expect(chunk.version).toBe(1);
      expect(chunk.effectiveTo).toBeUndefined();
    }
  });

  it("bumps version to 2 and supersedes the prior version on re-upload", async () => {
    const filename = `md-versioned-${Date.now()}.md`;
    const bytesV1 = Buffer.from("# V1\n\nOriginal guidance text body.", "utf8");

    const k1 = ingestUpload({
      filename,
      bytes: bytesV1,
      mime: "text/markdown",
      uploadedBy: "admin-1",
    });
    expect(k1.version).toBe(1);
    await waitForTerminalStatus(filename);
    const afterV1 = getStore().getSource(filename);
    expect(afterV1?.status).toBe("ready");
    expect(afterV1?.version).toBe(1);

    const bytesV2 = Buffer.from("# V2\n\nRevised guidance text body.", "utf8");
    const k2 = ingestUpload({
      filename,
      bytes: bytesV2,
      mime: "text/markdown",
      uploadedBy: "admin-1",
    });
    expect(k2.version).toBe(2);
    await waitForTerminalStatus(filename);

    const afterV2 = getStore().getSource(filename);
    expect(afterV2?.version).toBe(2);
    expect(afterV2?.status).toBe("ready");

    // V1's chunks should now carry effectiveTo. The store keeps them
    // for audit (we do not delete superseded data).
    const v1Chunks = getStore().listChunks(filename, 1);
    expect(v1Chunks.length).toBeGreaterThan(0);
    for (const chunk of v1Chunks) {
      expect(chunk.effectiveTo).toBeTypeOf("string");
    }

    // V2 chunks are CURRENT.
    const v2Chunks = getStore().listChunks(filename, 2);
    expect(v2Chunks.length).toBeGreaterThan(0);
    for (const chunk of v2Chunks) {
      expect(chunk.effectiveTo).toBeUndefined();
    }

    // listCurrentChunks should only include the V2 chunks for this file.
    const current = getStore().listCurrentChunks().filter(
      (c) => c.sourceFilename === filename,
    );
    expect(current.length).toBe(v2Chunks.length);
  });

  it("ends in failed status with a readable error on an unparseable PDF", async () => {
    const filename = `bad-pdf-${Date.now()}.pdf`;

    // Override the parser for this case to throw the canonical "no
    // extractable text" error — exactly what `parse.ts` raises for
    // image-only PDFs. Mocking the module function avoids depending on
    // a real corrupt-PDF fixture and keeps the test fast.
    parseDocumentMock.mockRejectedValue(
      new Error("no extractable text — re-upload as DOCX or MD"),
    );

    ingestUpload({
      filename,
      bytes: Buffer.from("not a real pdf"),
      mime: "application/pdf",
      uploadedBy: "admin-1",
    });

    await waitForTerminalStatus(filename);

    const final = getStore().getSource(filename);
    expect(final?.status).toBe("failed");
    expect(final?.errorReason).toBe(
      "no extractable text — re-upload as DOCX or MD",
    );
    expect(final?.chunkCount).toBe(0);
  });
});
