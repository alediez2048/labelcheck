/**
 * RoleSwitcher — sidebar identity dropdown (P2-5; D16; FR-29).
 *
 * The prototype's stand-in for PIV/CAC + SSO (NFR-8). Lists every
 * seeded agent and admin and lets the reviewer swap the active actor
 * so the Admin and Agent shells can be exercised side-by-side. The
 * switcher is intentionally explicit about role — color + icon + text
 * on the role pill so it never relies on color alone (NFR-2, AC-9) —
 * and adds a specialization caption so picking "the wine specialist"
 * does not require remembering ids.
 *
 * On pick, navigates to the role's home (`/operations` for admin,
 * `/queue` for agent). The route-group layouts handle the inverse
 * case — visiting an off-shell route gets redirected back — so the
 * switcher only drives the happy-path destination.
 *
 * Mirrors the picker patterns from `HandAssignPicker.tsx`: Esc closes,
 * click-outside closes, no focus trap by design.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { useQueue } from "@/lib/queue/QueueProvider";
import type { BeverageType } from "@/types";

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

const ROLE_TREATMENT = {
  admin: {
    label: "Admin",
    icon: "★",
    pillClass: "bg-indigo-100 text-indigo-900 border-indigo-300",
  },
  agent: {
    label: "Agent",
    icon: "●",
    pillClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
} as const;

export function RoleSwitcher(): React.ReactElement {
  const router = useRouter();
  const { state, currentAgent, setCurrentAgentId } = useQueue();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Mirror HandAssignPicker: Esc + click-outside close the dropdown.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    function onDocClick(e: MouseEvent): void {
      const root = rootRef.current;
      if (root === null) return;
      if (e.target instanceof Node && !root.contains(e.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  function handlePick(id: string, role: "agent" | "admin"): void {
    setCurrentAgentId(id);
    setOpen(false);
    // Admin landing is /operations, Agent landing is /queue. The
    // route-group layouts catch the wrong-shell case; here we only
    // pick the right-shell home.
    router.push(role === "admin" ? "/operations" : "/queue");
  }

  const activeRole = currentAgent?.role ?? "agent";
  const activeTreatment = ROLE_TREATMENT[activeRole];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch role"
        className="flex min-h-[46px] w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Signed in as
          </span>
          <span className="font-semibold text-slate-900">
            {currentAgent?.name ?? "No one selected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-label={`Role: ${activeTreatment.label}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${activeTreatment.pillClass}`}
          >
            <span aria-hidden="true">{activeTreatment.icon}</span>
            <span>{activeTreatment.label}</span>
          </span>
          <span aria-hidden="true" className="text-slate-500">
            {open ? "▴" : "▾"}
          </span>
        </div>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Available identities"
          className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-80 overflow-y-auto rounded-md border border-slate-300 bg-white p-1 shadow-lg"
        >
          {state.agents.map((agent) => {
            const treatment = ROLE_TREATMENT[agent.role];
            const isActive = agent.id === currentAgent?.id;
            const caption =
              agent.role === "admin"
                ? "supervisor"
                : agent.specializations.length === 0
                  ? "generalist"
                  : agent.specializations
                      .map((s) => BEVERAGE_LABELS[s])
                      .join(", ");
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handlePick(agent.id, agent.role)}
                  className={`flex min-h-[46px] w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                    isActive
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900">
                      {agent.name}
                    </span>
                    <span className="text-xs text-slate-500">{caption}</span>
                  </div>
                  <span
                    aria-label={`Role: ${treatment.label}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${treatment.pillClass}`}
                  >
                    <span aria-hidden="true">{treatment.icon}</span>
                    <span>{treatment.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
