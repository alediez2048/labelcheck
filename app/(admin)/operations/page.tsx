/**
 * /operations — Operations (Admin shell home, P2-2 + P2-3).
 *
 * The supervisor's day pulse. Three panels:
 *   1. Intake funnel — received → auto-verified (avg latency) →
 *      ready-to-approve → needs-review.
 *   2. Match-lane approval panel — aggregate review surface (FR-23)
 *      then a single "Approve all N" action (FR-20). Bulk-confirm
 *      bypasses the router entirely (D15; CONTEXT.md Work pool).
 *   3. Review distribution board — shared pool + per-agent load +
 *      Distribute, Hand-assign, and Reassign actions wired to the
 *      P2-3 work router via the QueueProvider.
 * Plus the live-intake feed at the bottom.
 *
 * The page is the only place that derives the per-section item
 * lists from the queue store. The board stays presentational and the
 * router lives behind the QueueProvider seam, so the route module is
 * the contract boundary between UI and routing policy (D15).
 */

"use client";

import React from "react";

import { IntakeFunnel } from "@/components/operations/IntakeFunnel";
import { LiveIntakeFeed } from "@/components/operations/LiveIntakeFeed";
import { MatchLaneApprovalPanel } from "@/components/operations/MatchLaneApprovalPanel";
import {
  ReviewDistributionBoard,
  type DistributionPoolItem,
} from "@/components/operations/ReviewDistributionBoard";
import { selectAggregateReview } from "@/lib/operations/aggregateReview";
import { selectDistribution } from "@/lib/operations/distribution";
import { selectFunnel } from "@/lib/operations/funnel";
import { selectLiveIntake } from "@/lib/operations/liveIntake";
import { DEFAULT_SUPERVISOR_ID } from "@/lib/queue/fixtures";
import { useQueue } from "@/lib/queue/QueueProvider";

export default function OperationsPage(): React.ReactElement {
  const {
    state,
    bulkApproveMatchLane,
    applyDistribute,
    handAssign,
    reassign,
    setSpecialization,
  } = useQueue();

  const funnel = selectFunnel(state);
  const aggregate = selectAggregateReview(state);
  const distribution = selectDistribution(state);
  const liveIntake = selectLiveIntake(state, 8);

  const supervisor = state.agents.find((a) => a.id === DEFAULT_SUPERVISOR_ID);

  // Pool items = exception apps with no assignee. Match-lane never
  // enters the pool (D15; CONTEXT.md Work pool).
  const poolItems: ReadonlyArray<DistributionPoolItem> = state.applications
    .filter(
      (a) =>
        a.assignedAgentId === null && a.verification.lane !== "match",
    )
    .map((a) => ({
      applicationId: a.applicationId,
      brand: a.brand,
      lane: a.verification.lane,
    }));

  // Claimed exception items keyed by agent id. Match-lane is excluded
  // because it bypasses the router and never gets an assignedAgentId.
  const claimedByAgent: Record<string, DistributionPoolItem[]> = {};
  for (const agent of state.agents) {
    if (agent.role !== "agent") continue;
    claimedByAgent[agent.id] = [];
  }
  for (const app of state.applications) {
    if (app.assignedAgentId === null) continue;
    if (app.verification.lane === "match") continue;
    const bucket = claimedByAgent[app.assignedAgentId];
    if (bucket === undefined) continue;
    bucket.push({
      applicationId: app.applicationId,
      brand: app.brand,
      lane: app.verification.lane,
    });
  }

  function handleApproveAll(): void {
    bulkApproveMatchLane(DEFAULT_SUPERVISOR_ID);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Operations</h1>
        <p className="mt-1 text-sm text-slate-600">
          {supervisor
            ? `Signed in as ${supervisor.name} · division supervisor`
            : "No supervisor selected"}
        </p>
      </header>

      <IntakeFunnel snapshot={funnel} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MatchLaneApprovalPanel
          snapshot={aggregate}
          onApproveAll={handleApproveAll}
        />
        <ReviewDistributionBoard
          snapshot={distribution}
          onDistribute={applyDistribute}
          onHandAssign={handAssign}
          onReassign={reassign}
          onSetSpecialization={setSpecialization}
          poolItems={poolItems}
          claimedByAgent={claimedByAgent}
        />
      </div>

      <LiveIntakeFeed entries={liveIntake} />
    </main>
  );
}
