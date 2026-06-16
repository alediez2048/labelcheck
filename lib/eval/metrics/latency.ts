/**
 * Latency distribution (P5-2; observability.md "Latency distribution";
 * NFR-1; A12).
 *
 * Reports p50 / p95 / p99 / max from the measured per-case durations
 * and lists case ids whose duration exceeded the 5-second budget. Same
 * nearest-rank percentile as `scripts/bench-latency.ts` so the eval
 * numbers and the bench numbers are comparable.
 */

import type { CaseRun, LatencyReport } from "../types";

const DEFAULT_BUDGET_MS = 5000;

/**
 * Nearest-rank percentile. Returns 0 on an empty input. Index is
 * `ceil(p * N) - 1` clamped to `[0, N - 1]`.
 */
function percentile(sortedAsc: ReadonlyArray<number>, p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.ceil(p * sortedAsc.length) - 1;
  const clamped = Math.max(0, Math.min(idx, sortedAsc.length - 1));
  return sortedAsc[clamped] ?? 0;
}

export function computeLatency(
  runs: ReadonlyArray<CaseRun>,
  budgetMs: number = DEFAULT_BUDGET_MS,
): LatencyReport {
  const durations = runs.map((r) => r.durationMs).sort((a, b) => a - b);
  const budgetBreaches = runs
    .filter((r) => r.durationMs > budgetMs)
    .map((r) => r.caseId);

  return {
    count: runs.length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: durations.length === 0 ? 0 : (durations[durations.length - 1] ?? 0),
    budgetMs,
    budgetBreaches,
  };
}
