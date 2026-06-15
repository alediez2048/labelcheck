/**
 * `deriveConfidence` tests — D5 enforcement at the unit level.
 *
 * Headline assertions:
 *   - A near-miss fuzzy field lands BELOW the configured threshold,
 *     regardless of what the model claimed. This is the test that
 *     validates D5's "model self-reported confidence is poorly
 *     calibrated; the code derives it instead."
 *   - An exact mismatch returns HIGH confidence — triage routes it to
 *     the mismatch lane, NOT the review lane.
 *   - Low legibility drags an otherwise-passing field below the
 *     threshold.
 */

import { describe, expect, it } from "vitest";

import type { ConfidenceConfig } from "@/lib/config";

import { deriveConfidence } from "../confidence";

const TEST_CONFIG: ConfidenceConfig = {
  threshold: 0.7,
  legibilityFactors: { good: 1.0, low: 0.5 },
  notFoundConfidence: 0.5,
  lowConfidenceVerdict: 0.4,
};

describe("deriveConfidence — fuzzy fields (D5)", () => {
  it("near-miss (margin barely over 0) lands below the confident threshold", () => {
    const c = deriveConfidence({
      verdict: "match",
      margin: 0.001, // just barely cleared the 0.92 threshold
      rule: { kind: "fuzzy", minSimilarity: 0.92 },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBeLessThan(TEST_CONFIG.threshold);
  });

  it("comfortable match (margin near max) lands well above threshold", () => {
    const c = deriveConfidence({
      verdict: "match",
      margin: 0.08, // distance ≈ range; clean match
      rule: { kind: "fuzzy", minSimilarity: 0.92 },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBeGreaterThanOrEqual(0.95);
  });

  it("mismatch with large negative margin returns high confidence", () => {
    const c = deriveConfidence({
      verdict: "mismatch",
      margin: -0.6, // well below threshold; clear mismatch
      rule: { kind: "fuzzy", minSimilarity: 0.92 },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBeGreaterThanOrEqual(0.95);
  });

  it("near-miss mismatch (margin just below 0) lands below the confident threshold", () => {
    const c = deriveConfidence({
      verdict: "mismatch",
      margin: -0.005,
      rule: { kind: "fuzzy", minSimilarity: 0.92 },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBeLessThan(TEST_CONFIG.threshold);
  });
});

describe("deriveConfidence — exact / warning fields (D5)", () => {
  it("exact match returns 1.0 (binary)", () => {
    const c = deriveConfidence({
      verdict: "match",
      margin: 1,
      rule: { kind: "exact" },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBe(1);
  });

  it("exact mismatch returns 1.0 (confident in the mismatch — triage routes to mismatch lane, NOT review)", () => {
    const c = deriveConfidence({
      verdict: "mismatch",
      margin: -1,
      rule: { kind: "exact" },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBe(1);
    expect(c).toBeGreaterThan(TEST_CONFIG.threshold);
  });

  it("warning bold-uncertain (low_confidence verdict) → below threshold", () => {
    const c = deriveConfidence({
      verdict: "low_confidence",
      margin: 0,
      rule: { kind: "warning" },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBeLessThan(TEST_CONFIG.threshold);
  });

  it("not_found verdict → mid-confidence, below the confident threshold", () => {
    const c = deriveConfidence({
      verdict: "not_found",
      margin: 0,
      rule: { kind: "exact" },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBe(TEST_CONFIG.notFoundConfidence);
    expect(c).toBeLessThan(TEST_CONFIG.threshold);
  });
});

describe("deriveConfidence — legibility (D5, D7)", () => {
  it("low legibility on an otherwise-clean exact match drags below threshold", () => {
    const c = deriveConfidence({
      verdict: "match",
      margin: 1,
      rule: { kind: "exact" },
      legibility: "low",
      config: TEST_CONFIG,
    });
    expect(c).toBeLessThan(TEST_CONFIG.threshold);
  });

  it("low legibility halves the base confidence per config", () => {
    const high = deriveConfidence({
      verdict: "match",
      margin: 1,
      rule: { kind: "exact" },
      legibility: "good",
      config: TEST_CONFIG,
    });
    const low = deriveConfidence({
      verdict: "match",
      margin: 1,
      rule: { kind: "exact" },
      legibility: "low",
      config: TEST_CONFIG,
    });
    expect(low).toBe(high * TEST_CONFIG.legibilityFactors.low);
  });

  it("legibility defaults to 'good' when not supplied (non-warning fields with no per-region signal)", () => {
    const withGood = deriveConfidence({
      verdict: "match",
      margin: 1,
      rule: { kind: "exact" },
      legibility: "good",
      config: TEST_CONFIG,
    });
    const withDefault = deriveConfidence({
      verdict: "match",
      margin: 1,
      rule: { kind: "exact" },
      config: TEST_CONFIG,
    });
    expect(withDefault).toBe(withGood);
  });
});

describe("deriveConfidence — purity (D5)", () => {
  it("same inputs always produce the same output", () => {
    const args = {
      verdict: "match" as const,
      margin: 0.04,
      rule: { kind: "fuzzy" as const, minSimilarity: 0.92 },
      legibility: "good" as const,
      config: TEST_CONFIG,
    };
    expect(deriveConfidence(args)).toBe(deriveConfidence(args));
  });

  it("clamps to [0, 1] for safety even on adversarial inputs", () => {
    const c = deriveConfidence({
      verdict: "match",
      margin: 999, // absurd
      rule: { kind: "fuzzy", minSimilarity: 0.92 },
      legibility: "good",
      config: TEST_CONFIG,
    });
    expect(c).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThanOrEqual(0);
  });
});
