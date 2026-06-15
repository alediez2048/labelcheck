/**
 * Queue-facade claim (P2-1 signature, P2-3 implementation).
 *
 * The route module in `app/(agent)/queue/page.tsx` consumes the
 * `claimNext(state, now?): { state, outcome }` signature; that
 * contract is locked. Internally this delegates to
 * `lib/router/claim.ts` so the routing policy lives in one place
 * (P2-3; D15).
 *
 * Outcome shape stays compatible: `{ ok: true, claimed }` or
 * `{ ok: false, reason: "agent_unavailable" | "no_eligible_pool_item" }`.
 * The agent page renders both branches; preserving the discriminator
 * means P2-3 doesn't touch the UI.
 */

import { claimNext as routerClaimNext } from "@/lib/router/claim";

import type { ClaimOutcome, QueueStoreState } from "./types";

export type ClaimResult = {
  state: QueueStoreState;
  outcome: ClaimOutcome;
};

export function claimNext(
  state: QueueStoreState,
  now: () => string = () => new Date().toISOString(),
): ClaimResult {
  const agent = state.agents.find((a) => a.id === state.currentAgentId);
  if (!agent) {
    return { state, outcome: { ok: false, reason: "no_eligible_pool_item" } };
  }
  if (agent.availability !== "available") {
    return { state, outcome: { ok: false, reason: "agent_unavailable" } };
  }

  const result = routerClaimNext(state, state.currentAgentId, { now });
  if (result === null) {
    // Agent is available (checked above) so a null here means no
    // eligible pool item — the only other failure path.
    return { state, outcome: { ok: false, reason: "no_eligible_pool_item" } };
  }

  return {
    state: result.state,
    outcome: { ok: true, claimed: result.application },
  };
}
