/**
 * /knowledge-base — Knowledge Base placeholder (P2-5; lands in P4-1).
 *
 * The retrieval-grounded corpus the assistant cites lives here in
 * P4-1. Today the page only reserves the route so the Admin sidebar
 * doesn't 404 and reviewers can see the production-shape navigation.
 */

"use client";

import React from "react";

export default function KnowledgeBasePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The corpus the assistant cites — coming in P4-1.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm text-slate-600">
          An upload dropzone (PDF, DOCX, Markdown, TXT) above a table of
          indexed documents with topic, chunk count, indexing status, and
          last-updated time. The assistant answers only from these sources,
          versioned and auditable.
        </p>
      </section>
    </main>
  );
}
