/**
 * /stats — My Stats (P2-6; mockup.md "My Stats"; D16 row-scoping).
 *
 * The per-agent slice of Analytics. Every selector takes
 * `currentAgent.id` so an agent can never see another agent's
 * numbers (D16; FR-29). The agent-shell layout already gates
 * non-agent actors out; the `currentAgent` guard below is the
 * defense-in-depth — if hydration races or the role switcher
 * lands mid-render, the page degrades to a clear notice rather
 * than rendering the supervisor's view.
 *
 * Composes the shared analytics components (KPI cards, donut, range
 * toggle) the parallel agent ships, plus a small recent-decisions
 * list rendered locally because it's the only surface specific to
 * this page.
 */

"use client";

import React, { useMemo, useState } from "react";

import { KpiCards } from "@/components/analytics/KpiCards";
import { RangeToggle } from "@/components/analytics/RangeToggle";
import { TriageDonut } from "@/components/analytics/TriageDonut";
import {
  agentKpis,
  recentDecisions,
  triageBreakdown,
} from "@/lib/analytics/metrics";
import type { AnalyticsRange } from "@/lib/analytics/types";
import { useQueue } from "@/lib/queue/QueueProvider";
import type { Disposition } from "@/types";

const DISPOSITION_TREATMENT: Readonly<
  Record<Disposition, { label: string; icon: string; pillClass: string }>
> = {
  approve: {
    label: "Approved",
    icon: "✓",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  return_for_correction: {
    label: "Returned",
    icon: "↩",
    pillClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

function relative(now: number, iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diff = now - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) {
    const m = Math.max(1, Math.round(diff / minute));
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const h = Math.round(diff / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.round(diff / day);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function MyStatsPage(): React.ReactElement {
  const { state, currentAgent } = useQueue();
  const [range, setRange] = useState<AnalyticsRange>("week");

  const isAgent = currentAgent !== undefined && currentAgent.role === "agent";

  const kpis = useMemo(
    () => (isAgent ? agentKpis(state, currentAgent!.id, range) : null),
    [state, currentAgent, isAgent, range],
  );
  const triage = useMemo(
    () =>
      isAgent ? triageBreakdown(state, range, currentAgent!.id) : null,
    [state, currentAgent, isAgent, range],
  );
  const recent = useMemo(
    () => (isAgent ? recentDecisions(state, currentAgent!.id, 8) : []),
    [state, currentAgent, isAgent],
  );

  if (!isAgent) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">My Stats</h1>
        <p className="mt-2 text-sm text-slate-600">
          No agent selected. Use the role switcher to sign in as an agent.
        </p>
      </main>
    );
  }

  const now = Date.now();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Agent shell
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">My Stats</h1>
          <p className="mt-1 text-sm text-slate-600">
            {currentAgent!.name} — your personal dashboard.
          </p>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </header>

      <section aria-label="Personal KPIs" className="mt-6">
        {kpis !== null && (
          <KpiCards snapshot={kpis} range={range} hoursSavedHidden={true} />
        )}
      </section>

      <section aria-label="Your triage outcomes" className="mt-6">
        {triage !== null && (
          <TriageDonut breakdown={triage} title="Your triage outcomes" />
        )}
      </section>

      <section
        aria-labelledby="recent-decisions-heading"
        className="mt-8 rounded-lg border border-slate-200 bg-white p-5"
      >
        <header className="border-b border-slate-100 pb-3">
          <h2
            id="recent-decisions-heading"
            className="text-base font-semibold text-slate-800"
          >
            Recent decisions
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Your eight most recent dispositions.
          </p>
        </header>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            No decisions recorded yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {recent.map((r) => {
              const treatment = DISPOSITION_TREATMENT[r.disposition];
              return (
                <li
                  key={r.applicationId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {r.brand}
                    </p>
                    <p className="text-xs text-slate-500">
                      {relative(now, r.decidedAt)}
                    </p>
                  </div>
                  <span
                    aria-label={`Disposition: ${treatment.label}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${treatment.pillClass}`}
                  >
                    <span aria-hidden="true">{treatment.icon}</span>
                    <span>{treatment.label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
