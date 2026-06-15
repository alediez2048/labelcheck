/**
 * /team — Team (P2-6; mockup.md "Team"; D15).
 *
 * Per-member performance table. One row per `role === "agent"`
 * member. The supervisor sees their week / month throughput, their
 * triage split as a rate bar, their average handling time, and can
 * edit specialization + availability inline. Both admin-gated writes
 * are passed straight through to the QueueProvider — the lib-layer
 * guard is the source of truth, the page is just the surface.
 *
 * Metric rows are derived per-agent from the parallel-agent-shipped
 * analytics selectors. The selector shape mirrors `metric_rollup`
 * (schema.md) so the production swap is "replace the in-memory
 * computation with a rollup read" — the page is unchanged.
 */

"use client";

import React, { useMemo } from "react";

import { TeamTable } from "@/components/team/TeamTable";
import { agentKpis, triageBreakdown } from "@/lib/analytics/metrics";
import { useQueue } from "@/lib/queue/QueueProvider";

export default function TeamPage(): React.ReactElement {
  const { state, setSpecialization, setAvailability } = useQueue();

  const rows = useMemo(() => {
    const agents = state.agents.filter((a) => a.role === "agent");
    return agents.map((agent) => {
      const weekKpis = agentKpis(state, agent.id, "week");
      const monthKpis = agentKpis(state, agent.id, "month");
      const triage = triageBreakdown(state, "month", agent.id);
      return {
        agent,
        weekKpis,
        monthKpis,
        triage,
        avgHandlingSec: monthKpis.avgHandlingSeconds,
      };
    });
  }, [state]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-600">
          Per-member throughput and outcomes. Edit specialization to retune the
          router — the next Distribute on Operations reflects the change.
        </p>
      </header>

      <div className="mt-6">
        <TeamTable
          rows={rows}
          onSetSpecialization={setSpecialization}
          onSetAvailability={setAvailability}
        />
      </div>
    </main>
  );
}
