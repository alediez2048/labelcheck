/**
 * Triage classifier — rolls per-field results into ONE lane (FR-13, D11).
 *
 * The priority order is rigid by design: a real problem is never hidden
 * behind an otherwise-clean result, and anything uncertain escalates to
 * a human rather than being waved through. The order, in code:
 *
 *   1. Any field's verdict is `mismatch` AND its confidence is at or
 *      above the configured threshold → mismatch lane (FR-15).
 *   2. The government warning's verdict is `mismatch` at ANY confidence
 *      → mismatch lane (D6, FR-11/FR-12 — the warning is the highest-
 *      stakes check; we never let a flaky confidence number hide it).
 *   3. Any face's extraction failed (unreadable image) → review lane
 *      with the "needs a better image" reason (FR-16, FR-26b).
 *   4. Any field's verdict is `not_found` or `low_confidence`, OR any
 *      field's verdict is `match` but its confidence is BELOW the
 *      threshold → review lane (a near-miss is the case that validates
 *      D5 — a model that confidently misreads a fuzzy field is caught
 *      here).
 *   5. Otherwise (every field a confident match) → match lane.
 *
 * Overall confidence is the MINIMUM field confidence — one low-confidence
 * field drags the whole application. The conservative posture (D11; the
 * Review Model in constraints.md) prefers escalation over a confident-
 * looking aggregate that hides a weak signal.
 */

import { getTolerances } from "@/lib/config";
import type { FaceKind, FieldResult, Lane } from "@/types";

export type TriageContext = {
  /** Faces whose extraction failed — drives the FR-16 / FR-26b review path. */
  unreadableFaces?: ReadonlyArray<FaceKind>;
};

export type TriageResult = {
  lane: Lane;
  overallConfidence: number;
  /** Short, agent-readable strings explaining the lane. Empty on a clean match. */
  reasons: string[];
};

export type ClassifyInput = {
  fieldResults: ReadonlyArray<FieldResult>;
  context?: TriageContext;
  /** Override for testing; production reads from `config/tolerances.json`. */
  confidentThreshold?: number;
};

const WARNING_FIELD = "government_warning";

export function classify(input: ClassifyInput): TriageResult {
  const threshold =
    input.confidentThreshold ?? getTolerances().confidence.threshold;
  const { fieldResults, context } = input;

  // 1. Confident mismatches.
  const confidentMismatches = fieldResults.filter(
    (r) => r.verdict === "mismatch" && r.confidence >= threshold,
  );

  // 2. Warning failure at ANY confidence (highest-stakes check).
  const warningField = fieldResults.find((r) => r.field === WARNING_FIELD);
  const warningFailed = warningField?.verdict === "mismatch";

  if (confidentMismatches.length > 0 || warningFailed) {
    const reasons: string[] = [];
    if (warningFailed && warningField) reasons.push(warningField.reason);
    for (const r of confidentMismatches) {
      if (r.field !== WARNING_FIELD) reasons.push(r.reason);
    }
    return {
      lane: "mismatch",
      overallConfidence: minConfidence(fieldResults),
      reasons: dedupe(reasons),
    };
  }

  // 3. Unreadable image.
  if (context?.unreadableFaces && context.unreadableFaces.length > 0) {
    const faces = context.unreadableFaces.join(", ");
    return {
      lane: "review",
      overallConfidence: 0,
      reasons: [
        `Label face(s) unreadable (${faces}) — needs a better image`,
      ],
    };
  }

  // 4. Any not-found / low-confidence / near-miss (match below threshold).
  const reviewTriggers = fieldResults.filter((r) => {
    if (r.verdict === "not_found") return true;
    if (r.verdict === "low_confidence") return true;
    if (r.verdict === "match" && r.confidence < threshold) return true;
    if (r.verdict === "mismatch" && r.confidence < threshold) return true;
    return false;
  });

  if (reviewTriggers.length > 0) {
    return {
      lane: "review",
      overallConfidence: minConfidence(fieldResults),
      reasons: dedupe(reviewTriggers.map((r) => r.reason)),
    };
  }

  // 5. Everything is a confident match.
  return {
    lane: "match",
    overallConfidence: minConfidence(fieldResults),
    reasons: [],
  };
}

/**
 * The application's overall confidence is the minimum field confidence —
 * one low signal drags the whole application down. The alternative
 * (averaging) hides a single weak field behind a confident aggregate,
 * which is the exact failure mode D11 was written to prevent.
 *
 * Returns 1 for an empty result list (treated as no signal to drag,
 * not as "perfectly confident"); the caller handles the empty case
 * before reaching this function in practice.
 */
function minConfidence(results: ReadonlyArray<FieldResult>): number {
  if (results.length === 0) return 1;
  let m = 1;
  for (const r of results) {
    if (r.confidence < m) m = r.confidence;
  }
  return m;
}

function dedupe(strings: ReadonlyArray<string>): string[] {
  return Array.from(new Set(strings));
}
