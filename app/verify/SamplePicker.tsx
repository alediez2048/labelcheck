/**
 * SamplePicker — pick a preloaded sample to hydrate the form (D9).
 *
 * The samples come from `fixtures/samples.ts` and ARE the same set that
 * P1-10 acceptance tests import directly, so the demo path and the test
 * path can never drift.
 */

"use client";

import React from "react";

import type { Sample } from "@/fixtures/samples";

type Props = {
  samples: Sample[];
  onSelect: (sample: Sample) => void;
};

export function SamplePicker({ samples, onSelect }: Props): React.ReactElement {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {samples.map((sample) => (
        <li key={sample.id}>
          <button
            type="button"
            onClick={() => onSelect(sample)}
            className="flex w-full flex-col items-start gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <span className="text-sm font-medium text-slate-800">{sample.label}</span>
            <span className="text-xs text-slate-500">{sample.notes}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
