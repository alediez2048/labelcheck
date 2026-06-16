/**
 * Disagreement-queue sampler (P5-3).
 *
 * Decides whether an override record lands in the daily disagreement
 * queue. The recorder calls `shouldSample` BEFORE writing the new
 * record, passing the counts from "today's corpus so far" — no
 * separate state file.
 *
 * Rules:
 *   - `agreement` records never sample (they're not disagreements).
 *   - If today's sampled count is already at the cap → false.
 *   - Otherwise: `(todayOverrideCount * ratio) > todaySampledCount`
 *     fires on every Nth override where N = 1/ratio. With the default
 *     ratio of 0.10 that means the 1st, 11th, 21st, ... overrides
 *     each day land in the queue (until the cap).
 *
 * Defaults come from env when present:
 *   - `FEEDBACK_SAMPLER_RATIO`     (default 0.10)
 *   - `FEEDBACK_SAMPLER_CAP_PER_DAY` (default 25)
 *
 * The fixed-stride deterministic policy was chosen over random
 * sampling so a) the disagreement queue's growth is predictable for
 * the supervisor's day, b) the unit tests are non-flaky, and c) the
 * sampler stays a pure function. Randomized sampling can replace the
 * stride later without changing the seam.
 */

import type { OverrideKind } from "./types";

export type SamplerConfig = {
  ratio: number;
  capPerDay: number;
};

const DEFAULT_RATIO = 0.1;
const DEFAULT_CAP_PER_DAY = 25;

function readNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Resolve the sampler config from env (when no explicit config is
 * passed). Reads at call time so test overrides via `vi.stubEnv` take
 * effect without process restart — same pattern as `redact.ts`.
 */
export function resolveSamplerConfig(
  config?: Partial<SamplerConfig>,
): SamplerConfig {
  return {
    ratio:
      config?.ratio ??
      readNumberEnv("FEEDBACK_SAMPLER_RATIO", DEFAULT_RATIO),
    capPerDay:
      config?.capPerDay ??
      Math.floor(
        readNumberEnv("FEEDBACK_SAMPLER_CAP_PER_DAY", DEFAULT_CAP_PER_DAY),
      ),
  };
}

export function shouldSample(
  overrideKind: OverrideKind,
  todayOverrideCount: number,
  todaySampledCount: number,
  config?: Partial<SamplerConfig>,
): boolean {
  if (overrideKind === "agreement") return false;
  const resolved = resolveSamplerConfig(config);
  if (todaySampledCount >= resolved.capPerDay) return false;
  // Trigger on every (1/ratio)-th override. The recorder passes the
  // prior counts (before incrementing for this override), so the
  // formula stays simple: `(prior * ratio) > priorSampled` fires
  // exactly when the running quota for the day has slipped behind.
  return todayOverrideCount * resolved.ratio > todaySampledCount;
}
