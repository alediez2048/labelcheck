/**
 * Multi-face merge (D12, D13, FR-15).
 *
 * The matching engine produces per-face per-field results — one
 * FieldResult per face that carries a reading for the field (plus a
 * single "not_found" sentinel when no face has a read). This module
 * collapses those into ONE application-level FieldResult per field,
 * picking the best read across faces.
 *
 * The priority order is fixed, in this order:
 *
 *   1. If any face's verdict is `match`, the merged verdict is `match`,
 *      with the highest-confidence face winning the canonical read.
 *   2. Else if any face's verdict is `mismatch`, the merged verdict is
 *      `mismatch`, with the highest-confidence mismatched face as the
 *      source — the agent's attention goes to the broken read.
 *   3. Else if any face's verdict is `low_confidence`, the merged
 *      verdict is `low_confidence`.
 *   4. Else (every face is `not_found`), the merged verdict is
 *      `not_found`.
 *
 * Tie-breaks: within a tier, the highest-confidence read wins; on equal
 * confidence, a deterministic face order (front > back > neck) keeps
 * test fixtures stable.
 *
 * The government warning does NOT go through this merge — the warning
 * matcher in `warning.ts` already does its own cross-face logic per D12
 * (presence is satisfied if any face carries the warning; missing on
 * every face is a real mismatch). Routing it through here too would
 * double-count.
 */

import type { FaceKind, FieldName, FieldResult, Verdict } from "@/types";

const FACE_PRIORITY: Readonly<Record<FaceKind, number>> = {
  front: 0,
  back: 1,
  neck: 2,
};

const VERDICT_PRIORITY: Readonly<Record<Verdict, number>> = {
  match: 0,
  mismatch: 1,
  low_confidence: 2,
  not_found: 3,
};

export function mergeFaces(
  perFaceResults: ReadonlyArray<FieldResult>,
): FieldResult[] {
  const byField = new Map<FieldName, FieldResult[]>();
  for (const r of perFaceResults) {
    const list = byField.get(r.field);
    if (list === undefined) {
      byField.set(r.field, [r]);
    } else {
      list.push(r);
    }
  }

  const merged: FieldResult[] = [];
  for (const group of byField.values()) {
    merged.push(pickBest(group));
  }
  return merged;
}

function pickBest(group: ReadonlyArray<FieldResult>): FieldResult {
  // group is non-empty by construction in mergeFaces — every entry in
  // the map was inserted via push, so `group[0]` is safe as the
  // starting "best so far".
  let best = group[0];
  if (best === undefined) {
    // Defensive — mergeFaces never produces empty groups, but the
    // strict-indexed-access typing demands the null check.
    throw new Error("mergeFaces: empty result group");
  }
  for (let i = 1; i < group.length; i++) {
    const cand = group[i];
    if (cand === undefined) continue;
    if (isBetter(cand, best)) best = cand;
  }
  return best;
}

function isBetter(a: FieldResult, b: FieldResult): boolean {
  const aTier = VERDICT_PRIORITY[a.verdict];
  const bTier = VERDICT_PRIORITY[b.verdict];
  if (aTier !== bTier) return aTier < bTier;
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  const aRank = a.sourceFace ? FACE_PRIORITY[a.sourceFace] : 99;
  const bRank = b.sourceFace ? FACE_PRIORITY[b.sourceFace] : 99;
  return aRank < bRank;
}
