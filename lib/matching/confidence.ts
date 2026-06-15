/**
 * Confidence derivation (P1-4, D5).
 *
 * Turns a `MatchResult` (verdict + margin) plus the model's per-region
 * legibility flag into a numeric 0..1 confidence scalar that the triage
 * classifier (P1-5) reads to decide a lane.
 *
 * The model's own self-reported overall confidence is **never** input
 * to this function. That's D5 verbatim — the model is poorly calibrated
 * on overall confidence, and treating its number as authoritative is
 * how a confident misread silently auto-clears. The signals this
 * function accepts are:
 *   1. The margin from the matching engine (continuous for fuzzy fields,
 *      binary 1 / -1 for exact-match fields).
 *   2. The model's per-region legibility flag — a categorical signal
 *      about whether the region was readable, not a verdict.
 *
 * The function is pure: same inputs always produce the same output.
 * That's what makes calibration curves measurable in P5-2.
 */

import type { FieldRule, ConfidenceConfig } from "@/lib/config";
import type { Verdict } from "@/types";

export type LegibilitySignal = "good" | "low";

/** Internal: the rule shape passed in by the orchestrator. */
export type ConfidenceRuleInput =
  | { kind: "fuzzy"; minSimilarity: number }
  | { kind: "exact" }
  | { kind: "warning" };

/**
 * Convert a `FieldRule` from the config to the slimmer shape this
 * function consumes. `warning` is a separate kind because the warning
 * matcher doesn't have a per-field FieldRule in tolerances.json — it's
 * driven by `warning.json` instead.
 */
export function ruleInputFor(rule: FieldRule): ConfidenceRuleInput {
  if (rule.rule === "fuzzy") {
    return { kind: "fuzzy", minSimilarity: rule.minSimilarity };
  }
  return { kind: "exact" };
}

export type DeriveConfidenceInput = {
  verdict: Verdict;
  margin: number;
  rule: ConfidenceRuleInput;
  legibility?: LegibilitySignal;
  config: ConfidenceConfig;
};

/**
 * Derive a per-field confidence in [0, 1].
 *
 * Formula:
 *   - not_found: `config.notFoundConfidence` (mid; the human should look).
 *   - low_confidence (verdict): `config.lowConfidenceVerdict` (mid-low;
 *     used by the warning matcher when bold is uncertain or text is
 *     present but untranscribed).
 *   - match / mismatch on a fuzzy field: `0.5 + 0.5 * (|margin| / range)`,
 *     where `range = max(1 - minSimilarity, 0.001)`. Margin AT the
 *     threshold (a near-miss) yields 0.5; margin equal to range yields
 *     1.0; the function is linear in between.
 *   - match / mismatch on exact / warning: 1.0 (binary).
 *
 * Then multiplied by the legibility factor (1.0 for "good", typically
 * 0.5 for "low") and clamped to [0, 1].
 *
 * The model's self-reported overall confidence is intentionally not a
 * parameter here. Trace logs can carry it (per observability.md) but
 * the triage classifier must never read it (D5).
 */
export function deriveConfidence(input: DeriveConfidenceInput): number {
  const base = baseConfidence(input);
  const legibility = input.legibility ?? "good";
  const factor =
    legibility === "good"
      ? input.config.legibilityFactors.good
      : input.config.legibilityFactors.low;
  return clamp01(base * factor);
}

function baseConfidence(input: DeriveConfidenceInput): number {
  if (input.verdict === "not_found") return input.config.notFoundConfidence;
  if (input.verdict === "low_confidence") return input.config.lowConfidenceVerdict;

  // match or mismatch
  if (input.rule.kind === "fuzzy") {
    const range = Math.max(1 - input.rule.minSimilarity, 0.001);
    const normalised = Math.min(Math.abs(input.margin) / range, 1);
    return 0.5 + 0.5 * normalised;
  }

  // exact or warning — binary pass/fail
  return 1.0;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
