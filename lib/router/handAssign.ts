/**
 * Supervisor hand-assign (P2-3, D15).
 *
 * A supervisor can drop a pool item — or take a claimed item — and
 * place it on a specific agent's worklist. Match-lane rows are
 * rejected (the bulk-confirm path on Operations is the only path that
 * touches them, FR-28).
 *
 * Semantics:
 *   - Previously unclaimed → set both `assignedAgentId` and `claimedAt`
 *     so the agent's queue sort treats it like a fresh claim.
 *   - Previously claimed   → set `assignedAgentId`, KEEP `claimedAt` so
 *     the hand-off preserves the "started at" timestamp (the supervisor
 *     is reassigning ownership, not restarting the clock).
 *
 * Admin-only — non-admin actors throw. The role-switcher in P2-5 will
 * wire the actor into the provider; today the supervisor id is fixed.
 */

import { requireAdmin } from "@/lib/auth/scope";
import type {
  AuditEvent,
  QueueApplication,
  QueueStoreState,
} from "@/lib/queue/types";

import { AssignActor, RouterError } from "./types";

type Options = {
  now?: () => string;
};

export function handAssign(
  state: QueueStoreState,
  applicationId: string,
  agentId: string,
  actor: AssignActor,
  options: Options = {},
): QueueStoreState {
  requireAdmin(actor);

  const now = options.now ?? (() => new Date().toISOString());

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
  if (application.verification.lane === "match") {
    throw new RouterError(
      "match_lane_rejected",
      `Application ${applicationId} is on the match lane and cannot be hand-assigned`,
    );
  }

  const previousAssignee = application.assignedAgentId;
  const wasUnclaimed = previousAssignee === null;

  const updated: QueueApplication = {
    ...application,
    assignedAgentId: agentId,
    claimedAt: wasUnclaimed ? now() : application.claimedAt,
  };

  const nextApplications = [...state.applications];
  nextApplications[index] = updated;

  const auditEvents: AuditEvent[] = [
    ...state.auditEvents,
    {
      id: `audit-${applicationId}-${now()}-${state.auditEvents.length}`,
      applicationId,
      actorId: actor.id,
      eventType: "assigned",
      occurredAt: now(),
      metadata: {
        actorRole: actor.role,
        previousAssignee,
        source: "handAssign",
      },
    },
  ];

  return {
    ...state,
    applications: nextApplications,
    auditEvents,
  };
}
