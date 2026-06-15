/**
 * /profile — Profile placeholder + Availability toggle (P2-5; full
 * profile lands in P2-6).
 *
 * The full Profile UI (identity, team, specialization) arrives in
 * P2-6; the Availability toggle ships now because the P2-3 work
 * router already gates pulls and reassigns on `agent.availability`.
 * Without this toggle the OOO branch is unreachable in the demo, so
 * a reviewer can't see that "out of office" skips the agent in
 * Distribute and pauses their pulls.
 *
 * `setAvailability` returns `{ ok, error? }`; we surface the inline
 * error if the lib-layer guard refuses, otherwise an inline status
 * confirms the new value. No optimistic UI — the provider mutation is
 * synchronous (in-memory state), so the next render carries the new
 * availability immediately.
 */

"use client";

import React, { useState } from "react";

import { useQueue } from "@/lib/queue/QueueProvider";

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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Agent shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          {currentAgent.name} — coming in P2-6.
        </p>
      </header>

      <section
        aria-labelledby="availability-heading"
        className="mt-8 rounded-lg border border-slate-200 bg-white p-5"
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
