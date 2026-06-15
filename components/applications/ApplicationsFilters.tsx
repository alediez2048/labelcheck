/**
 * ApplicationsFilters — controlled filter bar for the All Applications
 * page (P2-6; mockup.md "All Applications").
 *
 * Four controls (left-to-right on wide viewports, stacked on narrow):
 *  - Free-text search (brand or TTB id).
 *  - Status multi-select (checkboxes; schema enum values under the
 *    hood, friendly labels in the UI).
 *  - Date-range segmented control (today / week / month / all time).
 *  - Agent multi-select (checkboxes per seeded agent).
 *
 * Owned state lives in the parent (`value` + `onChange`) so the page
 * can recompute the table rows synchronously through `filterApplications`
 * without an intermediate effect.
 */

"use client";

import React from "react";

import type {
  ApplicationFilterInput,
  ApplicationsRow,
} from "@/lib/applications/filter";
import type { ApplicationStatus } from "@/lib/queue/types";

const STATUS_OPTIONS: ReadonlyArray<{
  value: ApplicationStatus;
  label: string;
}> = [
  { value: "in_queue", label: "In queue" },
  { value: "approved", label: "Approved" },
  { value: "needs_correction", label: "Needs correction" },
  { value: "rejected", label: "Rejected" },
];

const RANGE_OPTIONS: ReadonlyArray<{
  value: ApplicationFilterInput["range"];
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "all_time", label: "All time" },
];

type Props = {
  value: ApplicationFilterInput;
  onChange: (next: ApplicationFilterInput) => void;
  agents: ReadonlyArray<{ id: string; name: string }>;
  /** Resulting row count, surfaced as a result caption beside the search box. */
  resultCount?: number;
};

function toggle<T>(arr: ReadonlyArray<T>, item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

export function ApplicationsFilters({
  value,
  onChange,
  agents,
  resultCount,
}: Props): React.ReactElement {
  function handleSearch(next: string): void {
    onChange({ ...value, search: next });
  }
  function handleStatus(next: ApplicationStatus): void {
    onChange({ ...value, statuses: toggle(value.statuses, next) });
  }
  function handleRange(next: ApplicationFilterInput["range"]): void {
    onChange({ ...value, range: next });
  }
  function handleAgent(id: string): void {
    onChange({ ...value, assignedAgentIds: toggle(value.assignedAgentIds, id) });
  }
  function clearAll(): void {
    onChange({
      search: "",
      statuses: [],
      range: "all_time",
      assignedAgentIds: [],
    });
  }

  const hasActiveFilter =
    value.search.trim().length > 0 ||
    value.statuses.length > 0 ||
    value.range !== "all_time" ||
    value.assignedAgentIds.length > 0;

  return (
    <section
      aria-label="Application filters"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="applications-search"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Search
          </label>
          <input
            id="applications-search"
            type="search"
            value={value.search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Brand or TTB ID"
            className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {typeof resultCount === "number" && (
            <p className="text-xs text-slate-500">
              {resultCount} {resultCount === 1 ? "result" : "results"}
            </p>
          )}
        </div>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-[40px] items-center self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Status
          </legend>
          <ul className="mt-1 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const checked = value.statuses.includes(opt.value);
              return (
                <li key={opt.value}>
                  <label
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                      checked
                        ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleStatus(opt.value)}
                      className="h-4 w-4 cursor-pointer accent-indigo-600"
                    />
                    <span>{opt.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset
          className="rounded-md border border-slate-200 p-3"
          aria-label="Date range"
        >
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Received
          </legend>
          <div
            role="radiogroup"
            aria-label="Date range"
            className="mt-1 flex flex-wrap gap-2"
          >
            {RANGE_OPTIONS.map((opt) => {
              const active = value.range === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                    active
                      ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="applications-range"
                    value={opt.value}
                    checked={active}
                    onChange={() => handleRange(opt.value)}
                    className="h-4 w-4 cursor-pointer accent-indigo-600"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Assigned agent
          </legend>
          <ul className="mt-1 flex flex-wrap gap-2">
            {agents.map((agent) => {
              const checked = value.assignedAgentIds.includes(agent.id);
              return (
                <li key={agent.id}>
                  <label
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                      checked
                        ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleAgent(agent.id)}
                      className="h-4 w-4 cursor-pointer accent-indigo-600"
                    />
                    <span>{agent.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
    </section>
  );
}

/** Re-export the row type so the page imports both from one barrel. */
export type { ApplicationsRow };
