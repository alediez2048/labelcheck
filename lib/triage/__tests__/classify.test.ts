/**
 * Triage classifier tests — exercises every branch of the priority
 * order and covers AC-1 through AC-6 at the unit level.
 *
 * The classifier consumes `FieldResult[]` (already produced by P1-3 +
 * P1-4); tests construct fixtures directly rather than running through
 * the matching engine. That's deliberate — the priority logic is the
 * test surface, and decoupling from the matchers means a future
 * matching-rule change can't silently regress triage.
 */

import { describe, expect, it } from "vitest";

import type { FieldResult } from "@/types";

import { classify } from "../classify";

const THRESHOLD = 0.7;

function field(
  overrides: Partial<FieldResult> & Pick<FieldResult, "field">,
): FieldResult {
  return {
    formValue: "",
    extractedValue: null,
    verdict: "match",
    confidence: 1,
    reason: "",
    sourceFace: "front",
    ...overrides,
  };
}

describe("classify — match lane (AC-1)", () => {
  it("AC-1: every field a confident match → match lane", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0, reason: "Brand match" }),
        field({ field: "alcohol_content", verdict: "match", confidence: 1.0, reason: "ABV match" }),
        field({ field: "government_warning", verdict: "match", confidence: 1.0, reason: "Warning match" }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("match");
    expect(result.reasons).toEqual([]);
    expect(result.overallConfidence).toBe(1);
  });

  it("overall confidence = minimum across all fields", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
        field({ field: "class_type", verdict: "match", confidence: 0.85 }),
        field({ field: "government_warning", verdict: "match", confidence: 0.95 }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("match");
    expect(result.overallConfidence).toBe(0.85);
  });
});

describe("classify — mismatch lane (AC-2, AC-3, AC-4)", () => {
  it("AC-2: confident ABV mismatch → mismatch lane, with the reason surfaced", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
        field({
          field: "alcohol_content",
          verdict: "mismatch",
          confidence: 1.0,
          reason: "Alcohol content mismatch: form 40% vs label 45%",
        }),
        field({ field: "government_warning", verdict: "match", confidence: 1.0 }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("mismatch");
    expect(result.reasons.some((r) => r.includes("Alcohol content"))).toBe(true);
  });

  it("AC-3: warning caps fail (verdict=mismatch) → mismatch lane even if everything else is clean", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
        field({ field: "alcohol_content", verdict: "match", confidence: 1.0 }),
        field({
          field: "government_warning",
          verdict: "mismatch",
          confidence: 1.0,
          reason: "Warning heading must read 'GOVERNMENT WARNING:' in ALL CAPS",
        }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("mismatch");
    expect(result.reasons.some((r) => r.toLowerCase().includes("warning"))).toBe(true);
  });

  it("AC-4: warning missing (verdict=mismatch reason='not present') → mismatch lane", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
        field({
          field: "government_warning",
          verdict: "mismatch",
          confidence: 1.0,
          reason: "Government warning not present on any label face",
        }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("mismatch");
    expect(result.reasons.some((r) => r.toLowerCase().includes("warning"))).toBe(true);
  });

  it("warning failure always surfaces — even at low confidence", () => {
    const result = classify({
      fieldResults: [
        field({
          field: "government_warning",
          verdict: "mismatch",
          confidence: 0.4, // below threshold
          reason: "Warning differs from canonical wording",
        }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("mismatch");
  });
});

describe("classify — review lane (AC-6, near-miss, bold-uncertain)", () => {
  it("AC-6: unreadable face → review with 'needs a better image'", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
      ],
      context: { unreadableFaces: ["front"] },
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("review");
    expect(result.reasons.some((r) => r.toLowerCase().includes("needs a better image"))).toBe(true);
  });

  it("near-miss (match below threshold) → review (validates D5)", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 0.55, reason: "Brand near-miss" }),
        field({ field: "alcohol_content", verdict: "match", confidence: 1.0 }),
        field({ field: "government_warning", verdict: "match", confidence: 1.0 }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("review");
    expect(result.reasons.some((r) => r.includes("Brand near-miss"))).toBe(true);
  });

  it("bold-uncertain warning (low_confidence) → review", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
        field({
          field: "government_warning",
          verdict: "low_confidence",
          confidence: 0.4,
          reason: "Warning bold styling uncertain — route to human review",
        }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("review");
  });

  it("not_found field → review", () => {
    const result = classify({
      fieldResults: [
        field({ field: "brand_name", verdict: "match", confidence: 1.0 }),
        field({
          field: "producer_address",
          verdict: "not_found",
          confidence: 0.5,
          reason: "Producer address not found on any label face",
        }),
        field({ field: "government_warning", verdict: "match", confidence: 1.0 }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("review");
  });

  it("near-miss mismatch (mismatch below threshold) → review, NOT mismatch", () => {
    const result = classify({
      fieldResults: [
        field({
          field: "class_type",
          verdict: "mismatch",
          confidence: 0.55, // below threshold
          reason: "Class/type near-miss mismatch",
        }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("review");
  });
});

describe("classify — priority order edge cases", () => {
  it("confident mismatch beats unreadable-face review (mismatch surfaces first)", () => {
    const result = classify({
      fieldResults: [
        field({
          field: "alcohol_content",
          verdict: "mismatch",
          confidence: 1.0,
          reason: "ABV mismatch",
        }),
      ],
      context: { unreadableFaces: ["back"] },
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("mismatch");
  });

  it("warning failure beats other mismatches in reason ordering", () => {
    const result = classify({
      fieldResults: [
        field({
          field: "alcohol_content",
          verdict: "mismatch",
          confidence: 1.0,
          reason: "ABV mismatch",
        }),
        field({
          field: "government_warning",
          verdict: "mismatch",
          confidence: 1.0,
          reason: "Warning missing",
        }),
      ],
      confidentThreshold: THRESHOLD,
    });
    expect(result.lane).toBe("mismatch");
    expect(result.reasons[0]).toContain("Warning");
  });
});
