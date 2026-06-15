/**
 * Disposition mutation (P2-1; FR-26 atomic, whole-application).
 *
 * Records the agent's decision on a claimed application by:
 *   1. Removing it from the active queue (`applications`) — the
 *      worklist only holds open exceptions.
 *   2. Appending it to `dispositionedApplications` (P2-6) — the
 *      historical record the Analytics dashboards, Team / My Stats
 *      pages, and the history slice of All Applications read from.
 *
 * In the prototype the disposition is logged in-memory only — there's
 * no persistence (NFR-4). P6-2's persistence layer will swap the two
 * arrays for the equivalent `disposition` table insert + `application`
 * status update; the queue contract (this function's signature) stays
 * the same.
 */

import type { Disposition, DispositionRecord, ReturnReasonSummary } from "@/types";

import type {
  ApplicationStatus,
  DispositionedApplication,
  QueueApplication,
  QueueStoreState,
} from "./types";

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
 * Map a `Disposition` to the application's post-decision status.
 *
 * `approve` → `approved`; `return_for_correction` → `needs_correction`.
 * The third terminal state, `rejected`, is system-generated (the
 * 30-day correction window lapses) — it's not a value `Disposition`
 * carries, but the historical fixtures pre-seed some rejected rows so
 * the All Applications status filter has something to show.
 */
export function statusForDisposition(
  d: Disposition,
): Exclude<ApplicationStatus, "in_queue"> {
  switch (d) {
    case "approve":
      return "approved";
    case "return_for_correction":
      return "needs_correction";
  }
}

/**
 * Record a disposition: drop the row from the active queue and append
 * it to `dispositionedApplications` so the Analytics + history surfaces
 * can read against it. Returns the new store state and the recorded
 * disposition.
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

  // Remove from active queue. Production would mark `disposed_at` and
  // keep the row for audit — the queue selector would filter on it.
  // For the prototype, removing the row from the in-memory queue is the
  // same observable behaviour.
  const nextApplications: QueueApplication[] = state.applications.filter(
    (a) => a.applicationId !== input.applicationId,
  );

  // Append to the historical record. This is the data the analytics
  // selectors and the history slice of All Applications read from.
  const dispositioned: DispositionedApplication = {
    ...target,
    disposition: record,
    status: statusForDisposition(input.disposition),
  };
  const nextDispositioned: DispositionedApplication[] = [
    ...state.dispositionedApplications,
    dispositioned,
  ];

  return {
    state: {
      ...state,
      applications: nextApplications,
      dispositionedApplications: nextDispositioned,
    },
    record,
  };
}
