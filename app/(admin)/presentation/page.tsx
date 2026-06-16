"use client";

import Link from "next/link";
import React from "react";

/**
 * /presentation — embedded PowerPoint deck (rendered as PDF in an
 * iframe). The .pptx is converted to PDF at the source and committed
 * to `public/`; the browser's built-in PDF viewer handles paging and
 * fullscreen. The .pptx download link stays available for reviewers
 * who want to open it in PowerPoint / Keynote.
 */
export default function PresentationPage(): React.ReactElement {
  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <div className="flex flex-col">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Resources
          </p>
          <h1 className="text-lg font-bold text-ink">Presentation</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/operations"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-[10px] border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            ← Back to Operations
          </Link>
          <a
            href="/LabelCheck-Presentation.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-[10px] border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Open PDF ↗
          </a>
          <a
            href="/LabelCheck-Presentation.pptx"
            download
            className="inline-flex min-h-[40px] items-center gap-1 rounded-[10px] bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-ink"
          >
            ↓ Download .pptx
          </a>
        </div>
      </header>
      <div className="flex-1 bg-slate-100">
        <iframe
          src="/LabelCheck-Presentation.pdf#view=FitH"
          title="LabelCheck presentation"
          className="h-full w-full border-0"
        />
      </div>
    </main>
  );
}
