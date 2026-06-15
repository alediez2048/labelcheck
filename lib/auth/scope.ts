/**
 * Auth scope helpers (P2-5, D16).
 *
 * Centralises the "is this caller allowed to run an admin operation"
 * predicate. The router modules (`handAssign`, `reassign`,
 * `setSpecialization`, `distribute`) previously each carried an inline
 * `actor.role !== "admin"` check; that's an N-place predicate, and a
 * future "audit who tried what" path would have to touch every site.
 * One helper here means one change there.
 *
 * The QueueProvider derives an `Actor` from the active agent via
 * `actorFromAgent` — no module-level "current actor" store exists.
 * `state.currentAgentId` + `state.agents` is the source of truth (D16
 * row-scoping is keyed off the same field). The role-switcher's
 * production swap (PIV/CAC + SSO, NFR-8) replaces only the binding of
 * `currentAgentId`; the helpers here are unchanged.
 */

import type { QueueAgent } from "@/lib/queue/types";
import { RouterError } from "@/lib/router/types";

/**
 * The caller of an admin-gated operation. Two effective roles only
 * (D16; schema.md `agent.role` trimmed enum) — `agent` and `admin`. No
 * third role anywhere in code.
 */
export type Actor = {
  id: string;
  role: "agent" | "admin";
};

/**
 * Throws `RouterError("not_admin", ...)` when the actor is not an
 * admin. The router modules call this in lieu of an inline role check
 * so the gate's predicate has one definition. A future audit-on-deny
 * hook is a single addition here.
 */
export function requireAdmin(actor: Actor): void {
  if (actor.role !== "admin") {
    throw new RouterError(
      "not_admin",
      `Admin role required; got "${actor.role}"`,
    );
  }
}

/**
 * Build an `Actor` from a `QueueAgent`. Lets the QueueProvider derive
 * the caller from the active agent without re-exposing the agent's
 * shape to the router or the lib/auth layer.
 */
export function actorFromAgent(agent: QueueAgent): Actor {
  return { id: agent.id, role: agent.role };
}
