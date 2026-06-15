/**
 * SpecializationEditor — admin-only multi-select popover for an
 * agent's beverage-type specialization (P2-4).
 *
 * The admin's inline edit lives next to the agent row on the Review
 * Distribution Board because the supervisor's mental model is "I'm
 * looking at this agent's load; their specialty is wrong, fix it
 * here." A modal would break that flow and a Team-view round-trip
 * doesn't ship until P2-6 — the inline editor is the minimum the
 * router needs to demonstrate specialization-aware routing.
 *
 * The component is presentational: the caller owns `value` and only
 * receives the new array on Save. An empty array means "generalist
 * (overflow only)" and is a valid choice per D15 / FR-28; the caption
 * surfaces that so the supervisor doesn't second-guess what an empty
 * selection means.
 *
 * Mirrors HandAssignPicker's popover behaviour (anchored absolute,
 * Esc + click-outside close) so the supervisor's muscle memory carries
 * across the three editors on the board.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";

import type { BeverageType } from "@/types";

const BEVERAGE_TYPES: ReadonlyArray<BeverageType> = [
  "wine",
  "distilled_spirits",
  "malt_beverage",
];

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

type Props = {
  open: boolean;
  /** Currently-selected specializations. */
  value: ReadonlyArray<BeverageType>;
  /** Called with the new array when the user saves. */
  onSave: (next: ReadonlyArray<BeverageType>) => void;
  onClose: () => void;
};

export function SpecializationEditor({
  open,
  value,
  onSave,
  onClose,
}: Props): React.ReactElement | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  /**
   * In-progress selection. Held locally so Cancel reverts cleanly
   * without the parent ever seeing the partial state.
   */
  const [draft, setDraft] = useState<ReadonlyArray<BeverageType>>(value);

  // Reset the draft whenever the popover (re)opens so a previously
  // discarded edit doesn't leak into a fresh session on the same row.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Esc closes. Click-outside closes. Mirrors HandAssignPicker.
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

  function toggle(type: BeverageType): void {
    setDraft((cur) =>
      cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type],
    );
  }

  function handleSave(): void {
    // Preserve the canonical BEVERAGE_TYPES order so consumers don't
    // see arbitrary click-order in the saved value.
    const ordered = BEVERAGE_TYPES.filter((t) => draft.includes(t));
    onSave(ordered);
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Edit agent specialization"
      className="mt-2 w-full max-w-md rounded-md border border-slate-300 bg-white p-3 shadow-md"
    >
      <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Specialization
      </p>

      <ul
        role="group"
        aria-label="Beverage type specializations"
        className="flex flex-wrap gap-2"
      >
        {BEVERAGE_TYPES.map((type) => {
          const selected = draft.includes(type);
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => toggle(type)}
                aria-pressed={selected}
                className={
                  selected
                    ? "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-semibold ring-2 ring-offset-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 border-indigo-400 bg-indigo-50 text-indigo-900 ring-indigo-200"
                    : "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-300 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }
              >
                <span aria-hidden="true">{selected ? "✓" : "○"}</span>
                <span>{BEVERAGE_LABELS[type]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-slate-500">
        Empty selection = generalist (overflow only).
      </p>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[40px] items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex min-h-[40px] items-center rounded-md border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          Save
        </button>
      </div>
    </div>
  );
}
