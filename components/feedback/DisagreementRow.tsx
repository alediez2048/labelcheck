/**
 * DisagreementRow — one sampled override in the disagreement queue
 * (P5-3, observability.md "Disagreements are sampled into a review queue").
 *
 * The row is bidirectional by design: sometimes the tool was right and
 * the agent was wrong. The Confirm controls write the actual ground
 * truth back to the record so the accumulating corpus stays
 * trustworthy. Without that loop every override would be silently
 * treated as a tool error and the corpus would drift.
 *
 * The summary row carries enough context to decide at a glance (brand,
 * lanes that disagreed, override kind, when). The expanded body shows
 * the tool's per-field call alongside the agent's structured return
 * reason so the supervisor can adjudicate without leaving the page.
 *
 * The shapes for `predictedFields` and `returnReasonFields` are looser
 * (string verdicts and source faces) than the domain `FieldResult` —
 * deliberate: the wire format is the API contract for the feedback
 * loop, and the row renders it verbatim rather than coercing it into
 * the domain type and losing fidelity.
 */

"use client";

import React, { useState } from "react";

import { LanePill } from "./LanePill";
import type { FeedbackDisagreementItem } from "./types";

type Props = {
  item: FeedbackDisagreementItem;
  onConfirm: (
    id: string,
    confirmation: "tool_was_right" | "agent_was_right",
  ) => Promise<void>;
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  brand_name: "Brand name",
  fanciful_name: "Fanciful name",
  class_type: "Class / type",
  alcohol_content: "Alcohol content",
  net_contents: "Net contents",
  producer_name: "Producer name",
  producer_address: "Producer address",
  country_of_origin: "Country of origin",
  government_warning: "Government warning",
};

const FACE_LABELS: Readonly<Record<string, string>> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
};

const VERDICT_TREATMENT: Readonly<
  Record<string, { label: string; icon: string; chipClass: string }>
> = {
  match: {
    label: "Match",
    icon: "✓",
    chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  mismatch: {
    label: "Mismatch",
    icon: "✕",
    chipClass: "bg-rose-100 text-rose-900 border-rose-400",
  },
  not_found: {
    label: "Not found",
    icon: "?",
    chipClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
  low_confidence: {
    label: "Low confidence",
    icon: "!",
    chipClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

const FALLBACK_VERDICT = {
  label: "Unknown",
  icon: "·",
  chipClass: "bg-slate-100 text-slate-700 border-slate-300",
} as const;

const OVERRIDE_TREATMENT = {
  flag: {
    label: "Flag (agent returned tool's match)",
    short: "Flag",
    icon: "⚑",
    chipClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
  clear: {
    label: "Clear (agent approved tool's mismatch/review)",
    short: "Clear",
    icon: "✓",
    chipClass: "bg-rose-100 text-rose-900 border-rose-400",
  },
} as const;

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function DisagreementRow({
  item,
  onConfirm,
}: Props): React.ReactElement {
  const [submitting, setSubmitting] = useState<
    null | "tool_was_right" | "agent_was_right"
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(
    confirmation: "tool_was_right" | "agent_was_right",
  ): Promise<void> {
    setSubmitting(confirmation);
    setError(null);
    try {
      await onConfirm(item.id, confirmation);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  }

  const overrideT = OVERRIDE_TREATMENT[item.overrideKind];

  return (
    <li className="rounded-md border border-slate-200 bg-white">
      <details className="group">
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-slate-900">
                {item.brand ?? <span className="italic text-slate-500">(brand redacted)</span>}
              </span>
              <a
                href={`/queue/${encodeURIComponent(item.applicationId)}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded border border-brand/30 bg-brand-soft px-2 py-0.5 font-mono text-[11px] font-medium text-brand-ink hover:bg-brand-soft hover:underline focus:outline-none focus:ring-2 focus:ring-brand/40"
                title={`Open ${item.applicationId} in the review queue`}
              >
                <span>{item.applicationId}</span>
                <span aria-hidden="true">↗</span>
              </a>
              <span
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
                title="Hashed application id (audit reference)"
              >
                {item.applicationIdHash.slice(0, 10)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-1">
                <LanePill lane={item.predictedLane} />
                <span className="text-slate-500">tool</span>
                <span aria-hidden="true" className="text-slate-400">
                  →
                </span>
                <LanePill lane={item.effectiveLane} />
                <span className="text-slate-500">agent</span>
              </div>
              <span
                aria-label={overrideT.label}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${overrideT.chipClass}`}
              >
                <span aria-hidden="true">{overrideT.icon}</span>
                <span>{overrideT.short}</span>
              </span>
              <span className="text-slate-500">·</span>
              <time
                dateTime={item.recordedAt}
                title={item.recordedAt}
                className="text-slate-500"
              >
                {formatRelative(item.recordedAt)}
              </time>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {item.confirmation === "pending" ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleClick("tool_was_right");
                  }}
                  disabled={submitting !== null}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden="true">✓</span>
                  <span>
                    {submitting === "tool_was_right"
                      ? "Saving…"
                      : "Tool was right"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleClick("agent_was_right");
                  }}
                  disabled={submitting !== null}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-md border-2 border-indigo-400 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden="true">✓</span>
                  <span>
                    {submitting === "agent_was_right"
                      ? "Saving…"
                      : "Agent was right"}
                  </span>
                </button>
              </>
            ) : (
              <ConfirmedChip confirmation={item.confirmation} />
            )}
            <span
              aria-hidden="true"
              className="text-slate-400 group-open:hidden"
            >
              ▸
            </span>
            <span
              aria-hidden="true"
              className="hidden text-slate-400 group-open:inline"
            >
              ▾
            </span>
          </div>
        </summary>

        {error !== null && (
          <p
            role="alert"
            className="mx-4 mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          >
            <span aria-hidden="true" className="mr-1 font-bold">
              ✕
            </span>
            Could not record confirmation: {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50 px-4 py-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Tool&apos;s per-field call
            </h3>
            <PredictedFieldsTable fields={item.predictedFields} />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Agent&apos;s structured reason
            </h3>
            {item.overrideKind === "clear" ? (
              <p className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                Agent approved with no field-level reason — they accepted
                the tool&apos;s per-field call but disagreed on the lane.
              </p>
            ) : item.returnReasonFields === undefined ||
              item.returnReasonFields.length === 0 ? (
              <p className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                No structured field-level reason was attached to this
                return-for-correction.
              </p>
            ) : (
              <ReturnReasonTable fields={item.returnReasonFields} />
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

function ConfirmedChip({
  confirmation,
}: {
  confirmation: "tool_was_right" | "agent_was_right";
}): React.ReactElement {
  if (confirmation === "tool_was_right") {
    return (
      <span
        aria-label="Confirmed: tool was right"
        className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900"
      >
        <span aria-hidden="true">✓</span>
        <span>Tool was right</span>
      </span>
    );
  }
  return (
    <span
      aria-label="Confirmed: agent was right"
      className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-900"
    >
      <span aria-hidden="true">✓</span>
      <span>Agent was right</span>
    </span>
  );
}

function PredictedFieldsTable({
  fields,
}: {
  fields: ReadonlyArray<{
    field: string;
    verdict: string;
    confidence: number;
    sourceFace: string | null;
  }>;
}): React.ReactElement {
  if (fields.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        The tool did not emit per-field results for this case.
      </p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Tool&apos;s per-field verdicts with confidence and source face.
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">
            <th scope="col" className="px-3 py-2">
              Field
            </th>
            <th scope="col" className="px-3 py-2">
              Verdict
            </th>
            <th scope="col" className="px-3 py-2">
              Confidence
            </th>
            <th scope="col" className="px-3 py-2">
              Face
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const t = VERDICT_TREATMENT[f.verdict] ?? FALLBACK_VERDICT;
            return (
              <tr
                key={f.field}
                className="border-b border-slate-100 last:border-b-0"
              >
                <th
                  scope="row"
                  className="px-3 py-2 text-left font-medium text-slate-800"
                >
                  {FIELD_LABELS[f.field] ?? f.field}
                </th>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.chipClass}`}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    <span>{t.label}</span>
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-slate-700">
                  {(f.confidence * 100).toFixed(0)}%
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {f.sourceFace
                    ? FACE_LABELS[f.sourceFace] ?? f.sourceFace
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReturnReasonTable({
  fields,
}: {
  fields: ReadonlyArray<{
    field: string;
    formValue: string;
    extractedValue: string | null;
    reason: string;
  }>;
}): React.ReactElement {
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Agent&apos;s structured return reason — the fields they cited as
          failing.
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">
            <th scope="col" className="px-3 py-2">
              Field
            </th>
            <th scope="col" className="px-3 py-2">
              Form value
            </th>
            <th scope="col" className="px-3 py-2">
              Label read
            </th>
            <th scope="col" className="px-3 py-2">
              Reason
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr
              key={f.field}
              className="border-b border-slate-100 last:border-b-0"
            >
              <th
                scope="row"
                className="px-3 py-2 text-left font-medium text-slate-800"
              >
                {FIELD_LABELS[f.field] ?? f.field}
              </th>
              <td className="px-3 py-2 text-slate-700">
                {f.formValue || <span className="text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 text-slate-700">
                {f.extractedValue ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 text-slate-700">{f.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
