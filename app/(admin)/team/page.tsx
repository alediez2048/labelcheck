/**
 * /team — Team placeholder (P2-5; lands in P2-6).
 *
 * Per-member performance + the specialization editor land here in
 * P2-6. The specialization editor already exists inline on the
 * Operations review-distribution board (P2-4); this page will
 * eventually surface the same control alongside the per-agent
 * throughput table.
 */

"use client";

import React from "react";

export default function TeamPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-600">
          Per-member performance and specialization — coming in P2-6.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm text-slate-600">
          A table of each team member with applications completed this week
          and this month, their match / mismatch / review split as a rate bar,
          average handling time, and a Specialization column with an Edit
          control. The specialization editor is already wired on Operations;
          this page will reuse it.
        </p>
      </section>
    </main>
  );
}
