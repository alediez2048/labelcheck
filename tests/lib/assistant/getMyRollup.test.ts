/**
 * `get_my_rollup` tool tests (P4-2).
 *
 * Validates the role-scoped isolation invariant (D16,
 * observability.md):
 *   - Agent caller → counts filtered to `decidedBy === callerAgentId`,
 *     `scope: "self"`.
 *   - Admin caller → division-wide counts (no `decidedBy` filter),
 *     `scope: "division"`.
 *   - The tool input has NO `agentId` field. We exercise this at
 *     runtime by passing a "smuggled" property that the tool MUST
 *     ignore (the type wouldn't compile in production code, but the
 *     runtime test confirms the snapshot is keyed off `ctx`, not
 *     input).
 */

import { describe, expect, it } from "vitest";

import {
  getMyRollup,
  type GetMyRollupInput,
} from "@/lib/assistant/tools/getMyRollup";
import { SEED_DISPOSITIONED_APPLICATIONS } from "@/lib/queue/fixtures";

describe("getMyRollup", () => {
  it("returns the agent's own dispositions only when called as agent", () => {
    const snapshot = getMyRollup(
      { range: "month" },
      { callerAgentId: "agent-marcus", callerRole: "agent" },
    );

    expect(snapshot.scope).toBe("self");
    expect(snapshot.range).toBe("month");
    // Sanity: processed should be a non-negative integer.
    expect(snapshot.processed).toBeGreaterThanOrEqual(0);
    // The agent slice excludes admin-decided rows. The fixtures
    // include several `decidedBy: "agent-marcus"` rows.
    expect(snapshot.processed).toBeLessThanOrEqual(
      SEED_DISPOSITIONED_APPLICATIONS.length,
    );

    // Every count is non-negative and the lane sum equals processed.
    expect(snapshot.matchCount).toBeGreaterThanOrEqual(0);
    expect(snapshot.mismatchCount).toBeGreaterThanOrEqual(0);
    expect(snapshot.reviewCount).toBeGreaterThanOrEqual(0);
    expect(
      snapshot.matchCount + snapshot.mismatchCount + snapshot.reviewCount,
    ).toBe(snapshot.processed);
    expect(snapshot.approvedCount + snapshot.returnedCount).toBe(
      snapshot.processed,
    );
  });

  it("returns division-wide counts when called as admin", () => {
    const snapshot = getMyRollup(
      { range: "month" },
      { callerAgentId: "admin-sasha", callerRole: "admin" },
    );

    expect(snapshot.scope).toBe("division");
    // The division snapshot includes the admin's bulk-approve rows
    // and every agent's rows — it should be strictly >= the agent
    // slice.
    const agentSnapshot = getMyRollup(
      { range: "month" },
      { callerAgentId: "agent-marcus", callerRole: "agent" },
    );
    expect(snapshot.processed).toBeGreaterThanOrEqual(agentSnapshot.processed);
  });

  it("differs between agent caller and admin caller for the same range", () => {
    const agentSnapshot = getMyRollup(
      { range: "month" },
      { callerAgentId: "agent-marcus", callerRole: "agent" },
    );
    const adminSnapshot = getMyRollup(
      { range: "month" },
      { callerAgentId: "admin-sasha", callerRole: "admin" },
    );
    // The scopes diverge — the agent count is a strict subset of the
    // division count (the fixtures intentionally have multiple
    // decided-by ids).
    expect(adminSnapshot.processed).toBeGreaterThan(agentSnapshot.processed);
    expect(adminSnapshot.scope).not.toBe(agentSnapshot.scope);
  });

  it("defaults range to month when omitted", () => {
    const snapshot = getMyRollup(
      {},
      { callerAgentId: "agent-marcus", callerRole: "agent" },
    );
    expect(snapshot.range).toBe("month");
  });

  it("ignores a smuggled agentId on input — keyed off ctx, never input", () => {
    // GetMyRollupInput type does not accept agentId. We pass it
    // anyway via a cast to verify runtime behaviour: the snapshot
    // must reflect ctx.callerAgentId, not the smuggled value.
    const smuggled = {
      range: "month",
      agentId: "admin-sasha",
    } as unknown as GetMyRollupInput;

    const snapshot = getMyRollup(smuggled, {
      callerAgentId: "agent-marcus",
      callerRole: "agent",
    });

    // The agent slice for Marcus would be smaller than the admin's
    // division slice. If `agentId` had been honoured, this snapshot
    // would have admin's counts; instead it has Marcus's.
    expect(snapshot.scope).toBe("self");
    const adminSnapshot = getMyRollup(
      { range: "month" },
      { callerAgentId: "admin-sasha", callerRole: "admin" },
    );
    expect(snapshot.processed).toBeLessThan(adminSnapshot.processed);
  });
});
