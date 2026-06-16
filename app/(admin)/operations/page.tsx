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

import React, { useState } from "react";

import { SubmitBatchButton } from "@/components/batch/SubmitBatchButton";
import { UploadPdfButton } from "@/components/intake/UploadPdfButton";
import { AgreementRateWidget } from "@/components/feedback/AgreementRateWidget";
import { IntakeFunnel } from "@/components/operations/IntakeFunnel";
import { LiveIntakeFeed } from "@/components/operations/LiveIntakeFeed";
import { MatchLaneApprovalPanel } from "@/components/operations/MatchLaneApprovalPanel";
import {
  ReviewDistributionBoard,
  type DistributeSummary,
  type DistributionPoolItem,
} from "@/components/operations/ReviewDistributionBoard";
import { selectAggregateReview } from "@/lib/operations/aggregateReview";
import { selectDistribution } from "@/lib/operations/distribution";
import { selectFunnel } from "@/lib/operations/funnel";
import { selectLiveIntake } from "@/lib/operations/liveIntake";
import { useQueue } from "@/lib/queue/QueueProvider";

/**
 * Empty summary shape returned to the board when `applyDistribute`
 * fails (e.g. the lib-layer `requireAdmin` refuses). Keeps the
 * `ReviewDistributionBoard` prop type stable across the ok/error
 * wrapper that the provider now uses.
 */
const EMPTY_DISTRIBUTE_SUMMARY: DistributeSummary = {
  assignedCount: 0,
  byAgentId: {},
  specialistMatches: 0,
  overflowMatches: 0,
  applied: true,
};

export default function OperationsPage(): React.ReactElement {
  const {
    state,
    currentAgent,
    bulkApproveMatchLane,
    applyDistribute,
    handAssign,
    reassign,
    setSpecialization,
  } = useQueue();
  const [actionError, setActionError] = useState<string | null>(null);

  const funnel = selectFunnel(state);
  const aggregate = selectAggregateReview(state);
  const distribution = selectDistribution(state);
  const liveIntake = selectLiveIntake(state, 8);

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
    setActionError(null);
    const result = bulkApproveMatchLane();
    if (!result.ok) {
      setActionError(`Bulk-approve failed: ${result.error}`);
    }
  }

  /**
   * Adapter so the board's `onDistribute` keeps its `() => DistributeSummary`
   * shape. The provider now returns `{ ok, summary | error }`; on failure we
   * surface the error inline and hand the board a zeroed summary so the
   * existing notice copy ("Routed N exception(s)…") still renders sensibly.
   */
  function handleDistribute(): DistributeSummary {
    setActionError(null);
    const result = applyDistribute();
    if (result.ok) {
      return result.summary;
    }
    setActionError(`Distribute failed: ${result.error}`);
    return EMPTY_DISTRIBUTE_SUMMARY;
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Operations</h1>
        <p className="mt-1 text-sm text-slate-600">
          {currentAgent
            ? `Signed in as ${currentAgent.name} · division supervisor`
            : "No supervisor selected"}
        </p>
      </header>

      {actionError !== null && (
        <p
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="mr-1 font-bold">
            ✕
          </span>
          {actionError}
        </p>
      )}

      <section
        aria-labelledby="upload-pdfs-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <header>
          <h2
            id="upload-pdfs-heading"
            className="text-base font-semibold text-slate-800"
          >
            Upload TTB COLA PDFs
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Drop one or more TTB COLA PDFs. The browser extracts the form
            fields and renders the label page, then submits the batch for
            verification — match / mismatch / review per application.
          </p>
        </header>
        <div className="mt-4">
          <UploadPdfButton />
        </div>
      </section>

      <section
        aria-labelledby="batch-intake-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <header>
          <h2
            id="batch-intake-heading"
            className="text-base font-semibold text-slate-800"
          >
            Synthetic demo batch (P3-1)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Loads canned synthetic applications including the three known
            defect cases (AC-2 ABV mismatch, AC-3 title-case warning,
            AC-4 net-contents mismatch) so you can demo mismatches
            deterministically without uploading PDFs.
          </p>
        </header>
        <div className="mt-4">
          <SubmitBatchButton />
        </div>
      </section>

      <AgreementRateWidget />

      <IntakeFunnel snapshot={funnel} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MatchLaneApprovalPanel
          snapshot={aggregate}
          onApproveAll={handleApproveAll}
        />
        <ReviewDistributionBoard
          snapshot={distribution}
          onDistribute={handleDistribute}
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
