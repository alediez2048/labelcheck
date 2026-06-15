/**
 * HandAssignPicker — small popover for supervisor hand-assign (P2-3).
 *
 * The supervisor's "I know better than the router" escape hatch. Lives
 * inline in the Review Distribution Board so the act of picking an
 * agent stays in the same visual context as the pool item being
 * assigned — no modal, no portal, no page navigation. The simplicity
 * is the design: a list of available agents, each row showing the
 * three lane-language cues for status (color + icon + text from
 * AVAILABILITY_TREATMENT) plus a load badge so the supervisor can
 * choose a less-loaded specialist at a glance.
 *
 * The caller decides which pool item to assign; this component only
 * returns the picked agent id. Keeping it presentational lets it be
 * reused on the per-item flow without coupling to the application
 * shape (which the parent already has in hand).
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

export type HandAssignPickerAgent = {
  agent: QueueAgent;
  /** Current claimed-load — used to render the load badge. */
  load: number;
};

type Props = {
  open: boolean;
  /** Pre-sorted (caller decides the order — usually lightest load first). */
  agents: ReadonlyArray<HandAssignPickerAgent>;
  /** Called with the picked agent id; the caller decides which pool item. */
  onPick: (agentId: string) => void;
  onClose: () => void;
};

export function HandAssignPicker({
  open,
  agents,
  onPick,
  onClose,
}: Props): React.ReactElement | null {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Esc closes. Click-outside closes. No focus trap — the prototype
  // scope intentionally stays small (see HandAssignPicker docstring).
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

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Hand-assign to agent"
      className="mt-2 w-full max-w-md rounded-md border border-slate-300 bg-white p-2 shadow-md"
    >
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pick an agent
      </p>
      {agents.length === 0 ? (
        <p className="px-2 py-2 text-sm text-slate-600">
          No available agents.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {agents.map(({ agent, load }) => {
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
          })}
        </ul>
      )}
    </div>
  );
}
