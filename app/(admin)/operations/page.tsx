/**
 * /operations — Operations (Admin shell home, P2-2).
 *
 * The supervisor's day pulse. Three panels:
 *   1. Intake funnel — received → auto-verified (avg latency) →
 *      ready-to-approve → needs-review.
 *   2. Match-lane approval panel — aggregate review surface (FR-23)
 *      then a single "Approve all N" action (FR-20).
 *   3. Review distribution board — shared pool + per-agent load +
 *      Distribute action (P2-3 router stub).
 * Plus the live-intake feed at the bottom.
 *
 * Reads the same QueueProvider the Agent shell uses (mounted at the
 * root layout). A bulk-confirm here clears the match-lane fixtures
 * for the whole session; navigating to /queue afterwards shows the
 * same state.
 */

"use client";

import React from "react";

import { IntakeFunnel } from "@/components/operations/IntakeFunnel";
import { LiveIntakeFeed } from "@/components/operations/LiveIntakeFeed";
import { MatchLaneApprovalPanel } from "@/components/operations/MatchLaneApprovalPanel";
import { ReviewDistributionBoard } from "@/components/operations/ReviewDistributionBoard";
import { selectAggregateReview } from "@/lib/operations/aggregateReview";
import { selectDistribution } from "@/lib/operations/distribution";
import { selectFunnel } from "@/lib/operations/funnel";
import { selectLiveIntake } from "@/lib/operations/liveIntake";
import { DEFAULT_SUPERVISOR_ID } from "@/lib/queue/fixtures";
import { useQueue } from "@/lib/queue/QueueProvider";
import { distribute } from "@/lib/router/distribute";

export default function OperationsPage(): React.ReactElement {
  const { state, bulkApproveMatchLane } = useQueue();

  const funnel = selectFunnel(state);
  const aggregate = selectAggregateReview(state);
  const distribution = selectDistribution(state);
  const liveIntake = selectLiveIntake(state, 8);

  const supervisor = state.agents.find((a) => a.id === DEFAULT_SUPERVISOR_ID);

  function handleApproveAll(): void {
    bulkApproveMatchLane(DEFAULT_SUPERVISOR_ID);
  }

  function handleDistribute(): { pendingCount: number; applied: boolean } {
    return distribute(state);
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
          onDistribute={handleDistribute}
        />
      </div>

      <LiveIntakeFeed entries={liveIntake} />
    </main>
  );
}
