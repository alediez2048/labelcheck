/**
 * P5-3 — override detector (`lib/feedback/override.ts`).
 *
 * Covers the three buckets (agreement / flag / clear) plus the edge
 * case where both lanes are non-match but differ (mismatch → review
 * still counts as a flag).
 */

import { describe, expect, it } from "vitest";

import { detectOverride } from "@/lib/feedback/override";

describe("detectOverride (P5-3)", () => {
  it("predicted match + effective match → agreement", () => {
    expect(detectOverride("match", "match")).toBe("agreement");
  });

  it("predicted match + effective mismatch → flag", () => {
    expect(detectOverride("match", "mismatch")).toBe("flag");
  });

  it("predicted mismatch + effective match → clear", () => {
    expect(detectOverride("mismatch", "match")).toBe("clear");
  });

  it("predicted review + effective mismatch → flag", () => {
    expect(detectOverride("review", "mismatch")).toBe("flag");
  });

  it("predicted review + effective match → clear", () => {
    expect(detectOverride("review", "match")).toBe("clear");
  });

  it("same non-match lane → agreement", () => {
    expect(detectOverride("review", "review")).toBe("agreement");
    expect(detectOverride("mismatch", "mismatch")).toBe("agreement");
  });
});
