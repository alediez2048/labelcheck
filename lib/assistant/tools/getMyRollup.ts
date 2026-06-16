/**
 * The ONLY tool the read-only assistant can call (FR-30, D16).
 *
 * Returns a small JSON snapshot of the caller's role-scoped numbers:
 *   - Agent caller → that agent's own dispositions only (scope: self).
 *   - Admin caller → division-wide rollup (scope: division).
 *
 * Critical security invariant: the input has NO `agentId` parameter.
 * The caller is derived from the orchestrator-resolved context, NOT
 * from anything the model can put on the wire. A future agent
 * tempted to add an `agentId` is reintroducing the role-scope leak
 * the observability eval gates against — don't.
 *
 * Purity: this function does NO I/O. It builds a `QueueStoreState`
 * from the seed fixtures (the same fixtures the React provider
 * seeds with) and runs the analytics selectors over it. Production
 * swaps in a `metric_rollup` read from the DB; the signature does
 * not change.
 *
 * Prototype seam (mirrors P2-6's analytics layer): the production
 * read is `SELECT * FROM metric_rollup WHERE agent_id = :callerId`
 * for an Agent and `WHERE agent_id IS NULL` for an Admin. The
 * prototype computes the same shape on the fly because there is no
 * DB yet.
 */

import {
  agentKpis,
  divisionKpis,
} from "@/lib/analytics/metrics";
import {
  BASELINE_MATCH_RATE,
  SEED_AGENTS,
  SEED_APPLICATIONS,
  SEED_AUDIT_EVENTS,
  SEED_DISPOSITIONED_APPLICATIONS,
} from "@/lib/queue/fixtures";
import type { QueueStoreState } from "@/lib/queue/types";
import type { RollupSnapshot } from "@/types/assistant";

/**
 * Input shape advertised to the generator. Range is the only knob;
 * defaults to `month` when the model omits it.
 *
 * INTENTIONALLY no `agentId`: the caller is derived from `ctx`, not
 * from input. The model can ask for any range, but never for any
 * other user's data.
 */
export type GetMyRollupInput = {
  range?: "week" | "month";
};

/**
 * Server-side caller context — resolved from the active-agent seed
 * lookup in the route handler. The tool reads `callerAgentId` and
 * `callerRole`; the model never sees either.
 */
export type GetMyRollupContext = {
  callerAgentId: string;
  callerRole: "agent" | "admin";
};

/**
 * Build the live `QueueStoreState` view the analytics selectors
 * read against. Mirrors `INITIAL_STATE` in `lib/queue/QueueProvider.tsx`:
 * the server-side handler can't use the React provider, so this is
 * the documented prototype seam (production reads `metric_rollup`
 * straight from the DB and skips the selectors entirely).
 */
function buildState(): QueueStoreState {
  return {
    agents: SEED_AGENTS,
    applications: SEED_APPLICATIONS,
    dispositionedApplications: SEED_DISPOSITIONED_APPLICATIONS,
    currentAgentId: "",
    baselineMatchRate: BASELINE_MATCH_RATE,
    auditEvents: SEED_AUDIT_EVENTS,
  };
}

/**
 * Compute the role-scoped rollup snapshot.
 *
 * Approved / returned counts are derived from
 * `state.dispositionedApplications` — the same join the production
 * `metric_rollup` materialization runs against
 * `application × disposition`. The agent slice filters by
 * `disposition.decidedBy === callerAgentId`; the admin slice does
 * not filter (division-wide).
 */
export function getMyRollup(
  input: GetMyRollupInput,
  ctx: GetMyRollupContext,
): RollupSnapshot {
  const range: "week" | "month" = input.range ?? "month";
  const state = buildState();

  // Time-window filter mirrors `bucketsForRange` in
  // `lib/analytics/metrics.ts`. We rebuild it here rather than
  // importing the private helper so the rollup tool's surface is
  // self-contained (the analytics selectors are the public seam).
  const now = Date.now();
  const days = range === "week" ? 7 : 30;
  const startMs = now - days * 24 * 60 * 60 * 1000;
  const endMs = now;

  const inRange = (decidedAt: string): boolean => {
    const t = Date.parse(decidedAt);
    return t >= startMs && t < endMs;
  };

  if (ctx.callerRole === "agent") {
    const kpis = agentKpis(state, ctx.callerAgentId, range, now);
    const rows = state.dispositionedApplications.filter(
      (a) =>
        a.disposition.decidedBy === ctx.callerAgentId &&
        inRange(a.disposition.decidedAt),
    );
    return {
      range,
      processed: kpis.processed,
      matchCount: rows.filter((r) => r.verification.lane === "match").length,
      mismatchCount: rows.filter((r) => r.verification.lane === "mismatch").length,
      reviewCount: rows.filter((r) => r.verification.lane === "review").length,
      approvedCount: rows.filter((r) => r.status === "approved").length,
      returnedCount: rows.filter(
        (r) => r.status === "needs_correction" || r.status === "rejected",
      ).length,
      avgHandlingSeconds: Math.round(kpis.avgHandlingSeconds),
      scope: "self",
    };
  }

  // Admin → division-wide. Read every row in range, no `decidedBy`
  // filter. The supervisor's bulk-approve work IS counted here (it's
  // part of division throughput, just not part of any individual
  // agent's per-row throughput).
  const kpis = divisionKpis(state, range, now);
  const rows = state.dispositionedApplications.filter((a) =>
    inRange(a.disposition.decidedAt),
  );
  return {
    range,
    processed: kpis.processed,
    matchCount: rows.filter((r) => r.verification.lane === "match").length,
    mismatchCount: rows.filter((r) => r.verification.lane === "mismatch").length,
    reviewCount: rows.filter((r) => r.verification.lane === "review").length,
    approvedCount: rows.filter((r) => r.status === "approved").length,
    returnedCount: rows.filter(
      (r) => r.status === "needs_correction" || r.status === "rejected",
    ).length,
    avgHandlingSeconds: Math.round(kpis.avgHandlingSeconds),
    scope: "division",
  };
}
