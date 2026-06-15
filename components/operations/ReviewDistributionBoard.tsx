/**
 * ReviewDistributionBoard — shared pool row + per-agent rows +
 * Distribute action, with hand-assign + reassign affordances
 * (P2-2 + P2-3, mockup.md Operations).
 *
 * The board is the supervisor's one-screen view of where exceptions
 * live: shared pool at the top, per-agent rows below, each
 * expandable into the actual items the row counts. The hand-assign
 * and reassign affordances live inside those expansions because the
 * supervisor's mental model is "pick an item, then pick where it
 * goes" — not "pick an agent's row, then dig for the item."
 *
 * The component stays presentational: the page wires the provider
 * actions in and we surface results back through a status notice.
 * That keeps the queue store, the router, and the board cleanly
 * separated (D15; the page is the only place that knows about both).
 */

"use client";

import React, { useMemo, useState } from "react";

import type { DistributionSnapshot } from "@/lib/operations/distribution";
import type { BeverageType, Lane } from "@/types";

import { HandAssignPicker, type HandAssignPickerAgent } from "./HandAssignPicker";
import { ReassignPicker, type ReassignPickerAgent } from "./ReassignPicker";

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

const AVAILABILITY_TREATMENT = {
  available: {
    label: "Available",
    icon: "●",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  out_of_office: {
    label: "Out of office",
    icon: "◯",
    pillClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
} as const;

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
    icon: "!",
    pillClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

const CAPACITY = 5;

export type DistributeSummary = {
  assignedCount: number;
  byAgentId: Record<string, number>;
  applied: true;
};

export type RouterActionResult = { ok: boolean; error?: string };

export type DistributionPoolItem = {
  applicationId: string;
  brand: string;
  lane: Lane;
};

type Props = {
  snapshot: DistributionSnapshot;
  onDistribute: () => DistributeSummary;
  onHandAssign: (applicationId: string, agentId: string) => RouterActionResult;
  onReassign: (
    applicationId: string,
    fromAgentId: string,
    toAgentId: string | null,
  ) => RouterActionResult;
  poolItems: ReadonlyArray<DistributionPoolItem>;
  claimedByAgent: Readonly<Record<string, ReadonlyArray<DistributionPoolItem>>>;
};

export function ReviewDistributionBoard({
  snapshot,
  onDistribute,
  onHandAssign,
  onReassign,
  poolItems,
  claimedByAgent,
}: Props): React.ReactElement {
  const [notice, setNotice] = useState<string | null>(null);
  /** Which pool item's hand-assign picker is open (by applicationId). */
  const [handAssignOpenFor, setHandAssignOpenFor] = useState<string | null>(
    null,
  );
  /**
   * Which agent's row has its reassign picker open, and on which item.
   * Composite key keeps two simultaneously-open pickers impossible.
   */
  const [reassignOpenFor, setReassignOpenFor] = useState<{
    applicationId: string;
    fromAgentId: string;
  } | null>(null);

  /**
   * Pre-sorted agent list for the pickers — only role=agent, only
   * available, lightest load first. The pickers themselves stay dumb
   * and render whatever the board hands them.
   */
  const pickerAgents: ReadonlyArray<HandAssignPickerAgent> = useMemo(() => {
    return snapshot.agents
      .filter((row) => row.agent.role === "agent")
      .filter((row) => row.agent.availability === "available")
      .map((row) => ({ agent: row.agent, load: row.claimedCount }))
      .sort((a, b) => a.load - b.load);
  }, [snapshot.agents]);

  /** Reassign picker shows everyone (so OOO destinations are visible), lightest first. */
  const reassignAgents: ReadonlyArray<ReassignPickerAgent> = useMemo(() => {
    return snapshot.agents
      .filter((row) => row.agent.role === "agent")
      .map((row) => ({ agent: row.agent, load: row.claimedCount }))
      .sort((a, b) => a.load - b.load);
  }, [snapshot.agents]);

  function handleDistribute(): void {
    const result = onDistribute();
    setNotice(
      `Routed ${result.assignedCount} exception(s) across the team.`,
    );
  }

  function handleHandAssign(applicationId: string, agentId: string): void {
    const result = onHandAssign(applicationId, agentId);
    setHandAssignOpenFor(null);
    if (result.ok) {
      const agent = snapshot.agents.find((row) => row.agent.id === agentId);
      const item = poolItems.find(
        (p) => p.applicationId === applicationId,
      );
      setNotice(
        `Hand-assigned ${item?.brand ?? applicationId} to ${agent?.agent.name ?? agentId}.`,
      );
    } else {
      setNotice(
        `Hand-assign failed: ${result.error ?? "unknown error"}.`,
      );
    }
  }

  function handleReassign(
    applicationId: string,
    fromAgentId: string,
    toAgentId: string | null,
  ): void {
    const result = onReassign(applicationId, fromAgentId, toAgentId);
    setReassignOpenFor(null);
    if (result.ok) {
      const item = (claimedByAgent[fromAgentId] ?? []).find(
        (i) => i.applicationId === applicationId,
      );
      if (toAgentId === null) {
        setNotice(
          `Returned ${item?.brand ?? applicationId} to the shared pool.`,
        );
      } else {
        const dest = snapshot.agents.find(
          (row) => row.agent.id === toAgentId,
        );
        setNotice(
          `Reassigned ${item?.brand ?? applicationId} to ${dest?.agent.name ?? toAgentId}.`,
        );
      }
    } else {
      setNotice(`Reassign failed: ${result.error ?? "unknown error"}.`);
    }
  }

  return (
    <section
      aria-labelledby="distribution-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2
            id="distribution-heading"
            className="text-base font-semibold text-slate-800"
          >
            Review distribution
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Shared exception pool above; per-agent load below. Match-lane never appears here.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDistribute}
          disabled={snapshot.pool.total === 0}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <span aria-hidden="true">↔</span>
          <span>Distribute</span>
        </button>
      </header>

      <div className="mt-4 rounded-md border-2 border-indigo-300 bg-indigo-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold text-indigo-900">
            {snapshot.pool.total} waiting to be pulled
          </p>
          <span className="text-xs text-indigo-700">Shared pool</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {snapshot.pool.byBeverageType.map((b) => (
            <li
              key={b.type}
              className="rounded-full border border-indigo-200 bg-white px-3 py-0.5 text-xs font-medium text-indigo-900"
            >
              {BEVERAGE_LABELS[b.type]}: {b.count}
            </li>
          ))}
        </ul>

        {poolItems.length > 0 && (
          <details className="mt-3 rounded-md border border-indigo-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-50">
              <span>Hand-assign individual items</span>
              <span aria-hidden="true" className="text-xs">
                ▾
              </span>
            </summary>
            <ul className="flex flex-col gap-1 border-t border-indigo-100 p-2">
              {poolItems.map((item) => {
                const lane = LANE_TREATMENT[item.lane];
                const open = handAssignOpenFor === item.applicationId;
                return (
                  <li
                    key={item.applicationId}
                    className="rounded-md border border-slate-100 bg-slate-50 px-2 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          aria-label={`Lane: ${lane.label}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${lane.pillClass}`}
                        >
                          <span aria-hidden="true">{lane.icon}</span>
                          <span>{lane.label}</span>
                        </span>
                        <span className="text-sm font-medium text-slate-900">
                          {item.brand}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setHandAssignOpenFor((cur) =>
                            cur === item.applicationId
                              ? null
                              : item.applicationId,
                          )
                        }
                        aria-expanded={open}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      >
                        <span aria-hidden="true">→</span>
                        <span>Hand-assign…</span>
                      </button>
                    </div>
                    {open && (
                      <HandAssignPicker
                        open={open}
                        agents={pickerAgents}
                        onPick={(agentId) =>
                          handleHandAssign(item.applicationId, agentId)
                        }
                        onClose={() => setHandAssignOpenFor(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {snapshot.agents.map((row) => {
          const av = AVAILABILITY_TREATMENT[row.agent.availability];
          const loadPct = Math.min(100, (row.claimedCount / CAPACITY) * 100);
          const items = claimedByAgent[row.agent.id] ?? [];
          return (
            <li
              key={row.agent.id}
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {row.agent.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.agent.specializations
                      .map((s) => BEVERAGE_LABELS[s])
                      .join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-800">
                    {row.claimedCount} claimed
                  </span>
                  <span
                    aria-label={`Availability: ${av.label}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${av.pillClass}`}
                  >
                    <span aria-hidden="true">{av.icon}</span>
                    <span>{av.label}</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  aria-hidden="true"
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${loadPct}%` }}
                />
              </div>

              {items.length > 0 && (
                <details className="mt-3 rounded-md border border-slate-100 bg-slate-50">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                    <span>Claimed items ({items.length})</span>
                    <span aria-hidden="true">▾</span>
                  </summary>
                  <ul className="flex flex-col gap-1 border-t border-slate-200 p-2">
                    {items.map((item) => {
                      const lane = LANE_TREATMENT[item.lane];
                      const open =
                        reassignOpenFor !== null &&
                        reassignOpenFor.applicationId === item.applicationId &&
                        reassignOpenFor.fromAgentId === row.agent.id;
                      return (
                        <ReassignRow
                          key={item.applicationId}
                          item={item}
                          lane={lane}
                          open={open}
                          onToggle={() =>
                            setReassignOpenFor((cur) =>
                              cur !== null &&
                              cur.applicationId === item.applicationId &&
                              cur.fromAgentId === row.agent.id
                                ? null
                                : {
                                    applicationId: item.applicationId,
                                    fromAgentId: row.agent.id,
                                  },
                            )
                          }
                          agents={reassignAgents}
                          excludeAgentId={row.agent.id}
                          onPick={(toAgentId) =>
                            handleReassign(
                              item.applicationId,
                              row.agent.id,
                              toAgentId,
                            )
                          }
                          onClose={() => setReassignOpenFor(null)}
                        />
                      );
                    })}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {notice !== null && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
        >
          {notice}
        </p>
      )}
    </section>
  );
}

type ReassignRowProps = {
  item: DistributionPoolItem;
  lane: (typeof LANE_TREATMENT)[Lane];
  open: boolean;
  onToggle: () => void;
  agents: ReadonlyArray<ReassignPickerAgent>;
  excludeAgentId: string;
  onPick: (toAgentId: string | null) => void;
  onClose: () => void;
};

function ReassignRow({
  item,
  lane,
  open,
  onToggle,
  agents,
  excludeAgentId,
  onPick,
  onClose,
}: ReassignRowProps): React.ReactElement {
  return (
    <li className="rounded-md border border-slate-200 bg-white px-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-label={`Lane: ${lane.label}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${lane.pillClass}`}
          >
            <span aria-hidden="true">{lane.icon}</span>
            <span>{lane.label}</span>
          </span>
          <span className="text-sm font-medium text-slate-900">
            {item.brand}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <span aria-hidden="true">⇄</span>
          <span>Reassign…</span>
        </button>
      </div>
      {open && (
        <ReassignPicker
          open={open}
          agents={agents}
          excludeAgentId={excludeAgentId}
          onPick={onPick}
          onClose={onClose}
        />
      )}
    </li>
  );
}
