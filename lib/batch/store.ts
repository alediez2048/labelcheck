/**
 * In-memory batch job store (D2, NFR-4).
 *
 * A module-level `Map<jobId, BatchJob>`. No persistence — a restart
 * loses jobs by design. The documented upgrade path (P6+) is the same
 * helper surface here implemented against SQLite if restart resilience
 * is later needed; until then, ephemeral is the right answer.
 *
 * Mutations are by reference: `updateItem` patches the live item inside
 * the live job inside the live Map. The orchestrator reads the same
 * Map the poll endpoint reads, so progress is always current.
 */

import type { BatchItem, BatchJob, BatchProgress } from "./types";

/**
 * Attach the Map to globalThis so Next.js dev-mode HMR re-evaluating
 * this module does NOT lose the in-flight jobs (the POST writer and
 * the GET reader can compile at different times and would otherwise
 * see different Map instances). In production builds the module is
 * bundled once; this is a dev-only safety net.
 */
const globalForBatch = globalThis as unknown as {
  __labelcheckBatchJobs?: Map<string, BatchJob>;
};
const JOBS: Map<string, BatchJob> =
  globalForBatch.__labelcheckBatchJobs ?? new Map<string, BatchJob>();
globalForBatch.__labelcheckBatchJobs = JOBS;

/**
 * Build a fresh jobId. Timestamp + 6 hex chars of randomness — collision
 * risk is acceptable for an in-memory prototype where the same process
 * never sees more than a handful of jobs at once.
 */
function newJobId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0");
  return `batch-${ts}-${rand}`;
}

/**
 * Create a new batch job from a list of item descriptors. The caller
 * supplies everything the orchestrator will need to dispatch each item
 * (applicationId, brand, beverageType, form, faces); we assign the
 * per-item id and seed each item with `status: "pending"`.
 */
export function createJob(
  items: ReadonlyArray<Omit<BatchItem, "id" | "status">>,
): BatchJob {
  const jobId = newJobId();
  const seeded: BatchItem[] = items.map((item, index) => ({
    ...item,
    id: `${jobId}-${index}`,
    status: "pending",
  }));
  const job: BatchJob = {
    jobId,
    createdAt: new Date().toISOString(),
    items: seeded,
  };
  JOBS.set(jobId, job);
  return job;
}

/**
 * Create a job that already has some items seeded as `failed` (used by
 * the create endpoint for per-item validation failures — malformed
 * items should still appear in the job, marked failed, so the supervisor
 * sees the same accounting).
 */
export function createJobWithFailures(
  items: ReadonlyArray<Omit<BatchItem, "id">>,
): BatchJob {
  const jobId = newJobId();
  const seeded: BatchItem[] = items.map((item, index) => ({
    ...item,
    id: `${jobId}-${index}`,
  }));
  const job: BatchJob = {
    jobId,
    createdAt: new Date().toISOString(),
    items: seeded,
  };
  JOBS.set(jobId, job);
  return job;
}

export function getJob(jobId: string): BatchJob | undefined {
  return JOBS.get(jobId);
}

export function listAll(): BatchJob[] {
  return Array.from(JOBS.values());
}

/**
 * Mutate one item in place. Returns silently if the job or item is
 * missing — the orchestrator schedules work after the job is in the
 * Map, so the missing case only happens when a caller asks for an id
 * that never existed.
 */
export function updateItem(
  jobId: string,
  itemId: string,
  partial: Partial<BatchItem>,
): void {
  const job = JOBS.get(jobId);
  if (!job) return;
  const idx = job.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  const current = job.items[idx];
  if (!current) return;
  // Object.assign mutates in place so any external reference to the
  // item (held by the orchestrator's per-item closure) stays current.
  Object.assign(current, partial);
}

/**
 * Aggregate the live counts off the job. Lane counts include ONLY
 * `done` items — a failed item has no AI verdict, so it is NOT a
 * mismatch or a review-lane outcome (D15-adjacent: lane is the AI's
 * call). The lane=review category covers AI-routed review items; a
 * failed item is accounted for under `failed` only.
 */
export function summarizeProgress(job: BatchJob): BatchProgress {
  let pending = 0;
  let running = 0;
  let done = 0;
  let failed = 0;
  let match = 0;
  let mismatch = 0;
  let review = 0;
  for (const item of job.items) {
    switch (item.status) {
      case "pending":
        pending += 1;
        break;
      case "running":
        running += 1;
        break;
      case "done":
        done += 1;
        if (item.result) {
          if (item.result.lane === "match") match += 1;
          else if (item.result.lane === "mismatch") mismatch += 1;
          else if (item.result.lane === "review") review += 1;
        }
        break;
      case "failed":
        failed += 1;
        break;
    }
  }
  return {
    total: job.items.length,
    pending,
    running,
    done,
    failed,
    byLane: { match, mismatch, review },
  };
}

/**
 * Test-only helper — wipe the in-memory store. Production code never
 * calls this; the Map persists for the process lifetime by design.
 */
export function __resetStoreForTests(): void {
  JOBS.clear();
}
