/**
 * P1-11 / NFR-1 / AC-7 CI smoke — assert mock-adapter p95 stays under
 * the 5s budget.
 *
 * Runs a reduced version of the latency bench (20 iterations across
 * the golden set) so the assertion is stable and fast. The mock
 * adapter is in-process, so the measured p95 here is dominated by
 * `sharp` preprocessing — the test would fail loudly on any
 * accidental regression that introduced a sleep or a real network
 * call. The live-adapter measurement is the manual bench in
 * `scripts/bench-latency.ts`; CI does NOT assert against the live
 * model because the latency would be flaky (network jitter, model
 * load) and the assertion would be untrustworthy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as configModule from "@/lib/config";
import { runBench } from "../scripts/bench-latency";

const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

const TEST_WARNING_CONFIG: configModule.WarningConfig = {
  version: "test",
  canonicalText: CANONICAL_WARNING,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

describe("AC-7 — latency smoke (mock adapter)", () => {
  beforeEach(() => {
    process.env.PROVIDER = "mock";
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mock-adapter end-to-end p95 stays under the 5s budget", async () => {
    const result = await runBench(20);
    // Generous ceiling for the in-process mock — the assertion catches
    // any accidental regression that introduces a sleep or a real
    // network call. The live-adapter number lives in the manual bench.
    expect(result.pipeline.all.p95).toBeLessThan(5_000);
  }, 30_000);

  it("reports separate metrics for single-face vs multi-face (A12 split)", async () => {
    const result = await runBench(20);
    expect(result.pipeline.singleFace.count).toBeGreaterThan(0);
    expect(result.pipeline.multiFace.count).toBeGreaterThan(0);
    // The split is the structural answer to A12; the numbers themselves
    // need the live adapter to be meaningful.
    expect(result.pipeline.multiFace.p95).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
