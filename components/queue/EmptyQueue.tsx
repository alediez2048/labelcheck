/**
 * Caught-up empty state for My Queue (mockup.md My Queue).
 *
 * The mockup's "you're all caught up" surface — shown when the agent
 * has finished their claimed work and can pull more from the pool.
 * Keeps the same Get-next affordance available so the agent doesn't
 * have to navigate to find the next move.
 */

"use client";

import React from "react";

type Props = {
  poolCount: number;
  agentAvailable: boolean;
  onGetNext: () => void;
};

export function EmptyQueue({
  poolCount,
  agentAvailable,
  onGetNext,
}: Props): React.ReactElement {
  const canPull = agentAvailable && poolCount > 0;
  const hint = !agentAvailable
    ? "Update Profile to come back online and start pulling work."
    : poolCount === 0
      ? "The shared pool is empty — nice work."
      : `${poolCount} item${poolCount === 1 ? "" : "s"} waiting to be pulled.`;
  return (
    <section
      role="status"
      aria-labelledby="empty-queue-heading"
      className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-50 text-2xl text-emerald-700"
      >
        ✓
      </span>
      <div>
        <h2
          id="empty-queue-heading"
          className="text-xl font-semibold text-slate-900"
        >
          You&apos;re all caught up.
        </h2>
        <p className="mt-1 text-sm text-slate-600">{hint}</p>
      </div>
      {canPull && (
        <button
          type="button"
          onClick={onGetNext}
          className="inline-flex min-h-[46px] items-center gap-2 rounded-md bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <span aria-hidden="true">↓</span>
          <span>Get next from pool</span>
        </button>
      )}
    </section>
  );
}
