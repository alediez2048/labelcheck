/**
 * /analytics — Analytics placeholder (P2-5; lands in P2-6).
 *
 * The division dashboard — KPIs, throughput, lane breakdown — lives
 * here in P2-6. The placeholder reserves the route so the Admin
 * sidebar nav is wired end-to-end and the route gate is exercised on
 * a real path.
 */

"use client";

import React from "react";

export default function AnalyticsPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-600">
          The division dashboard — coming in P2-6.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm text-slate-600">
          KPI cards (applications processed, match rate, combined
          mismatch-and-review rate, average handling time, hours saved), a
          volume trend, a triage-breakdown donut, top-mismatch-reasons, and
          throughput by agent — all driven by the same metric rollups as the
          Team view.
        </p>
      </section>
    </main>
  );
}
