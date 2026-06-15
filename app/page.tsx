"use client";

import { useRouter } from "next/navigation";
import React from "react";

import { useQueue } from "@/lib/queue/QueueProvider";

const ADMIN_DEMO_ID = "admin-sasha";
const AGENT_DEMO_ID = "agent-marcus";

/**
 * Landing page — the three entry points the reviewer can exercise.
 *
 * Each tile is a "switch identity + navigate" action because the
 * (admin) and (agent) layouts redirect cross-shell visits based on
 * the active actor's role. A plain `<Link>` to `/operations` would
 * bounce a default-agent actor straight back to `/queue`; the click
 * handler here sets the right actor first so the destination
 * actually loads.
 */
export default function Page(): React.ReactElement {
  const router = useRouter();
  const { setCurrentAgentId } = useQueue();

  function go(agentId: string, destination: string): void {
    setCurrentAgentId(agentId);
    router.push(destination);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-10">
      <h1 className="text-4xl font-bold text-slate-900">LabelCheck</h1>
      <p className="mt-3 text-base text-slate-600">
        TTB COLA AI-enabled alcohol label verification — three entry points.
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        <li>
          <button
            type="button"
            onClick={() => router.push("/verify")}
            className="flex w-full flex-col items-start gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-left hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <span className="text-base font-semibold text-emerald-900">
              Verify an application →
            </span>
            <span className="text-sm text-emerald-800">
              Single-application demo path (Phase 1). Submit a sample, see the lane and
              the per-field breakdown.
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => go(ADMIN_DEMO_ID, "/operations")}
            className="flex w-full flex-col items-start gap-1 rounded-lg border border-indigo-300 bg-indigo-50 p-5 text-left hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <span className="text-base font-semibold text-indigo-900">
              Admin shell — Operations →
            </span>
            <span className="text-sm text-indigo-800">
              Supervisor view (Phase 2). Funnel, match-lane bulk-confirm, distribution
              board, All Applications, Analytics, Team. Lands you as the supervisor; use
              the sidebar role switcher to swap identities.
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => go(AGENT_DEMO_ID, "/queue")}
            className="flex w-full flex-col items-start gap-1 rounded-lg border border-slate-300 bg-white p-5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <span className="text-base font-semibold text-slate-900">
              Agent shell — My Queue →
            </span>
            <span className="text-sm text-slate-600">
              Agent view (Phase 2). Claimed exceptions sorted problems-first, Get-next
              pull from the shared pool, review detail with auto-advance. Lands you as
              an agent.
            </span>
          </button>
        </li>
      </ul>

      <p className="mt-8 text-xs text-slate-500">
        Phase 2 complete (P2-1 through P2-6). 274 tests, 11 routes. Phase 3 begins with
        batch intake (P3-1).
      </p>
    </main>
  );
}
