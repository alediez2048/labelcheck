/**
 * QueueRow — one item in My Queue (mockup.md My Queue).
 *
 * Three things on the row: brand (what the application is for), the
 * single-line issue summary (why it's flagged), and a lane pill that
 * pairs color + icon + text (NFR-2, AC-9). The whole row is a link
 * into the review detail so the click target is large and keyboard-
 * reachable.
 */

"use client";

import Link from "next/link";
import React from "react";

import type { QueueItem } from "@/lib/queue/types";
import type { Lane } from "@/types";

const LANE_TREATMENT: Readonly<
  Record<
    Lane,
    {
      label: string;
      icon: string;
      pillClass: string;
      rowAccentClass: string;
    }
  >
> = {
  match: {
    label: "Match",
    icon: "✓",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    rowAccentClass: "",
  },
  mismatch: {
    label: "Mismatch",
    icon: "✕",
    pillClass: "bg-rose-100 text-rose-900 border-rose-400",
    rowAccentClass: "border-l-4 border-l-rose-400",
  },
  review: {
    label: "Review",
    icon: "!",
    pillClass: "bg-amber-100 text-amber-900 border-amber-400",
    rowAccentClass: "border-l-4 border-l-amber-400",
  },
};

export function QueueRow({ item }: { item: QueueItem }): React.ReactElement {
  const t = LANE_TREATMENT[item.lane];
  return (
    <li className={`rounded-md border border-slate-200 bg-white ${t.rowAccentClass}`}>
      <Link
        href={`/queue/${item.application.applicationId}`}
        className="flex min-h-[54px] flex-wrap items-center gap-4 px-4 py-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <div className="flex-1">
          <p className="text-base font-semibold text-slate-900">
            {item.application.brand}
          </p>
          {item.issueSummary && (
            <p className="mt-0.5 text-sm text-slate-600">{item.issueSummary}</p>
          )}
        </div>
        <span
          aria-label={`Lane: ${t.label}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${t.pillClass}`}
        >
          <span aria-hidden="true">{t.icon}</span>
          <span>{t.label}</span>
        </span>
      </Link>
    </li>
  );
}
