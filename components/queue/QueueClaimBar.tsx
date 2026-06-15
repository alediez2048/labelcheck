/**
 * Claim bar — top strip of My Queue (mockup.md My Queue).
 *
 * States how many exceptions the agent has CLAIMED ("your work") and
 * how many remain in the SHARED POOL ("more to pull"). The single
 * primary action — Get next from pool — embodies the pull model
 * (D15). One row, two numbers, one button: the mockup's "single next
 * thing to do" pattern.
 *
 * Disabled when the pool is empty OR the agent is out of office.
 * Both states are surfaced in plain language so the agent doesn't
 * have to guess why the button is dimmed (NFR-2).
 */

"use client";

import React from "react";

type Props = {
  claimedCount: number;
  poolCount: number;
  agentAvailable: boolean;
  onGetNext: () => void;
};

export function QueueClaimBar({
  claimedCount,
  poolCount,
  agentAvailable,
  onGetNext,
}: Props): React.ReactElement {
  const canPull = agentAvailable && poolCount > 0;
  const hint = !agentAvailable
    ? "You're set to out of office. Update Profile to start pulling work."
    : poolCount === 0
      ? "The shared pool is empty — wait for new exceptions to arrive."
      : null;

  return (
    <section
      aria-labelledby="claim-bar-heading"
      className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex-1">
        <h2
          id="claim-bar-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600"
        >
          Your work
        </h2>
        <p className="mt-1 text-base text-slate-800">
          <span className="font-semibold">{claimedCount}</span> claimed ·{" "}
          <span className="font-semibold">{poolCount}</span> in the shared pool
        </p>
        {hint !== null && (
          <p className="mt-1 text-sm text-slate-500">{hint}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onGetNext}
        disabled={!canPull}
        className="inline-flex min-h-[46px] items-center gap-2 rounded-md bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        <span aria-hidden="true">↓</span>
        <span>Get next from pool</span>
      </button>
    </section>
  );
}
