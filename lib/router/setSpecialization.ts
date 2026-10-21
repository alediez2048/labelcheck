/**
 * Admin-only specialization mutation.
 *
 * The supervisor edits an agent's `specializations` from the Team view
 * (wraps this in the full editor; lands the data path). The
 * operation is admin-gated — D16 makes specialization an admin-assigned
 * attribute; an agent cannot self-assign.
 *
 * Currently-claimed items are NOT touched. Yanking an in-progress
 * disposition mid-flight would lose context; the supervisor uses
 * `reassign` when they explicitly want to move work between
 * agents. Re-routing on edit is the documented anti-pattern.
 *
 * Audit: emits `eventType: "override"` (the existing audit-event vocab
 * uses "override" for any admin override of routing state — same shape
 * as `reassign` and `admitToPool`). Metadata captures the before/after
 * arrays so the supervisor strip and production's `audit_event` table
 * can reconstruct the change.
 */

import type { BeverageType } from "@/types";

import { requireAdmin } from "@/lib/auth/scope";
import type {
  AuditEvent,
  QueueAgent,
  QueueStoreState,
} from "@/lib/queue/types";

import { AssignActor, RouterError } from "./types";

type Options = {
  now?: () => string;
};

export function setSpecialization(
  state: QueueStoreState,
  agentId: string,
  types: ReadonlyArray<BeverageType>,
  actor: AssignActor,
  options: Options = {},
): QueueStoreState {
  requireAdmin(actor);

  const now = options.now ?? (() => new Date().toISOString());

  const index = state.agents.findIndex((a) => a.id === agentId);
  if (index === -1) {
    throw new RouterError(
      "agent_not_found",
      `Agent ${agentId} not found in store`,
    );
  }

  const previous = state.agents[index]!;
  const previousSpecializations: ReadonlyArray<BeverageType> = Array.from(
    previous.specializations,
  );
  const newSpecializations: ReadonlyArray<BeverageType> = Array.from(types);

  const updatedAgent: QueueAgent = {
    ...previous,
    specializations: newSpecializations,
  };

  const nextAgents = [...state.agents];
  nextAgents[index] = updatedAgent;

  const occurredAt = now();
  const auditEvents: AuditEvent[] = [
    ...state.auditEvents,
    {
      id: `audit-${agentId}-${occurredAt}-${state.auditEvents.length}`,
      // Specialization edits are agent-scoped, not application-scoped.
      // We reuse the audit shape (which requires an applicationId) by
      // pointing at the agent id — the schema column carries an opaque
      // string and the supervisor strip filters on `eventType`. The
      // production migration later will widen `audit_event` to cover
      // agent-scoped events explicitly.
      applicationId: agentId,
      actorId: actor.id,
      eventType: "override",
      occurredAt,
      metadata: {
        actorRole: actor.role,
        previousSpecializations,
        newSpecializations,
        source: "setSpecialization",
      },
    },
  ];

  return {
    ...state,
    agents: nextAgents,
    auditEvents,
  };
}
