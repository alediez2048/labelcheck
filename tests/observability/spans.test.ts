/**
 * Tests for `lib/observability/spans.ts`.
 *
 * The `InMemorySpanExporter` from `@opentelemetry/sdk-trace-base` lets
 * us capture spans inside a test without touching stdout. We install
 * the in-memory exporter as the active provider via the test-only
 * hook on `tracing.ts`, run the span helpers, then assert against the
 * captured spans.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import {
  __setProvidersForTests,
  shutdown,
} from "@/lib/observability/tracing";
import {
  withAssistantSpan,
  withVerificationSpan,
} from "@/lib/observability/spans";

let exporter: InMemorySpanExporter;

beforeEach(async () => {
  await shutdown();
  exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  __setProvidersForTests({ tracerProvider: provider });
  vi.stubEnv("PII_HASH_SALT", "test-spans-salt");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await shutdown();
  exporter.reset();
});

describe("withVerificationSpan", () => {
  it("produces one span named `verification` with the system applicationId verbatim", async () => {
    await withVerificationSpan("app-123", async (ctx) => {
      ctx.setAttributes({ "verification.lane": "match" });
    });
    const spans = exporter.getFinishedSpans();
    const verif = spans.find((s) => s.name === "verification");
    expect(verif).toBeDefined();
    expect(verif?.attributes["verification.id"]).toBe("app-123");
    expect(verif?.attributes["verification.lane"]).toBe("match");
  });

  it("hashes non-safe string attributes via hashPii", async () => {
    await withVerificationSpan("app-456", async (ctx) => {
      ctx.setAttributes({ "applicant.name": "Marcus Lee" } as Record<
        string,
        string
      >);
    });
    const spans = exporter.getFinishedSpans();
    const verif = spans.find((s) => s.name === "verification");
    const stored = verif?.attributes["applicant.name"];
    expect(typeof stored).toBe("string");
    expect((stored as string).startsWith("sha256:")).toBe(true);
    expect((stored as string).includes("Marcus")).toBe(false);
  });

  it("addFieldEvent emits a span event with verdict and confidence", async () => {
    await withVerificationSpan("app-789", async (ctx) => {
      ctx.addFieldEvent("brand_name", "match", 0.95, "front");
    });
    const verif = exporter.getFinishedSpans().find((s) => s.name === "verification");
    const event = verif?.events.find(
      (e) => e.name === "verification.field.brand_name",
    );
    expect(event).toBeDefined();
    expect(event?.attributes?.["verification.field.brand_name.verdict"]).toBe(
      "match",
    );
    expect(
      event?.attributes?.["verification.field.brand_name.confidence"],
    ).toBe(0.95);
    expect(
      event?.attributes?.["verification.field.brand_name.source_face"],
    ).toBe("front");
  });

  it("records errors on the span and sets status ERROR", async () => {
    await expect(
      withVerificationSpan("app-fail", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const verif = exporter
      .getFinishedSpans()
      .find((s) => s.name === "verification");
    expect(verif?.status.code).toBe(2); // ERROR
    expect(verif?.events.length).toBeGreaterThan(0);
  });

  it("never blocks the resolved value of the wrapped function", async () => {
    const result = await withVerificationSpan("app-ok", async () => 42);
    expect(result).toBe(42);
  });
});

describe("withAssistantSpan", () => {
  it("hashes the user question by default", async () => {
    await withAssistantSpan("agent", "How am I doing this month?", async () => {
      /* no-op */
    });
    const turn = exporter
      .getFinishedSpans()
      .find((s) => s.name === "assistant.turn");
    expect(turn).toBeDefined();
    const qhash = turn?.attributes["assistant.question_hash"];
    expect(typeof qhash).toBe("string");
    expect((qhash as string).startsWith("sha256:")).toBe(true);
    expect((qhash as string).includes("How")).toBe(false);
  });

  it("sets role verbatim under the safe attribute key", async () => {
    await withAssistantSpan("admin", "stats", async () => {
      /* no-op */
    });
    const turn = exporter
      .getFinishedSpans()
      .find((s) => s.name === "assistant.turn");
    expect(turn?.attributes["assistant.role"]).toBe("admin");
  });

  it("accepts array-valued attributes for retrieved_sources (allow-listed)", async () => {
    await withAssistantSpan("agent", "q", async (ctx) => {
      ctx.setAttributes({
        "assistant.retrieved_sources": ["sample-warning-guidance.md"],
      });
    });
    const turn = exporter
      .getFinishedSpans()
      .find((s) => s.name === "assistant.turn");
    expect(turn?.attributes["assistant.retrieved_sources"]).toEqual([
      "sample-warning-guidance.md",
    ]);
  });
});
