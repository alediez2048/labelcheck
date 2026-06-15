/**
 * Disposition mutation (P2-1; FR-26 atomic, whole-application).
 *
 * Records the agent's decision on a claimed application by removing
 * it from the queue (the queue holds open exception work; once
 * dispositioned, the application is no longer in the worklist).
 *
 * In the prototype the disposition is logged in-memory only — there's
 * no persistence (NFR-4). P6-2's persistence layer will swap the
 * filter for an append to the disposition table; the queue contract
 * (this function's signature) stays the same.
 */

import type { Disposition, DispositionRecord, ReturnReasonSummary } from "@/types";

import type { QueueApplication, QueueStoreState } from "./types";

export type DispositionInput = {
  applicationId: string;
  disposition: Disposition;
  returnReason?: ReturnReasonSummary;
  agentId: string;
};

export type DispositionResult = {
  state: QueueStoreState;
  record: DispositionRecord;
};

/**
 * Record a disposition and remove the application from the queue.
 * Returns the new store state and the recorded disposition.
 */
export function recordDisposition(
  state: QueueStoreState,
  input: DispositionInput,
  now: () => string = () => new Date().toISOString(),
): DispositionResult | null {
  const target = state.applications.find(
    (a) => a.applicationId === input.applicationId,
  );
  if (!target) return null;

  const record: DispositionRecord = {
    applicationId: input.applicationId,
    disposition: input.disposition,
    ...(input.returnReason ? { returnReason: input.returnReason } : {}),
    decidedAt: now(),
    decidedBy: input.agentId,
  };

  // Remove from queue. Production would mark `disposed_at` and keep
  // the row for audit — the queue selector would filter on it. For
  // the prototype, removing the row from the in-memory store is the
  // same observable behaviour.
  const nextApplications: QueueApplication[] = state.applications.filter(
    (a) => a.applicationId !== input.applicationId,
  );

  return {
    state: { ...state, applications: nextApplications },
    record,
  };
}
