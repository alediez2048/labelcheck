/**
 * Batch-intake types (P3-1).
 *
 * The batch path wraps the per-application pipeline (`runVerification`).
 * State is in-memory, ephemeral; a restart loses jobs by design
 * (D2, NFR-4). The UI polls `GET /api/batch/[id]`; the response shape
 * here IS the wire contract the batch results view consumes — keep it
 * stable.
 */

import type { StructuredError } from "@/lib/errors/types";
import type { BeverageType, FaceKind, VerificationResult } from "@/types";
import type { SampleForm } from "@/fixtures/samples";

export type BatchItemStatus = "pending" | "running" | "done" | "failed";

/**
 * One item in a batch job. The orchestrator reads `applicationId`,
 * `beverageType`, `form`, and `faces` to construct a `RunVerificationInput`
 * and dispatches to the per-application pipeline. The UI reads `brand`
 * to render a friendly label without waiting for the pipeline.
 *
 * `result` is populated when status transitions to `done`; `error` is
 * populated when status transitions to `failed`. Both are optional at
 * the type level because `pending` and `running` carry neither.
 */
export type BatchItem = {
  /** Synthetic per-item id within the batch. */
  id: string;
  /** Application id used in the per-app pipeline (mirrors mock fixture keys when synthetic). */
  applicationId: string;
  /** Friendly brand label for the UI to show without running the pipeline first. */
  brand: string;
  /** Beverage type used by the per-app pipeline. */
  beverageType: BeverageType;
  /** Form fields the matching engine will compare against the label. */
  form: SampleForm;
  /** Label face bytes the extraction service will consume. */
  faces: ReadonlyArray<{
    kind: FaceKind;
    bytes: Buffer;
    mime: "image/jpeg" | "image/png";
  }>;
  status: BatchItemStatus;
  result?: VerificationResult;
  /**
   * Populated when status transitions to `failed`. P3-3 normalised this
   * to the shared `StructuredError` shape so the failed-items panel
   * renders the same code/message vocabulary as the verify path.
   */
  error?: StructuredError;
};

export type BatchJob = {
  jobId: string;
  createdAt: string;
  items: BatchItem[];
};

/**
 * Progress snapshot the UI renders mid-run. Lane counts include only
 * `done` items — a failed item is NOT a lane outcome (D15-adjacent;
 * the lane is the AI's call, and a failed item has no AI call). The
 * total is items.length so the progress bar can compute completion.
 */
export type BatchProgress = {
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  byLane: { match: number; mismatch: number; review: number };
};

/**
 * The shape `GET /api/batch/[id]` returns. The UI polls this until
 * `finished === true`. The full `items` array is included on every
 * poll because the job is small (≤ 500 per `config/batch.json`) and
 * the prototype's UI renders per-lane breakdowns from the raw items.
 */
export type BatchPollResponse = {
  jobId: string;
  createdAt: string;
  progress: BatchProgress;
  items: BatchItem[];
  finished: boolean;
};
