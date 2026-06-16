/**
 * P5-5 — CI eval gate: baseline file schema + IO.
 *
 * The committed `eval-baseline.json` at the repo root is the bar the
 * gate measures every run against. Its shape is a parallel snapshot of
 * `EvalReport` (the run shape) plus a `tolerances` block that lives in
 * config — not code — so the bar itself is reviewable in a PR
 * (FR-25 discipline applied to evals).
 *
 * The `golden_set_version` is a content hash of `tests/golden/index.ts`
 * (the typed array IS the manifest; see the note in `lib/eval/types.ts`).
 * A mismatch between the baseline's recorded `golden_set_version` and
 * the runtime-computed hash forces an explicit re-baseline conversation
 * — see `docs/EVAL-BASELINE.md`.
 *
 * Strict zod: missing `golden_set_version` rejects. No silent loosening.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

const subAccuracySchema = z.object({
  tp: z.number(),
  tn: z.number(),
  fp: z.number(),
  fn: z.number(),
  accuracy: z.number(),
});

const falseNegativeRateSchema = z.object({
  totalRealNegatives: z.number(),
  leakedToMatch: z.number(),
  rate: z.number(),
  leakedCaseIds: z.array(z.string()),
});

const laneConfusionSchema = z.object({
  matrix: z.object({
    match: z.object({
      match: z.number(),
      mismatch: z.number(),
      review: z.number(),
    }),
    mismatch: z.object({
      match: z.number(),
      mismatch: z.number(),
      review: z.number(),
    }),
    review: z.object({
      match: z.number(),
      mismatch: z.number(),
      review: z.number(),
    }),
  }),
  perLaneAccuracy: z.object({
    match: z.number(),
    mismatch: z.number(),
    review: z.number(),
  }),
  overall: z.number(),
});

const warningCheckSchema = z.object({
  presence: subAccuracySchema,
  verbatim: subAccuracySchema,
  allCaps: subAccuracySchema,
});

const calibrationSchema = z.object({
  ece: z.number(),
});

const perFieldSchema = z.object({
  field: z.string(),
  precision: z.number(),
  recall: z.number(),
  f1: z.number(),
});

const latencySchema = z.object({
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
  max: z.number(),
});

const tolerancesSchema = z.object({
  /**
   * Headline — false-negative rate. Default `0.0`: a single leaked
   * real-negative is a gate failure. The bar is intentionally
   * non-negotiable; do not soften this in code.
   */
  falseNegativeRate: z.number(),
  laneAccuracy: z.number(),
  warningPresenceAccuracy: z.number(),
  warningVerbatimAccuracy: z.number(),
  warningAllCapsAccuracy: z.number(),
  calibrationEce: z.number(),
  /** Hard p95 ceiling in milliseconds — NFR-1 target is 5000ms. */
  latencyP95BudgetMs: z.number(),
});

export const evalBaselineSchema = z.object({
  version: z.number(),
  created_at: z.string(),
  /**
   * Content hash of the golden set source. Required — strict-mode
   * zod refuses to construct a baseline without it so a manifest edit
   * cannot silently slip through.
   */
  golden_set_version: z.string().min(1),
  metrics: z.object({
    falseNegativeRate: falseNegativeRateSchema,
    laneConfusion: laneConfusionSchema,
    warningCheck: warningCheckSchema,
    calibration: calibrationSchema,
    perField: z.array(perFieldSchema),
    latency: latencySchema,
  }),
  tolerances: tolerancesSchema,
});

export type EvalBaseline = z.infer<typeof evalBaselineSchema>;
export type EvalBaselineTolerances = z.infer<typeof tolerancesSchema>;

/**
 * Read + validate the baseline file at `path`. Throws if the file is
 * missing, malformed, or rejected by the schema (e.g. missing
 * `golden_set_version`).
 */
export async function loadBaseline(path: string): Promise<EvalBaseline> {
  const raw = await readFile(path, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  return evalBaselineSchema.parse(parsed);
}

/**
 * Write `baseline` to `path` as pretty-printed JSON with a trailing
 * newline so the file plays nicely with formatters and diff tools.
 */
export async function writeBaseline(
  path: string,
  baseline: EvalBaseline,
): Promise<void> {
  const validated = evalBaselineSchema.parse(baseline);
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

/**
 * Compute the golden-set version (content hash) from the on-disk
 * `tests/golden/index.ts`. Cheap, deterministic, and detects ANY edit
 * to the source-of-truth array — adding a red case, renaming an id,
 * or tweaking a fixture all change the hash and force a re-baseline.
 */
export async function computeGoldenSetVersion(
  goldenIndexPath: string,
): Promise<string> {
  const data = await readFile(goldenIndexPath);
  return createHash("sha256").update(data).digest("hex");
}
