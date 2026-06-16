/**
 * Chunker unit tests.
 *
 * The chunker is paragraph-aware with single-paragraph overlap and
 * targets ~500 words per chunk. The tests pin three invariants the
 * downstream ingest + search paths depend on:
 *
 *   1. Empty input never yields an empty result — we always get at
 *      least one chunk back so the orchestrator's "no chunks produced"
 *      branch is reached on legitimate parse failures, not on edge
 *      cases the chunker itself should handle.
 *   2. Small inputs collapse into a single chunk (no spurious splits).
 *   3. Large inputs split into multiple chunks AND the overlap rule is
 *      honoured — the last paragraph of chunk N-1 reappears at the
 *      start of chunk N.
 */

import { describe, expect, it } from "vitest";

import { chunkText } from "@/lib/kb/chunk";

function paragraph(n: number, wordsPerSentence: number = 25): string {
  const words = Array.from(
    { length: wordsPerSentence },
    (_, i) => `word${n}-${i}`,
  ).join(" ");
  return `${words}.`;
}

describe("chunkText", () => {
  it("returns at least one chunk for empty input", () => {
    const result = chunkText({ text: "", topic: "empty" });
    expect(result).toHaveLength(1);
    expect(result[0]?.topic).toBe("empty");
  });

  it("returns a single chunk for a small input (~200 words)", () => {
    // 8 paragraphs × 25 words = 200 words, well under the 500-word
    // chunk target.
    const paras = Array.from({ length: 8 }, (_, i) => paragraph(i)).join("\n\n");
    const result = chunkText({ text: paras, topic: "small" });
    expect(result).toHaveLength(1);
    expect(result[0]?.body).toContain("word0-0");
    expect(result[0]?.body).toContain("word7-0");
  });

  it("derives the title from the first line of the chunk", () => {
    const text =
      "# Handling Warnings\n\nFirst paragraph body that is sufficiently long.\n\nSecond paragraph.";
    const result = chunkText({ text, topic: "warnings" });
    expect(result[0]?.title.startsWith("# Handling Warnings")).toBe(true);
    expect(result[0]?.title.length).toBeLessThanOrEqual(100);
  });

  it("splits a large input (~1500 words) with paragraph overlap", () => {
    // 60 paragraphs × 25 words = 1500 words. Target chunk = 500 words,
    // so we expect 3-ish chunks with the last paragraph of chunk N-1
    // re-appearing as the first paragraph of chunk N.
    const paragraphs = Array.from({ length: 60 }, (_, i) => paragraph(i));
    const text = paragraphs.join("\n\n");
    const result = chunkText({ text, topic: "large" });

    expect(result.length).toBeGreaterThanOrEqual(2);

    // Overlap invariant — pick the first split and verify the boundary
    // paragraph appears in both adjacent chunks.
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (!prev || !curr) continue;
      const prevParas = prev.body.split(/\r?\n\s*\r?\n+/);
      const lastOfPrev = prevParas[prevParas.length - 1];
      expect(lastOfPrev).toBeDefined();
      if (!lastOfPrev) continue;
      // Currently this paragraph should be the first paragraph of the
      // next chunk (single-paragraph overlap).
      expect(curr.body.startsWith(lastOfPrev)).toBe(true);
    }
  });

  it("carries the topic through every chunk", () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => paragraph(i));
    const text = paragraphs.join("\n\n");
    const result = chunkText({ text, topic: "guidance" });
    for (const chunk of result) {
      expect(chunk.topic).toBe("guidance");
    }
  });
});
