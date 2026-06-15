/**
 * Supervisor reassign (P2-3, D15).
 *
 * Move a claimed application from agent A to agent B, or return it to
 * the shared pool by passing `toAgentId === null`. The `from` must
 * match the current assignment — guards against a stale picker on the
 * distribution board reassigning the wrong owner.
 *
 * Semantics:
 *   - `toAgentId: string` → keep `claimedAt`; the hand-off preserves
 *     the "started at" timestamp (matches `handAssign` when the item
 *     was already claimed).
 *   - `toAgentId: null`   → clear both `assignedAgentId` and
 *     `claimedAt`; the item returns to the pool and the next claim
 *     resets the clock.
 *
 * Logs an `eventType: "override"` audit event with `{ from, to }` so
 * the supervisor strip and production's `audit_event` table can
 * reconstruct the chain of custody.
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

export function reassign(
  state: QueueStoreState,
  applicationId: string,
  fromAgentId: string,
  toAgentId: string | null,
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
  if (application.assignedAgentId !== fromAgentId) {
    throw new RouterError(
      "from_agent_mismatch",
      `Application ${applicationId} is not currently assigned to ${fromAgentId}`,
    );
  }

  const updated: QueueApplication =
    toAgentId === null
      ? { ...application, assignedAgentId: null, claimedAt: null }
      : { ...application, assignedAgentId: toAgentId };

  const nextApplications = [...state.applications];
  nextApplications[index] = updated;

  const auditEvents: AuditEvent[] = [
    ...state.auditEvents,
    {
      id: `audit-${applicationId}-${now()}-${state.auditEvents.length}`,
      applicationId,
      actorId: actor.id,
      eventType: "override",
      occurredAt: now(),
      metadata: { from: fromAgentId, to: toAgentId, source: "reassign" },
    },
  ];

  return {
    ...state,
    applications: nextApplications,
    auditEvents,
  };
}
