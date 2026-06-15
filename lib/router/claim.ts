/**
 * Atomic claim (P2-3, FR-28, D15, CONTEXT.md Claim).
 *
 * Picks the next eligible pool item for an agent and sets
 * `assignedAgentId` + `claimedAt` in one synchronous step. The
 * selection step is a strategy parameter — `selectFifo` is the P2-3
 * default; P2-4 swaps in a specialization-aware version without
 * touching the call site.
 *
 * Availability is the only soft-fail: an `out_of_office` agent gets
 * `null` back rather than a thrown error, because the UI's
 * Get-next button doesn't need to differentiate "you're OOO" from
 * "pool is empty" — both render as "nothing to claim right now".
 *
 * Every successful claim appends an `eventType: "assigned"` audit
 * event so the supervisor's recent-activity strip reflects the pull.
 */

import type {
  AuditEvent,
  QueueApplication,
  QueueStoreState,
} from "@/lib/queue/types";

import { selectFifo } from "./selectFifo";
import type { ClaimSuccess, SelectFromPoolStrategy } from "./types";

type Options = {
  now?: () => string;
  strategy?: SelectFromPoolStrategy;
};

export function claimNext(
  state: QueueStoreState,
  agentId: string,
  options: Options = {},
): ClaimSuccess | null {
  const now = options.now ?? (() => new Date().toISOString());
  const strategy = options.strategy ?? selectFifo;

  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  if (agent.availability !== "available") return null;

  const pool = state.applications.filter(
    (a) => a.assignedAgentId === null && a.verification.lane !== "match",
  );
  if (pool.length === 0) return null;

  const target = strategy(pool, agent);
  if (target === null) return null;

  const claimedAt = now();
  const claimed: QueueApplication = {
    ...target,
    assignedAgentId: agentId,
    claimedAt,
  };

  const index = state.applications.findIndex(
    (a) => a.applicationId === target.applicationId,
  );
  if (index === -1) return null;

  const nextApplications = [...state.applications];
  nextApplications[index] = claimed;

  const auditEvents: AuditEvent[] = [
    ...state.auditEvents,
    {
      id: `audit-${claimed.applicationId}-${claimedAt}-${state.auditEvents.length}`,
      applicationId: claimed.applicationId,
      actorId: agentId,
      eventType: "assigned",
      occurredAt: claimedAt,
      metadata: { actorRole: agent.role, source: "claim" },
    },
  ];

  return {
    application: claimed,
    state: { ...state, applications: nextApplications, auditEvents },
  };
}
