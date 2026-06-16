/**
 * Tests for the in-memory batch store.
 *
 * Covers job/item identity assignment, in-place mutation, and the
 * `summarizeProgress` reduction. The lane-count rule (done items only)
 * is the load-bearing invariant: a failed item must not contribute to
 * any lane bucket — lane is the AI's call (D11/D15), and a failed item
 * has no AI call.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  __resetStoreForTests,
  createJob,
  createJobWithFailures,
  getJob,
  listAll,
  summarizeProgress,
  updateItem,
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

function seedItem(applicationId: string): Omit<BatchItem, "id" | "status"> {
  return {
    applicationId,
    brand: applicationId.toUpperCase(),
    beverageType: "wine",
    form: FAKE_FORM,
    faces: FAKE_FACES,
  };
}

function fakeResult(
  applicationId: string,
  lane: VerificationResult["lane"],
): VerificationResult {
  return {
    applicationId,
    lane,
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

describe("lib/batch/store", () => {
  beforeEach(() => {
    __resetStoreForTests();
  });

  it("createJob assigns ids and seeds pending status", () => {
    const job = createJob([seedItem("a"), seedItem("b"), seedItem("c")]);
    expect(job.jobId).toMatch(/^batch-/);
    expect(job.items).toHaveLength(3);
    for (let i = 0; i < job.items.length; i++) {
      const item = job.items[i]!;
      expect(item.id).toBe(`${job.jobId}-${i}`);
      expect(item.status).toBe("pending");
      expect(item.result).toBeUndefined();
      expect(item.error).toBeUndefined();
    }
    expect(getJob(job.jobId)).toBe(job);
  });

  it("createJob distinguishes ids across multiple jobs", () => {
    const a = createJob([seedItem("x")]);
    const b = createJob([seedItem("y")]);
    expect(a.jobId).not.toBe(b.jobId);
    expect(listAll()).toHaveLength(2);
  });

  it("updateItem mutates in place; idempotent on already-completed items", () => {
    const job = createJob([seedItem("a"), seedItem("b")]);
    const firstId = job.items[0]!.id;

    updateItem(job.jobId, firstId, {
      status: "done",
      result: fakeResult("a", "match"),
    });
    expect(job.items[0]!.status).toBe("done");
    expect(job.items[0]!.result?.lane).toBe("match");

    // Overwrite on an already-completed item — should not corrupt the
    // surrounding state.
    updateItem(job.jobId, firstId, {
      status: "done",
      result: fakeResult("a", "review"),
    });
    expect(job.items[0]!.status).toBe("done");
    expect(job.items[0]!.result?.lane).toBe("review");
    // Sibling untouched.
    expect(job.items[1]!.status).toBe("pending");
  });

  it("updateItem is a noop on missing jobs and missing items", () => {
    const job = createJob([seedItem("a")]);
    expect(() => updateItem("nope", "nope", { status: "done" })).not.toThrow();
    expect(() => updateItem(job.jobId, "nope", { status: "done" })).not.toThrow();
    expect(job.items[0]!.status).toBe("pending");
  });

  it("summarizeProgress counts statuses correctly", () => {
    const job = createJob([
      seedItem("a"),
      seedItem("b"),
      seedItem("c"),
      seedItem("d"),
    ]);
    updateItem(job.jobId, job.items[0]!.id, { status: "running" });
    updateItem(job.jobId, job.items[1]!.id, {
      status: "done",
      result: fakeResult("b", "match"),
    });
    updateItem(job.jobId, job.items[2]!.id, {
      status: "failed",
      error: { code: "pipeline_error", message: "boom" },
    });

    const progress = summarizeProgress(job);
    expect(progress.total).toBe(4);
    expect(progress.pending).toBe(1);
    expect(progress.running).toBe(1);
    expect(progress.done).toBe(1);
    expect(progress.failed).toBe(1);
  });

  it("summarizeProgress.byLane counts ONLY done items (failed items contribute to no lane)", () => {
    const job = createJob([
      seedItem("a"),
      seedItem("b"),
      seedItem("c"),
      seedItem("d"),
      seedItem("e"),
    ]);
    updateItem(job.jobId, job.items[0]!.id, {
      status: "done",
      result: fakeResult("a", "match"),
    });
    updateItem(job.jobId, job.items[1]!.id, {
      status: "done",
      result: fakeResult("b", "match"),
    });
    updateItem(job.jobId, job.items[2]!.id, {
      status: "done",
      result: fakeResult("c", "mismatch"),
    });
    updateItem(job.jobId, job.items[3]!.id, {
      status: "done",
      result: fakeResult("d", "review"),
    });
    // A failed item must NOT count toward any lane — the lane is the
    // AI's call; a failed item has no AI call.
    updateItem(job.jobId, job.items[4]!.id, {
      status: "failed",
      error: { code: "pipeline_error", message: "boom" },
    });

    const progress = summarizeProgress(job);
    expect(progress.done).toBe(4);
    expect(progress.failed).toBe(1);
    expect(progress.byLane.match).toBe(2);
    expect(progress.byLane.mismatch).toBe(1);
    expect(progress.byLane.review).toBe(1);
  });

  it("createJobWithFailures preserves seeded failed status", () => {
    const job = createJobWithFailures([
      {
        applicationId: "ok",
        brand: "OK",
        beverageType: "wine",
        form: FAKE_FORM,
        faces: FAKE_FACES,
        status: "pending",
      },
      {
        applicationId: "bad",
        brand: "BAD",
        beverageType: "wine",
        form: FAKE_FORM,
        faces: [],
        status: "failed",
        error: { code: "validation_error", message: "missing brandName" },
      },
    ]);
    expect(job.items[0]!.status).toBe("pending");
    expect(job.items[1]!.status).toBe("failed");
    expect(job.items[1]!.error?.code).toBe("validation_error");
  });
});
