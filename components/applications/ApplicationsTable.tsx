/**
 * ApplicationsTable — the All Applications data table (P2-6;
 * mockup.md "All Applications").
 *
 * Renders a semantic `<table>` over the filter selector's rows. Sticky
 * header, striped rows. Status and Lane each render as colour + icon +
 * text pills so the row stays accessible (NFR-2; AC-9). Columns match
 * the ticket's column list: application + TTB id, beverage type,
 * status, lane, assigned agent, received date.
 *
 * The mockup's "applicant" column is omitted because applicant names
 * are PII (schema.md) and the prototype fixture does not carry them.
 * The columns we DO render line up 1:1 with the production table
 * after schema.md lands — no migration needed when the rollup is
 * swapped in.
 */

"use client";

import React from "react";

import type { ApplicationsRow } from "@/lib/applications/filter";
import type { ApplicationStatus } from "@/lib/queue/types";
import type { BeverageType, Lane } from "@/types";

const STATUS_TREATMENT: Readonly<
  Record<
    ApplicationStatus,
    { label: string; icon: string; pillClass: string }
  >
> = {
  in_queue: {
    label: "In queue",
    icon: "•",
    pillClass: "bg-slate-100 text-slate-800 border-slate-300",
  },
  approved: {
    label: "Approved",
    icon: "✓",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  needs_correction: {
    label: "Needs correction",
    icon: "!",
    pillClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
  rejected: {
    label: "Rejected",
    icon: "✕",
    pillClass: "bg-rose-100 text-rose-900 border-rose-400",
  },
};

const LANE_TREATMENT: Readonly<
  Record<Lane, { label: string; icon: string; pillClass: string }>
> = {
  match: {
    label: "Match",
    icon: "✓",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  mismatch: {
    label: "Mismatch",
    icon: "✕",
    pillClass: "bg-rose-100 text-rose-900 border-rose-400",
  },
  review: {
    label: "Review",
    icon: "?",
    pillClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

function formatDate(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  return new Date(ts).toISOString().slice(0, 10);
}

type Props = { rows: ReadonlyArray<ApplicationsRow> };

export function ApplicationsTable({ rows }: Props): React.ReactElement {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No applications match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              Application
            </th>
            <th scope="col" className="px-4 py-3">
              Type
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3">
              Lane
            </th>
            <th scope="col" className="px-4 py-3">
              Assigned agent
            </th>
            <th scope="col" className="px-4 py-3">
              Received
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const stripe = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
            const statusT = STATUS_TREATMENT[row.status];
            const laneT = LANE_TREATMENT[row.lane];
            return (
              <tr
                key={row.applicationId}
                className={`${stripe} border-t border-slate-100`}
              >
                <td className="px-4 py-3 align-top">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.brand}
                  </p>
                  <p className="text-xs text-slate-500">{row.ttbId}</p>
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  {BEVERAGE_LABELS[row.beverageType]}
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    aria-label={`Status: ${statusT.label}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusT.pillClass}`}
                  >
                    <span aria-hidden="true">{statusT.icon}</span>
                    <span>{statusT.label}</span>
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    aria-label={`Lane: ${laneT.label}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${laneT.pillClass}`}
                  >
                    <span aria-hidden="true">{laneT.icon}</span>
                    <span>{laneT.label}</span>
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  {row.assignedAgentName ?? (
                    <span className="text-slate-400">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  {formatDate(row.receivedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
