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

import type { VerificationResult } from "@/types";

export type BatchItemStatus = "pending" | "running" | "done" | "failed";

export type BatchItem = {
  id: string;
  applicationId: string;
  brand: string;
  status: BatchItemStatus;
  result?: VerificationResult;
  error?: { code: string; message: string };
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
