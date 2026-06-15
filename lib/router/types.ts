/**
 * Router contract (P2-3).
 *
 * The work router is the single coordination point for exception-lane
 * applications (D15; CONTEXT.md Work pool). Five pure operations live
 * in `lib/router/*` and share the contract types declared here.
 *
 * Naming mirrors `schema.md` so the production persistence layer in
 * P6-2 can swap the in-memory store for a database without rewriting
 * the call sites:
 *   - `application.assigned_agent_id`  ↔  `QueueApplication.assignedAgentId`
 *   - `application.claimed_at`          ↔  `QueueApplication.claimedAt`
 *   - `audit_event.event_type`          ↔  `AuditEvent.eventType`
 *
 * The selection strategy is a parameter so P2-4 (specialization-aware
 * pull) drops in a new function body without touching `claim.ts`.
 */

import type {
  QueueAgent,
  QueueApplication,
  QueueStoreState,
} from "@/lib/queue/types";

/**
 * Actor performing a router operation. Hand-assign and reassign are
 * admin-only; claim is agent-only. The role-switcher in P2-5 fills the
 * actor in for real; until then the supervisor id is fixed.
 */
export type AssignActor = {
  id: string;
  role: "agent" | "admin";
};

/**
 * Successful claim result — the router's internal shape. The queue
 * facade in `lib/queue/claimNext.ts` wraps this back into the
 * `{ ok, claimed | reason }` outcome the agent page consumes.
 */
export type ClaimSuccess = {
  application: QueueApplication;
  state: QueueStoreState;
};

/**
 * Summary returned from `distribute`. `applied: true` discriminates the
 * real router run from the P2-2 stub's `applied: false`; the Operations
 * view uses it to show the "router applied N" toast vs the
 * "queued for P2-3 router" badge.
 */
export type DistributeSummary = {
  assignedCount: number;
  byAgentId: Record<string, number>;
  applied: true;
};

/**
 * Selection strategy — picks the next pool item for an agent. The
 * P2-3 default is FIFO over (lane, receivedAt); P2-4 swaps in a
 * specialization-aware version that uses `agent.specializations`.
 *
 * Returning `null` means "this agent has nothing eligible right now"
 * — distribute moves on, claim returns `no_eligible_pool_item`.
 */
export type SelectFromPoolStrategy = (
  pool: ReadonlyArray<QueueApplication>,
  agent: QueueAgent,
) => QueueApplication | null;

/**
 * Codes for router-side failures. Internal callers branch on `code`;
 * the provider surfaces `message` to the operator. The split keeps the
 * UI copy out of the router and the router's invariants out of the UI.
 */
export type RouterErrorCode =
  | "match_lane_rejected"
  | "unverified_rejected"
  | "not_admin"
  | "from_agent_mismatch"
  | "agent_unavailable"
  | "no_eligible_pool_item"
  | "application_not_found";

export class RouterError extends Error {
  public readonly code: RouterErrorCode;

  constructor(code: RouterErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RouterError";
  }
}
