/**
 * Citation — small footer chip that names one KB source the assistant
 * relied on for an answer (P4-2; FR-31; observability.md groundedness).
 *
 * The chip is the user-visible half of the groundedness contract: every
 * KB-backed claim shows where it came from, by filename and version, so
 * the user can trace the answer back to a document they can re-read.
 * Slate-with-indigo-accent matches the Knowledge Base tab's per-source
 * row treatment — the citation feels like a direct pointer at the same
 * row a Knowledge Base admin would manage.
 *
 * The component is presentational only: it never fetches, never opens a
 * detail view. P4-3 may add an "open source" affordance; this scope
 * stops at naming the source clearly.
 */

"use client";

import React from "react";

import type { Citation as CitationType } from "@/types/assistant";

type Props = {
  citation: CitationType;
};

export function Citation({ citation }: Props): React.ReactElement {
  // Tooltip carries the topic + title so a hover/long-press reveals
  // the human-readable context without crowding the chip. The chip
  // body itself stays compact: filename in brackets + version badge.
  const tooltip = `${citation.topic} — ${citation.title}`;

  return (
    <span
      title={tooltip}
      aria-label={`Source: ${citation.sourceFilename}, version ${citation.version}, topic ${citation.topic}`}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
    >
      <span aria-hidden="true" className="text-slate-400">
        [
      </span>
      <span className="font-mono">{citation.sourceFilename}</span>
      <span aria-hidden="true" className="text-slate-400">
        ]
      </span>
      <span
        aria-hidden="true"
        className="rounded-sm border border-indigo-200 bg-indigo-50 px-1 font-mono text-[10px] font-semibold text-indigo-800"
      >
        v{citation.version}
      </span>
    </span>
  );
}
