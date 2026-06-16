/**
 * P5-5 — CI eval gate: baseline schema + IO round-trip.
 *
 * The zod schema is the contract that prevents a baseline from being
 * loaded without a `golden_set_version` — the load-bearing field that
 * forces a re-baseline conversation whenever the golden set changes
 * (see `docs/EVAL-BASELINE.md`). These tests pin that contract.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  evalBaselineSchema,
  loadBaseline,
  writeBaseline,
  type EvalBaseline,
} from "@/lib/eval/gate/baseline";

function validBaseline(): EvalBaseline {
  return {
    version: 1,
    created_at: "2026-06-16T14:37:21.422Z",
    golden_set_version:
      "06f8c8a561dc6be189c7594d4a6a0ebd9e6c5b56c53f10152dfe0c0069ea7d5e",
    metrics: {
      falseNegativeRate: {
        totalRealNegatives: 7,
        leakedToMatch: 0,
        rate: 0,
        leakedCaseIds: [],
      },
      laneConfusion: {
        matrix: {
          match: { match: 2, mismatch: 0, review: 0 },
          mismatch: { match: 0, mismatch: 6, review: 0 },
          review: { match: 0, mismatch: 0, review: 1 },
        },
        perLaneAccuracy: { match: 1, mismatch: 1, review: 1 },
        overall: 1,
      },
      warningCheck: {
        presence: { tp: 7, tn: 1, fp: 1, fn: 0, accuracy: 0.88 },
        verbatim: { tp: 5, tn: 3, fp: 0, fn: 1, accuracy: 0.88 },
        allCaps: { tp: 5, tn: 3, fp: 0, fn: 1, accuracy: 0.88 },
      },
      calibration: { ece: 0.11 },
      perField: [
        { field: "brand_name", precision: 1, recall: 1, f1: 1 },
      ],
      latency: { p50: 1.5, p95: 7.5, p99: 7.5, max: 7.5 },
    },
    tolerances: {
      falseNegativeRate: 0,
      laneAccuracy: 0.01,
      warningPresenceAccuracy: 0.01,
      warningVerbatimAccuracy: 0.01,
      warningAllCapsAccuracy: 0.01,
      calibrationEce: 0.02,
      latencyP95BudgetMs: 5000,
    },
  };
}

describe("evalBaselineSchema", () => {
  it("rejects a baseline missing golden_set_version", () => {
    const broken = validBaseline() as Record<string, unknown>;
    delete broken.golden_set_version;
    const parsed = evalBaselineSchema.safeParse(broken);
    expect(parsed.success).toBe(false);
  });

  it("rejects a baseline with an empty golden_set_version", () => {
    const broken = { ...validBaseline(), golden_set_version: "" };
    const parsed = evalBaselineSchema.safeParse(broken);
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid baseline", () => {
    const parsed = evalBaselineSchema.safeParse(validBaseline());
    expect(parsed.success).toBe(true);
  });
});

describe("loadBaseline + writeBaseline round-trip", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "labelcheck-baseline-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("writes and reads back an identical baseline", async () => {
    const file = path.join(workDir, "eval-baseline.json");
    const baseline = validBaseline();
    await writeBaseline(file, baseline);
    const loaded = await loadBaseline(file);
    expect(loaded).toEqual(baseline);
  });
});
