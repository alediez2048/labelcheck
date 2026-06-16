/**
 * Integration tests for POST /api/assistant/turn (P4-2).
 *
 * Exercises the full route handler: body validation, server-side
 * caller resolution from `SEED_AGENTS`, orchestrator wiring
 * (retrieve → generator → maybe tool → format → trace), and the
 * shape of the wire response.
 *
 * The KB is seeded by ingesting the real `sample-warning-guidance.md`
 * fixture into a per-suite tmpdir (the same pattern the ingestion
 * test uses). The mock embedder + mock generator make the end-to-end
 * path deterministic without an API key.
 *
 * Role-scope assertion (the headline manual check from the ticket):
 * an Agent caller asking "how am I doing this month" gets DIFFERENT
 * numbers than an Admin caller asking the same question. We compare
 * the two responses directly.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "assistant-turn-"));
process.env.KB_DATA_DIR = TMP_DIR;

const ingestModule = await import("@/lib/kb/ingest");
const storeModule = await import("@/lib/kb/store");
const routeModule = await import("@/app/api/assistant/turn/route");

const { ingestUpload } = ingestModule;
const { getStore, __resetStoreForTests } = storeModule;
const { POST } = routeModule;

const GUIDANCE_PATH = resolve(
  process.cwd(),
  "fixtures/kb/sample-warning-guidance.md",
);

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

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/assistant/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("POST /api/assistant/turn", () => {
  it("calls get_my_rollup for a 'how am I doing this week' question with empty citations", async () => {
    const res = await POST(
      buildRequest({
        messages: [
          { role: "user", content: "How am I doing this week?" },
        ],
        activeAgentId: "agent-marcus",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: { role: string; content: string };
      citations: unknown[];
      usedTool?: string;
      metadata: { role: string };
    };
    expect(body.usedTool).toBe("get_my_rollup");
    expect(body.citations).toEqual([]);
    expect(body.metadata.role).toBe("agent");
    expect(body.message.role).toBe("assistant");
    expect(body.message.content.length).toBeGreaterThan(0);
  });

  it("returns a KB-cited answer for a question about warning guidance", async () => {
    // Use the first stored chunk's body so the mock embedder produces
    // a guaranteed self-similarity = 1 hit (the embedder is
    // hash-based, not semantic). The wiring under test is the
    // retrieve → prompt → generator path, not semantic similarity.
    const chunks = getStore().listCurrentChunks();
    const queryText = chunks[0]?.body ?? "";

    const res = await POST(
      buildRequest({
        messages: [{ role: "user", content: queryText }],
        activeAgentId: "agent-marcus",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      citations: Array<{ sourceFilename: string }>;
      usedTool?: string;
      metadata: { retrievedCount: number };
    };
    expect(body.usedTool).toBeUndefined();
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations[0]?.sourceFilename).toBe(
      "sample-warning-guidance.md",
    );
    expect(body.metadata.retrievedCount).toBeGreaterThan(0);
  });

  it("returns 400 for an unknown activeAgentId", async () => {
    const res = await POST(
      buildRequest({
        messages: [{ role: "user", content: "How am I doing this week?" }],
        activeAgentId: "ghost-agent",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unknown active agent");
  });

  it("returns 400 for a malformed body", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages is empty", async () => {
    const res = await POST(
      buildRequest({
        messages: [],
        activeAgentId: "agent-marcus",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the last message is from the assistant", async () => {
    const res = await POST(
      buildRequest({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
        activeAgentId: "agent-marcus",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns DIFFERENT numbers for an agent vs admin asking the same question", async () => {
    const messages = [
      { role: "user" as const, content: "How am I doing this month?" },
    ];

    const agentRes = await POST(
      buildRequest({ messages, activeAgentId: "agent-marcus" }),
    );
    const adminRes = await POST(
      buildRequest({ messages, activeAgentId: "admin-sasha" }),
    );

    expect(agentRes.status).toBe(200);
    expect(adminRes.status).toBe(200);

    const agentBody = (await agentRes.json()) as {
      message: { content: string };
      usedTool?: string;
      metadata: { role: string };
    };
    const adminBody = (await adminRes.json()) as {
      message: { content: string };
      usedTool?: string;
      metadata: { role: string };
    };

    expect(agentBody.usedTool).toBe("get_my_rollup");
    expect(adminBody.usedTool).toBe("get_my_rollup");
    expect(agentBody.metadata.role).toBe("agent");
    expect(adminBody.metadata.role).toBe("admin");
    // The headline manual check: the two answers must differ. The
    // fixtures put agent-marcus on a subset of the division's rows,
    // so the rendered sentence text differs.
    expect(agentBody.message.content).not.toBe(adminBody.message.content);
  });
});
