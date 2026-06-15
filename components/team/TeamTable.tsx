/**
 * TeamTable — per-member performance + admin-only specialization /
 * availability controls (P2-6; mockup.md "Team"; D15).
 *
 * Columns: name, completed this week, completed this month, the
 * match / mismatch / review split as a horizontal rate bar (legend
 * under the row plus hover-numbers — colour is not the sole channel,
 * NFR-2; AC-9), average handling time as mm:ss, the seeded
 * `SpecializationEditor` from P2-4 as the inline specialization
 * column, and an availability radio toggle matching the Profile
 * shape.
 *
 * The two write actions are passed in as callbacks so the page (and
 * tests, when they arrive) can wire them to the QueueProvider's
 * admin-gated mutations directly.
 */

"use client";

import React, { useState } from "react";

import { SpecializationEditor } from "@/components/operations/SpecializationEditor";
import type { KpiSnapshot, TriageBreakdown } from "@/lib/analytics/types";
import type { QueueAgent } from "@/lib/queue/types";
import type { BeverageType } from "@/types";

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

type Row = {
  agent: QueueAgent;
  weekKpis: KpiSnapshot;
  monthKpis: KpiSnapshot;
  triage: TriageBreakdown;
  avgHandlingSec: number;
};

type ActionResult = { ok: true } | { ok: false; error: string };

type Props = {
  rows: ReadonlyArray<Row>;
  onSetSpecialization: (
    agentId: string,
    types: ReadonlyArray<BeverageType>,
  ) => ActionResult;
  onSetAvailability: (
    agentId: string,
    availability: "available" | "out_of_office",
  ) => ActionResult;
};

function formatHandling(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RateBar({
  triage,
}: {
  triage: TriageBreakdown;
}): React.ReactElement {
  const match = triage.match;
  const mismatch = triage.mismatch;
  const review = triage.review;
  const total = match + mismatch + review;
  if (total === 0) {
    return (
      <p className="text-xs text-slate-500">No dispositions in range.</p>
    );
  }
  const pct = (n: number): number => Math.round((n / total) * 100);
  const matchPct = pct(match);
  const mismatchPct = pct(mismatch);
  // Force the three to sum to 100 by giving review the remainder so
  // there are never sub-pixel gaps on the bar.
  const reviewPct = 100 - matchPct - mismatchPct;
  return (
    <div>
      <div
        role="img"
        aria-label={`Triage split: ${match} match, ${mismatch} mismatch, ${review} review`}
        className="flex h-3 w-40 overflow-hidden rounded-full border border-slate-200"
      >
        <span
          title={`Match: ${match} (${matchPct}%)`}
          style={{ width: `${matchPct}%` }}
          className="block bg-emerald-400"
        />
        <span
          title={`Mismatch: ${mismatch} (${mismatchPct}%)`}
          style={{ width: `${mismatchPct}%` }}
          className="block bg-rose-400"
        />
        <span
          title={`Review: ${review} (${reviewPct}%)`}
          style={{ width: `${reviewPct}%` }}
          className="block bg-amber-400"
        />
      </div>
      <p className="mt-1 text-xs text-slate-600">
        <span className="font-semibold text-emerald-700">{match}</span>{" "}
        match ·{" "}
        <span className="font-semibold text-rose-700">{mismatch}</span>{" "}
        mismatch ·{" "}
        <span className="font-semibold text-amber-700">{review}</span>{" "}
        review
      </p>
    </div>
  );
}

function AvailabilityToggle({
  agentId,
  value,
  onChange,
}: {
  agentId: string;
  value: "available" | "out_of_office";
  onChange: (next: "available" | "out_of_office") => ActionResult;
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  function handle(next: "available" | "out_of_office"): void {
    setError(null);
    const result = onChange(next);
    if (!result.ok) setError(result.error);
  }
  const treatments: Record<
    "available" | "out_of_office",
    { label: string; icon: string; pillClass: string }
  > = {
    available: {
      label: "Available",
      icon: "●",
      pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    },
    out_of_office: {
      label: "OOO",
      icon: "◯",
      pillClass: "bg-slate-100 text-slate-700 border-slate-300",
    },
  };
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={`Availability for ${agentId}`}
        className="flex flex-col gap-1"
      >
        {(Object.keys(treatments) as Array<"available" | "out_of_office">).map(
          (v) => {
            const treatment = treatments[v];
            const active = value === v;
            return (
              <label
                key={v}
                className={`inline-flex min-h-[32px] cursor-pointer items-center gap-2 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  active ? treatment.pillClass : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`availability-${agentId}`}
                  value={v}
                  checked={active}
                  onChange={() => handle(v)}
                  className="h-3 w-3 cursor-pointer accent-emerald-600"
                />
                <span aria-hidden="true">{treatment.icon}</span>
                <span>{treatment.label}</span>
              </label>
            );
          },
        )}
      </div>
      {error !== null && (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function SpecializationCell({
  agent,
  onSet,
}: {
  agent: QueueAgent;
  onSet: Props["onSetSpecialization"];
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave(next: ReadonlyArray<BeverageType>): void {
    setError(null);
    const result = onSet(agent.id, next);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <ul className="flex flex-wrap gap-1">
          {agent.specializations.length === 0 ? (
            <li className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
              Generalist
            </li>
          ) : (
            agent.specializations.map((t) => (
              <li
                key={t}
                className="rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-900"
              >
                {BEVERAGE_LABELS[t]}
              </li>
            ))
          )}
        </ul>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-[32px] items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <SpecializationEditor
          open={open}
          value={agent.specializations}
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      )}
      {error !== null && (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TeamTable({
  rows,
  onSetSpecialization,
  onSetAvailability,
}: Props): React.ReactElement {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No agents on the team yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              Name
            </th>
            <th scope="col" className="px-4 py-3">
              This week
            </th>
            <th scope="col" className="px-4 py-3">
              This month
            </th>
            <th scope="col" className="px-4 py-3">
              Triage split
            </th>
            <th scope="col" className="px-4 py-3">
              Avg handling
            </th>
            <th scope="col" className="px-4 py-3">
              Specialization
            </th>
            <th scope="col" className="px-4 py-3">
              Availability
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const stripe = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
            return (
              <tr
                key={row.agent.id}
                className={`${stripe} border-t border-slate-100 align-top`}
              >
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.agent.name}
                  </p>
                  <p className="text-xs text-slate-500">{row.agent.id}</p>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                  {row.weekKpis.processed}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                  {row.monthKpis.processed}
                </td>
                <td className="px-4 py-3">
                  <RateBar triage={row.triage} />
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-slate-700">
                  {formatHandling(row.avgHandlingSec)}
                </td>
                <td className="px-4 py-3">
                  <SpecializationCell
                    agent={row.agent}
                    onSet={onSetSpecialization}
                  />
                </td>
                <td className="px-4 py-3">
                  <AvailabilityToggle
                    agentId={row.agent.id}
                    value={row.agent.availability}
                    onChange={(next) => onSetAvailability(row.agent.id, next)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
