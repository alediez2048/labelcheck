/**
 * Pool admission (P2-3, FR-28, D15).
 *
 * Triaged exception applications (mismatch + review) enter the shared
 * work pool through this function. The match lane is hard-rejected —
 * bulk-confirm on Operations (P2-2) is the only path that touches a
 * match-lane row, never the router.
 *
 * `admitToPool` is idempotent: if the application is already in the
 * pool (unclaimed exception) it returns the state unchanged. If it
 * had been claimed, the prior claim is cleared and an "override"
 * audit event is logged so the supervisor can see the implicit
 * return-to-pool.
 */

import type {
  AuditEvent,
  QueueApplication,
  QueueStoreState,
} from "@/lib/queue/types";

import { RouterError } from "./types";

type Options = {
  now?: () => string;
  actorId?: string;
};

export function admitToPool(
  state: QueueStoreState,
  applicationId: string,
  options: Options = {},
): QueueStoreState {
  const now = options.now ?? (() => new Date().toISOString());
  const actorId = options.actorId ?? "system";

  const index = state.applications.findIndex(
    (a) => a.applicationId === applicationId,
  );
  if (index === -1) {
    throw new RouterError(
      "application_not_found",
      `Application ${applicationId} not found in store`,
    );
  }

  const application = state.applications[index]!;
  const lane = application.verification.lane;

  if (lane === "match") {
    throw new RouterError(
      "match_lane_rejected",
      `Application ${applicationId} is on the match lane and cannot enter the work pool`,
    );
  }

  // The shape stays open to a future `lane === null` for unverified
  // applications. Today the type forbids it; runtime checks both.
  // The cast through `unknown` keeps the strict type system honest
  // about a runtime invariant the compiler doesn't enforce.
  if ((lane as unknown) === undefined || (lane as unknown) === null) {
    throw new RouterError(
      "unverified_rejected",
      `Application ${applicationId} has not been verified and cannot enter the work pool`,
    );
  }

  // Idempotent: already in the pool as an exception → no-op.
  if (application.assignedAgentId === null && application.claimedAt === null) {
    return state;
  }

  const previousAssignee = application.assignedAgentId;
  const cleared: QueueApplication = {
    ...application,
    assignedAgentId: null,
    claimedAt: null,
  };
  const nextApplications = [...state.applications];
  nextApplications[index] = cleared;

  // A prior claim was cleared — log an override so the supervisor's
  // audit strip reflects the implicit return-to-pool.
  const auditEvents: AuditEvent[] = [...state.auditEvents];
  if (previousAssignee !== null) {
    auditEvents.push({
      id: `audit-${applicationId}-${now()}-${auditEvents.length}`,
      applicationId,
      actorId,
      eventType: "override",
      occurredAt: now(),
      metadata: { from: previousAssignee, to: null, source: "admit" },
    });
  }

  return {
    ...state,
    applications: nextApplications,
    auditEvents,
  };
}
