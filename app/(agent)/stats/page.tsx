/**
 * /stats — My Stats placeholder (P2-5; lands in P2-6).
 *
 * The per-agent slice of Analytics. Reserved today so the Agent
 * sidebar nav is wired end-to-end; the real KPI cards + recent
 * decisions list land in P2-6, sharing the same metric rollups as
 * the Admin Team view (row-scoped to the active agent id per D16).
 */

"use client";

import React from "react";

import { useQueue } from "@/lib/queue/QueueProvider";

export default function MyStatsPage(): React.ReactElement {
  const { currentAgent } = useQueue();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Agent shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">My Stats</h1>
        <p className="mt-1 text-sm text-slate-600">
          {currentAgent
            ? `${currentAgent.name}'s personal dashboard — coming in P2-6.`
            : "Your personal dashboard — coming in P2-6."}
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm text-slate-600">
          KPI cards (completed this week / month, match rate, average handling
          time), your outcome split as a rate bar against the division
          average, and a list of your recent decisions. Same metric rollups as
          the Admin Team view, scoped to you.
        </p>
      </section>
    </main>
  );
}
