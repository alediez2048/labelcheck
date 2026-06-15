/**
 * ReassignPicker — same shape as HandAssignPicker plus an explicit
 * "Return to pool" option at the top (P2-3).
 *
 * Reassign is the supervisor's two-direction move: agent → other
 * agent, or agent → shared pool. Splitting them into two affordances
 * (a Reassign button + a separate "Send back" button) would force the
 * supervisor to mentally re-classify the move before clicking; one
 * picker with both targets keeps the decision in one place.
 *
 * The "Return to pool" row uses the indigo language of the shared-
 * pool row above the board so it reads as "send it back to that
 * place." Color + icon + text are paired on every status cue, per
 * NFR-2 / AC-9.
 */

"use client";

import React, { useEffect, useRef } from "react";

import type { BeverageType } from "@/types";

import type { QueueAgent } from "@/lib/queue/types";

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

export type ReassignPickerAgent = {
  agent: QueueAgent;
  load: number;
};

type Props = {
  open: boolean;
  agents: ReadonlyArray<ReassignPickerAgent>;
  /** Excluded from the list — usually the current assignee. */
  excludeAgentId: string | null;
  /** null = return to pool. */
  onPick: (agentId: string | null) => void;
  onClose: () => void;
};

export function ReassignPicker({
  open,
  agents,
  excludeAgentId,
  onPick,
  onClose,
}: Props): React.ReactElement | null {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    function onDocClick(e: MouseEvent): void {
      const root = rootRef.current;
      if (root === null) return;
      if (e.target instanceof Node && !root.contains(e.target)) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const visibleAgents = agents.filter(
    (a) => a.agent.id !== excludeAgentId,
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Reassign to agent or return to pool"
      className="mt-2 w-full max-w-md rounded-md border border-slate-300 bg-white p-2 shadow-md"
    >
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Move to
      </p>
      <ul className="flex flex-col gap-1">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md border-2 border-indigo-300 bg-indigo-50 px-2 py-1.5 text-left hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-indigo-900">
                Return to pool
              </span>
              <span className="text-xs text-indigo-700">
                Unclaim and put back in the shared exception pool.
              </span>
            </div>
            <span
              aria-label="Return to shared pool"
              className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-2 py-0.5 text-xs font-semibold text-indigo-900"
            >
              <span aria-hidden="true">↩</span>
              <span>Pool</span>
            </span>
          </button>
        </li>
        {visibleAgents.length === 0 ? (
          <li className="px-2 py-2 text-sm text-slate-600">
            No other agents to move to.
          </li>
        ) : (
          visibleAgents.map(({ agent, load }) => {
            const av = AVAILABILITY_TREATMENT[agent.availability];
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => onPick(agent.id)}
                  className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-slate-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-900">
                      {agent.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {agent.specializations
                        .map((s) => BEVERAGE_LABELS[s])
                        .join(", ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      aria-label={`${load} claimed`}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700"
                    >
                      {load}
                    </span>
                    <span
                      aria-label={`Availability: ${av.label}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${av.pillClass}`}
                    >
                      <span aria-hidden="true">{av.icon}</span>
                      <span>{av.label}</span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
