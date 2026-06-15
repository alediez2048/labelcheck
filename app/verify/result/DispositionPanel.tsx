/**
 * DispositionPanel — two-action whole-application disposition (FR-26).
 *
 * Exactly two buttons: Approve, Return for correction. No manual reject
 * (FR-27 production auto-rejects after the 30-day correction window). No
 * per-face or per-field controls — disposition is atomic (CONTEXT.md:
 * Disposition).
 *
 * Routing the agent through this single panel — not a per-row toggle, not
 * a multi-step wizard — is what makes the atomic constraint structural
 * rather than aspirational.
 */

import React from "react";

export function DispositionPanel({
  disabled,
  onApprove,
  onReturn,
}: {
  disabled: boolean;
  onApprove: () => void;
  onReturn: () => void;
}): React.ReactElement {
  return (
    <section
      aria-labelledby="disposition-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <h2
        id="disposition-heading"
        className="text-base font-semibold text-slate-800"
      >
        Disposition
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Whole-application action. Choose one.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400"
        >
          <span aria-hidden="true">✓</span>
          <span>Approve</span>
        </button>
        <button
          type="button"
          onClick={onReturn}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-5 py-3 text-base font-semibold text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:cursor-not-allowed disabled:bg-rose-400"
        >
          <span aria-hidden="true">↺</span>
          <span>Return for correction</span>
        </button>
      </div>
    </section>
  );
}
