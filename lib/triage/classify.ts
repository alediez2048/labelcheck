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

/**
 * Lane-blocking fields: these fields' verdicts decide the lane. Other
 * extracted fields (producer name, address, country of origin, fanciful
 * name) still appear in the per-field summary but never move the lane
 * on their own.
 *
 * The government warning is handled by its own rule (step 2): a warning
 * `mismatch` goes to the mismatch lane at any confidence, and a
 * `low_confidence` warning goes to review. How strict the warning check
 * is lives in `config/warning.json` (`enforcement`), not here.
 */
const LANE_BLOCKING_FIELDS: ReadonlySet<string> = new Set([
  "brand_name",
  "alcohol_content",
  "class_type",
  "net_contents",
]);

const WARNING_FIELD = "government_warning";

export function classify(input: ClassifyInput): TriageResult {
  const threshold =
    input.confidentThreshold ?? getTolerances().confidence.threshold;
  const { fieldResults, context } = input;

  // 1. Confident mismatches ON BLOCKING FIELDS only.
  const confidentMismatches = fieldResults.filter(
    (r) =>
      LANE_BLOCKING_FIELDS.has(r.field) &&
      r.verdict === "mismatch" &&
      r.confidence >= threshold,
  );

  // 2. A government warning mismatch blocks at ANY confidence (D6).
  const warningFailures = fieldResults.filter(
    (r) => r.field === WARNING_FIELD && r.verdict === "mismatch",
  );

  if (warningFailures.length > 0 || confidentMismatches.length > 0) {
    return {
      lane: "mismatch",
      overallConfidence: minConfidence(fieldResults),
      // Warning reasons first: it is the highest-stakes check.
      reasons: dedupe(
        [...warningFailures, ...confidentMismatches].map((r) => r.reason),
      ),
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

  // 4. Any not-found / low-confidence / near-miss (match below threshold)
  //    — restricted to BLOCKING FIELDS so a missing producer address
  //    on the label doesn't push the lane to review.
  const reviewTriggers = fieldResults.filter((r) => {
    if (r.field === WARNING_FIELD) return r.verdict === "low_confidence";
    if (!LANE_BLOCKING_FIELDS.has(r.field)) return false;
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
  // Only blocking fields drive the overall confidence. A non-blocking
  // field like country_of_origin returning "not found" at 0.5 used to
  // drag the whole verdict down to 50%, even when every blocking
  // field matched at 1.0. The overall number is the supervisor's
  // glance signal — it has to reflect the lane-decision inputs only.
  const blocking = results.filter((r) => LANE_BLOCKING_FIELDS.has(r.field));
  const sample = blocking.length > 0 ? blocking : results;
  if (sample.length === 0) return 1;
  let m = 1;
  for (const r of sample) {
    if (r.confidence < m) m = r.confidence;
  }
  return m;
}

function dedupe(strings: ReadonlyArray<string>): string[] {
  return Array.from(new Set(strings));
}
