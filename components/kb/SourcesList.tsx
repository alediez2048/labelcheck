/**
 * SourcesList — per-source status table for the Knowledge Base tab
 * (P4-1).
 *
 * Every row carries the four things the admin actually needs at a
 * glance: what was uploaded (filename + inferred topic), where it is
 * in the pipeline (status pill, NFR-2: colour + icon + text), how
 * much of it is now indexed (chunk count), and who put it there
 * (uploaded by, uploaded when). The "Replace with new version"
 * affordance is per-row because the mental model is "this thing is
 * stale, swap it" — not "go to a separate menu to upload."
 *
 * The replace action only sets a UI hint on the parent page (scroll
 * + caption); the actual version bump happens server-side when a
 * file with a matching filename re-enters the ingestion pipeline.
 * That keeps the prototype's "filename = identity" rule honest
 * without a second code path.
 *
 * The empty state copy is deliberate: it names every supported
 * format up front so an admin landing on a fresh deploy knows what
 * the corpus can accept without reading the upload caption.
 */

"use client";

import React from "react";

import type {
  IngestStatus,
  KnowledgeBaseSource,
} from "@/types/kb";

type Props = {
  sources: ReadonlyArray<KnowledgeBaseSource>;
  onReplaceClick: (sourceFilename: string) => void;
};

export function SourcesList({
  sources,
  onReplaceClick,
}: Props): React.ReactElement {
  if (sources.length === 0) {
    return (
      <section
        aria-labelledby="kb-sources-heading"
        className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center"
      >
        <h2
          id="kb-sources-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600"
        >
          Indexed documents
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          No documents yet. Upload a PDF, DOCX, Markdown, or TXT to get started.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="kb-sources-heading"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <header className="border-b border-slate-200 px-4 py-3">
        <h2
          id="kb-sources-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600"
        >
          Indexed documents
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {sources.length} {sources.length === 1 ? "source" : "sources"}. The
          assistant cites only from this list.
        </p>
      </header>
      <ul role="list" className="divide-y divide-slate-200">
        {sources.map((source) => (
          <SourceRow
            key={`${source.sourceFilename}@v${source.version}`}
            source={source}
            onReplaceClick={onReplaceClick}
          />
        ))}
      </ul>
    </section>
  );
}

function SourceRow({
  source,
  onReplaceClick,
}: {
  source: KnowledgeBaseSource;
  onReplaceClick: (sourceFilename: string) => void;
}): React.ReactElement {
  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-semibold text-slate-900">
          {source.sourceFilename}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          Topic: <span className="text-slate-700">{source.topic}</span>
          <span aria-hidden="true"> · </span>
          Uploaded by{" "}
          <span className="text-slate-700">{source.uploadedBy}</span>{" "}
          <span title={source.uploadedAt}>
            {formatRelative(source.uploadedAt)}
          </span>
        </p>
        {source.status === "failed" && source.errorReason ? (
          <p className="mt-1 text-xs text-rose-700">
            <span aria-hidden="true">⚠</span> {source.errorReason}
          </p>
        ) : null}
      </div>

      <StatusPill status={source.status} />

      <span
        className="inline-flex min-h-[40px] items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
        title={`Version ${source.version}`}
      >
        v{source.version}
      </span>

      <span
        className="min-w-[5rem] text-right font-mono text-xs text-slate-600"
        title={`${source.chunkCount} chunks indexed`}
      >
        {source.chunkCount} chunks
      </span>

      <button
        type="button"
        onClick={() => onReplaceClick(source.sourceFilename)}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span aria-hidden="true">↑</span>
        <span>Replace with new version</span>
      </button>
    </li>
  );
}

const STATUS_STYLES: Readonly<
  Record<IngestStatus, { className: string; icon: string; label: string }>
> = {
  queued: {
    className:
      "border-slate-300 bg-slate-50 text-slate-700",
    icon: "⏳",
    label: "Queued",
  },
  indexing: {
    className: "border-amber-300 bg-amber-50 text-amber-900",
    icon: "…",
    label: "Indexing",
  },
  ready: {
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
    icon: "✓",
    label: "Ready",
  },
  failed: {
    className: "border-rose-300 bg-rose-50 text-rose-900",
    icon: "✕",
    label: "Failed",
  },
};

function StatusPill({
  status,
}: {
  status: IngestStatus;
}): React.ReactElement {
  const { className, icon, label } = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${className}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

/**
 * Coarse "N minutes ago" / "N hours ago" formatter. Intentionally
 * tiny: the source list is glanceable, not a forensic log — the
 * full ISO timestamp lives in the row's `title` attribute for the
 * admin who needs precision.
 */
function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
