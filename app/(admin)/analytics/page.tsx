/**
 * /analytics — Division dashboard (P2-6, mockup.md Analytics).
 *
 * Composes:
 *   - RangeToggle  — drives the whole view (week / month).
 *   - KpiCards     — processed, match rate, exception rate, hours saved.
 *   - VolumeTrend  — eight-week column-bar chart.
 *   - TriageDonut  — AI-lane breakdown (distinct from disposition).
 *   - TopMismatchReasons — failing-field share.
 *   - ThroughputByAgent  — per-agent processed count.
 *
 * Reads `state` off `useQueue()` so the selectors operate on the live
 * in-memory store. Production swaps the selectors for `metric_rollup`
 * reads without touching this page (the selector signatures + return
 * shapes are stable).
 */

"use client";

import React, { useMemo, useState } from "react";

import {
  divisionKpis,
  throughputByAgent,
  topMismatchReasons,
  triageBreakdown,
  volumeTrend,
} from "@/lib/analytics/metrics";
import type { AnalyticsRange } from "@/lib/analytics/types";
import { useQueue } from "@/lib/queue/QueueProvider";

import { KpiCards } from "@/components/analytics/KpiCards";
import { RangeToggle } from "@/components/analytics/RangeToggle";
import { ThroughputByAgent } from "@/components/analytics/ThroughputByAgent";
import { TopMismatchReasons } from "@/components/analytics/TopMismatchReasons";
import { TriageDonut } from "@/components/analytics/TriageDonut";
import { VolumeTrend } from "@/components/analytics/VolumeTrend";

export default function AnalyticsPage(): React.ReactElement {
  const { state } = useQueue();
  const [range, setRange] = useState<AnalyticsRange>("week");

  // One anchor moment so every selector sees the same `now`. Without
  // this, the seven selectors would each call `Date.now()` independently
  // and the dashboard would be very slightly inconsistent if the call
  // crossed a second boundary.
  const now = useMemo(() => Date.now(), []);

  const kpis = useMemo(
    () => divisionKpis(state, range, now),
    [state, range, now],
  );
  const trend = useMemo(() => volumeTrend(state, 8, now), [state, now]);
  const triage = useMemo(
    () => triageBreakdown(state, range, undefined, now),
    [state, range, now],
  );
  const mismatch = useMemo(
    () => topMismatchReasons(state, range, undefined, now),
    [state, range, now],
  );
  const throughput = useMemo(
    () => throughputByAgent(state, range, now),
    [state, range, now],
  );

  const rangeLabel = range === "week" ? "this week" : "this month";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Admin shell
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">
            Division dashboard — are we keeping up, and where do problems
            cluster?
          </p>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </header>

      <div className="mt-6 flex flex-col gap-6">
        <KpiCards snapshot={kpis} range={range} />

        <VolumeTrend
          buckets={trend}
          title="Volume trend (last 8 weeks)"
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TriageDonut
            breakdown={triage}
            title={`AI triage breakdown (${rangeLabel})`}
          />
          <TopMismatchReasons
            reasons={mismatch}
            title={`Top mismatch reasons (${rangeLabel})`}
          />
        </div>

        <ThroughputByAgent
          rows={throughput}
          title={`Throughput by agent (${rangeLabel})`}
        />
      </div>
    </main>
  );
}
