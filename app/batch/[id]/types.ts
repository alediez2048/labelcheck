/**
 * Wire-format types for the batch poll endpoint, mirrored here so the
 * UI doesn't import from `lib/batch/**` (the parallel orchestrator-
 * side agent owns that module and the UI keeps a clean cut-line).
 *
 * The shape is the contract; if `lib/batch/types.ts` drifts, a single
 * diff here surfaces it. `VerificationResult` is re-imported from the
 * canonical domain types so there's only one source of truth for the
 * per-application payload (D4, D5).
 */

import type { StructuredError } from "@/lib/errors/types";
import type { BeverageType, VerificationResult } from "@/types";
import type { SampleForm } from "@/fixtures/samples";

export type BatchItemStatus = "pending" | "running" | "done" | "failed";

/**
 * P3-3: the wire shape carries `faces` as JSON-encoded Buffers
 * (`{"type":"Buffer","data":[...]}`) so the retry button on the failed-
 * items panel can re-submit the same bytes to `/api/verify`. The decode
 * happens in the retry handler — most consumers of `BatchItem` here
 * only care about `brand`, `status`, `result`, and `error`.
 */
export type WireFace = {
  kind: "front" | "back" | "neck";
  bytes: { type: "Buffer"; data: number[] } | string;
  mime: "image/jpeg" | "image/png";
};

export type BatchItem = {
  id: string;
  applicationId: string;
  brand: string;
  beverageType?: BeverageType;
  form?: SampleForm;
  faces?: ReadonlyArray<WireFace>;
  status: BatchItemStatus;
  result?: VerificationResult;
  /** P3-3: structured-error shape shared with the verify path. */
  error?: StructuredError;
};

export type BatchProgress = {
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  byLane: { match: number; mismatch: number; review: number };
};

export type BatchPollResponse = {
  jobId: string;
  createdAt: string;
  progress: BatchProgress;
  items: BatchItem[];
  finished: boolean;
};
