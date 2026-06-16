/**
 * Batch orchestrator (P3-1).
 *
 * Fans pending items through `p-limit(cap)` so at most `concurrency`
 * runs are in flight at once. Each item dispatches to the same
 * per-application pipeline that `/api/verify` uses
 * (`lib/verify/runVerification.ts`) — no duplication. A single failure
 * does not abort the rest: thrown errors are caught and turned into
 * `status: "failed"` updates so the batch keeps running (P3-3 expands
 * on this error-handling posture).
 *
 * The orchestrator is fire-and-forget from the API's perspective. The
 * `POST /api/batch` endpoint calls `void runBatch(jobId, ...)` after
 * committing the job to the store, then returns the jobId immediately;
 * subsequent polls of `GET /api/batch/[id]` reflect the in-place
 * mutations the orchestrator makes via `updateItem`.
 */

import pLimit from "p-limit";

import { toStructuredError } from "@/lib/provider/withTimeout";
import {
  runVerification,
  type RunVerificationInput,
} from "@/lib/verify/runVerification";
import type { VerificationResult } from "@/types";

import { getJob, updateItem } from "./store";

export type OrchestratorOptions = {
  concurrency: number;
  /**
   * Test-only override for the per-item pipeline. Production passes
   * nothing and the orchestrator dispatches to `runVerification`.
   * Exposing this hook keeps the concurrency-cap and failure-isolation
   * tests honest without spinning up the real extraction service for
   * every test run.
   */
  runner?: (input: RunVerificationInput) => Promise<VerificationResult>;
};

/**
 * Drive a batch job to completion. Resolves when every scheduled item
 * has either landed in the `done` or `failed` terminal state. The
 * caller does NOT await this in production — the API returns the jobId
 * immediately and the poll endpoint reads progress off the store as it
 * fills in.
 */
export async function runBatch(
  jobId: string,
  options: OrchestratorOptions,
): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const runner = options.runner ?? runVerification;
  const limit = pLimit(options.concurrency);

  // Snapshot the pending items at start. New items can't be added to
  // an in-flight job (the create endpoint seeds the whole job before
  // calling runBatch), so this list is stable for the lifetime of the
  // orchestrator run.
  const work = job.items
    .filter((item) => item.status === "pending")
    .map((item) =>
      limit(async () => {
        const itemId = item.id;
        updateItem(jobId, itemId, { status: "running" });
        try {
          const result = await runner({
            applicationId: item.applicationId,
            beverageType: item.beverageType,
            form: item.form,
            faces: item.faces,
          });
          updateItem(jobId, itemId, { status: "done", result });
        } catch (err) {
          // A thrown error is contained at the item boundary so the rest
          // of the batch continues (systemsdesign Error Handling). The
          // thrown error is normalised to a `StructuredError` via the
          // module-boundary helper so the failed-items panel renders the
          // same code vocabulary as the verify path (P3-3). The pipeline
          // already swallows expected failures (degraded provider,
          // unreadable image) inside `runVerification`, so anything that
          // reaches here is by definition unexpected and maps to
          // `INTERNAL`; `toStructuredError` will downgrade to a more
          // specific code if the thrown shape carries a transient signal.
          updateItem(jobId, itemId, {
            status: "failed",
            error: toStructuredError(err),
          });
        }
      }),
    );

  await Promise.all(work);
}
