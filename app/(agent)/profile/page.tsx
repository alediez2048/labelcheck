/**
 * /profile — Profile (P2-6; mockup.md "Profile"; D15; CONTEXT.md
 * Availability + Specialization).
 *
 * The agent's account screen: identity card (name, role, agent id),
 * team caption (the prototype has no team grouping yet —
 * documented), a read-only specialization display (admin sets it in
 * Team per D15; the caption surfaces that), and the existing
 * availability radio toggle ported verbatim from P2-5 so the OOO
 * branch of the work router stays demonstrable.
 *
 * Row-scoped to `currentAgent.id` (D16; FR-29). If the active actor
 * is not an agent (e.g. the role switcher landed on the supervisor
 * mid-render), render a clear notice instead of leaking the
 * supervisor's surface.
 */

"use client";

import React, { useState } from "react";

import { useQueue } from "@/lib/queue/QueueProvider";
import type { BeverageType } from "@/types";

type Availability = "available" | "out_of_office";

const AVAILABILITY_TREATMENT: Readonly<
  Record<
    Availability,
    { label: string; icon: string; description: string; pillClass: string }
  >
> = {
  available: {
    label: "Available",
    icon: "●",
    description:
      "The router can route exceptions to you and Get next will pull.",
    pillClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  out_of_office: {
    label: "Out of office",
    icon: "◯",
    description:
      "Pauses the pull router; claimed items become reassignable by the supervisor.",
    pillClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
};

const ROLE_TREATMENT: Readonly<
  Record<"agent" | "admin", { label: string; pillClass: string }>
> = {
  agent: {
    label: "Agent",
    pillClass: "bg-indigo-100 text-indigo-900 border-indigo-300",
  },
  admin: {
    label: "Admin",
    pillClass: "bg-violet-100 text-violet-900 border-violet-300",
  },
};

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

export default function ProfilePage(): React.ReactElement {
  const { currentAgent, setAvailability } = useQueue();
  const [error, setError] = useState<string | null>(null);

  if (currentAgent === undefined) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="mt-2 text-sm text-slate-600">No agent selected.</p>
      </main>
    );
  }

  function handleChange(next: Availability): void {
    setError(null);
    const result = setAvailability(currentAgent!.id, next);
    if (!result.ok) {
      setError(result.error);
    }
  }

  const active = currentAgent.availability;
  const roleTreatment = ROLE_TREATMENT[currentAgent.role];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Agent shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your identity, team, and routing settings.
        </p>
      </header>

      <section
        aria-labelledby="identity-heading"
        className="mt-8 rounded-lg border border-slate-200 bg-white p-5"
      >
        <header className="border-b border-slate-100 pb-3">
          <h2
            id="identity-heading"
            className="text-base font-semibold text-slate-800"
          >
            Identity
          </h2>
        </header>
        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          <p className="text-2xl font-bold text-slate-900">
            {currentAgent.name}
          </p>
          <span
            aria-label={`Role: ${roleTreatment.label}`}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleTreatment.pillClass}`}
          >
            {roleTreatment.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{currentAgent.id}</p>
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-700">Team:</span> Agent
          <span className="ml-2 text-xs text-slate-500">
            (the prototype has no team grouping yet — production reads
            `agent.team` from the schema.)
          </span>
        </p>
      </section>

      <section
        aria-labelledby="specialization-heading"
        className="mt-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <header className="border-b border-slate-100 pb-3">
          <h2
            id="specialization-heading"
            className="text-base font-semibold text-slate-800"
          >
            Specialization
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Set by admins in Team. Drives which beverage types the work
            router sends you (D15).
          </p>
        </header>
        <ul className="mt-4 flex flex-wrap gap-2">
          {currentAgent.specializations.length === 0 ? (
            <li className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
              Generalist (overflow only)
            </li>
          ) : (
            currentAgent.specializations.map((t) => (
              <li
                key={t}
                className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-900"
              >
                {BEVERAGE_LABELS[t]}
              </li>
            ))
          )}
        </ul>
      </section>

      <section
        aria-labelledby="availability-heading"
        className="mt-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <header className="border-b border-slate-100 pb-3">
          <h2
            id="availability-heading"
            className="text-base font-semibold text-slate-800"
          >
            Availability
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Setting yourself out of office pauses the pull router and lets the
            supervisor reassign your claimed work.
          </p>
        </header>

        <fieldset className="mt-4">
          <legend className="sr-only">Set availability</legend>
          <div
            role="radiogroup"
            aria-label="Availability"
            className="flex flex-col gap-2"
          >
            {(Object.keys(AVAILABILITY_TREATMENT) as Availability[]).map(
              (value) => {
                const treatment = AVAILABILITY_TREATMENT[value];
                const isActive = value === active;
                return (
                  <label
                    key={value}
                    className={`flex min-h-[46px] cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors ${
                      isActive
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="availability"
                      value={value}
                      checked={isActive}
                      onChange={() => handleChange(value)}
                      className="mt-1 h-4 w-4 cursor-pointer accent-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span
                          aria-label={`Status: ${treatment.label}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${treatment.pillClass}`}
                        >
                          <span aria-hidden="true">{treatment.icon}</span>
                          <span>{treatment.label}</span>
                        </span>
                      </span>
                      <span className="text-xs text-slate-600">
                        {treatment.description}
                      </span>
                    </div>
                  </label>
                );
              },
            )}
          </div>
        </fieldset>

        {error !== null && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          >
            <span aria-hidden="true" className="mr-1 font-bold">
              ✕
            </span>
            Could not change availability: {error}
          </p>
        )}
      </section>
    </main>
  );
}
