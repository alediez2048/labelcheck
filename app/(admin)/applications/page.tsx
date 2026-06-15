/**
 * /applications — All Applications placeholder (P2-5; lands in P2-6).
 *
 * The Admin shell needs a navigable destination today so the sidebar
 * isn't a 404 trap; the full searchable, filterable table arrives in
 * P2-6 (mockup.md "All Applications"). Keeping the placeholder under
 * the new layout proves the route gate works end-to-end.
 */

"use client";

import React from "react";

export default function AllApplicationsPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          All Applications
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The full record across the division — coming in P2-6.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm text-slate-600">
          A searchable, filterable table of every application lands here in
          P2-6: filters for free-text search, status, date range, and assigned
          agent; columns for application id, beverage type, applicant, agent,
          status, and received date.
        </p>
      </section>
    </main>
  );
}
