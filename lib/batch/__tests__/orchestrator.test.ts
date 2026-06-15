/**
 * Tests for the batch orchestrator.
 *
 * We feed a deterministic, controllable mock runner instead of the real
 * `runVerification` — the per-application pipeline is exercised by its
 * own tests, and what we care about here is:
 *
 *   1. Concurrency is bounded by the cap — no more than `concurrency`
 *      runs are in flight at once.
 *   2. Every scheduled item terminates (no leaked promise).
 *   3. A thrown error in one item lands `failed` without aborting the
 *      rest (Error Handling; expanded in P3-3).
 */

import { describe, it, expect, beforeEach } from "vitest";

import { runBatch } from "../orchestrator";
import {
  __resetStoreForTests,
  createJob,
  getJob,
} from "../store";
import type { BatchItem } from "../types";
import type { VerificationResult } from "@/types";

const FAKE_FACES: BatchItem["faces"] = [
  { kind: "front", bytes: Buffer.from("x"), mime: "image/jpeg" },
];

const FAKE_FORM: BatchItem["form"] = {
  brandName: "BRAND",
  classType: "TABLE WINE",
  alcoholContent: "12%",
  netContents: "750 ML",
  producerName: "ACME",
  producerAddress: "1 ACME WAY",
};

function seed(n: number): Array<Omit<BatchItem, "id" | "status">> {
  return Array.from({ length: n }, (_, i) => ({
    applicationId: `app-${i}`,
    brand: `BRAND-${i}`,
    beverageType: "wine" as const,
    form: FAKE_FORM,
    faces: FAKE_FACES,
  }));
}

function fakeResult(applicationId: string): VerificationResult {
  return {
    applicationId,
    lane: "match",
    overallConfidence: 0.9,
    fields: [],
    warning: {
      presence: true,
      allCaps: true,
      boldConfident: "yes",
      legibility: "good",
    },
    flags: [],
    extractionFailed: false,
  };
}

/**
 * A runner that tracks the live in-flight count and records the peak.
 * `delayMs` controls how long each "run" sits before resolving so the
 * race window is large enough to observe parallelism reliably.
 */
function makeTrackedRunner(delayMs: number): {
  runner: (input: { applicationId: string }) => Promise<VerificationResult>;
  getPeak: () => number;
  getCalls: () => number;
} {
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  const runner = async (input: { applicationId: string }) => {
    calls += 1;
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    inFlight -= 1;
    return fakeResult(input.applicationId);
  };
  return { runner, getPeak: () => peak, getCalls: () => calls };
}

describe("lib/batch/orchestrator", () => {
  beforeEach(() => {
    __resetStoreForTests();
  });

  it("respects the concurrency cap across 20 items", async () => {
    const job = createJob(seed(20));
    const { runner, getPeak } = makeTrackedRunner(20);
    await runBatch(job.jobId, { concurrency: 5, runner });
    expect(getPeak()).toBeLessThanOrEqual(5);
    expect(getPeak()).toBeGreaterThan(1); // sanity — we DID run in parallel
  });

  it("runs every item to completion", async () => {
    const job = createJob(seed(20));
    const { runner, getCalls } = makeTrackedRunner(5);
    await runBatch(job.jobId, { concurrency: 5, runner });
    expect(getCalls()).toBe(20);
    const live = getJob(job.jobId)!;
    for (const item of live.items) {
      expect(item.status).toBe("done");
      expect(item.result?.lane).toBe("match");
    }
  });

  it("isolates a single thrown item — the rest still complete", async () => {
    const job = createJob(seed(20));
    const failApplicationId = job.items[7]!.applicationId;
    const runner = async (input: { applicationId: string }) => {
      if (input.applicationId === failApplicationId) {
        throw new Error("synthetic failure");
      }
      await new Promise<void>((r) => setTimeout(r, 2));
      return fakeResult(input.applicationId);
    };
    await runBatch(job.jobId, { concurrency: 5, runner });
    const live = getJob(job.jobId)!;
    let done = 0;
    let failed = 0;
    for (const item of live.items) {
      if (item.status === "done") done += 1;
      if (item.status === "failed") failed += 1;
    }
    expect(done).toBe(19);
    expect(failed).toBe(1);
    const failedItem = live.items.find((i) => i.status === "failed")!;
    expect(failedItem.error?.code).toBe("pipeline_error");
    expect(failedItem.error?.message).toBe("synthetic failure");
  });

  it("returns silently for a missing job", async () => {
    await expect(
      runBatch("no-such-job", { concurrency: 5 }),
    ).resolves.toBeUndefined();
  });
});
