/**
 * /applications — All Applications (P2-6; mockup.md "All Applications").
 *
 * The full record. Filter the union of open work + dispositioned
 * history by free text, status, date range, and assigned agent. Owns
 * the filter state via `useState`; the table is recomputed from the
 * pure selector on every render — no effect, no stale read.
 *
 * Row-scoping is intentionally absent: this is the supervisor's
 * global record (D16; CONTEXT.md). The route-group layout gates
 * non-admin actors out before this page renders.
 */

"use client";

import React, { useMemo, useState } from "react";

import { ApplicationsFilters } from "@/components/applications/ApplicationsFilters";
import { ApplicationsTable } from "@/components/applications/ApplicationsTable";
import {
  filterApplications,
  type ApplicationFilterInput,
} from "@/lib/applications/filter";
import { useQueue } from "@/lib/queue/QueueProvider";

const INITIAL_FILTER: ApplicationFilterInput = {
  search: "",
  statuses: [],
  range: "all_time",
  assignedAgentIds: [],
};

export default function AllApplicationsPage(): React.ReactElement {
  const { state } = useQueue();
  const [filter, setFilter] = useState<ApplicationFilterInput>(INITIAL_FILTER);

  const rows = useMemo(() => filterApplications(state, filter), [state, filter]);

  // Surface only seeded `role === "agent"` agents in the filter so
  // the supervisor isn't shown as an option for "assigned agent".
  const agents = useMemo(
    () =>
      state.agents
        .filter((a) => a.role === "agent")
        .map((a) => ({ id: a.id, name: a.name })),
    [state.agents],
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          All Applications
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The full record across the division — open work and history.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-6">
        <ApplicationsFilters
          value={filter}
          onChange={setFilter}
          agents={agents}
          resultCount={rows.length}
        />
        <ApplicationsTable rows={rows} />
      </div>
    </main>
  );
}
