/**
 * ReturnForCorrectionForm — captures the structured reason summary
 * required by FR-26a.
 *
 * The summary is auto-derived from the verification's failed fields so
 * the applicant gets actionable feedback ("brand name was BLACK FOREST
 * on the form but the label reads BLACK FORST") rather than a vague
 * "please fix". The free-text note is optional — most cases are fully
 * explained by the structured rows.
 *
 * Whole-application only (FR-26): there is no per-face / per-field
 * checkbox here. The disposition is atomic; this form just records the
 * reasons that drove the agent to it.
 */

import React, { useState } from "react";

import type { FieldResult, ReturnReasonSummary } from "@/types";

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

function failedFieldsFrom(
  fields: ReadonlyArray<FieldResult>,
): ReturnReasonSummary["failedFields"] {
  return fields
    .filter((f) => f.verdict !== "match")
    .map((f) => ({
      field: f.field,
      formValue: f.formValue,
      extractedValue: f.extractedValue,
      reason: f.reason,
    }));
}

export function ReturnForCorrectionForm({
  fields,
  onCancel,
  onConfirm,
}: {
  fields: ReadonlyArray<FieldResult>;
  onCancel: () => void;
  onConfirm: (reason: ReturnReasonSummary) => void;
}): React.ReactElement {
  const [agentNote, setAgentNote] = useState("");
  const summary = failedFieldsFrom(fields);

  function handleConfirm(): void {
    const payload: ReturnReasonSummary = {
      failedFields: summary,
      ...(agentNote.trim().length > 0 ? { agentNote: agentNote.trim() } : {}),
    };
    onConfirm(payload);
  }

  return (
    <section
      aria-labelledby="return-form-heading"
      className="rounded-lg border-2 border-rose-300 bg-white p-5"
    >
      <header className="mb-3">
        <h2
          id="return-form-heading"
          className="text-base font-semibold text-rose-900"
        >
          Return for correction
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The applicant will see this structured summary plus your optional
          note. They cannot edit the existing application — a corrected
          resubmission counts as a new application linked to this one.
        </p>
      </header>

      {summary.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No fields flagged a problem. You can still return the application,
          but the applicant will only see your note as guidance.
        </p>
      ) : (
        <ul className="space-y-3">
          {summary.map((row) => (
            <li
              key={row.field}
              className="rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <p className="text-sm font-semibold text-slate-800">
                {FIELD_LABELS[row.field] ?? row.field}
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-slate-500">
                    Form value
                  </dt>
                  <dd className="text-slate-800">
                    {row.formValue || (
                      <span className="text-slate-400">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">
                    Label read
                  </dt>
                  <dd className="text-slate-800">
                    {row.extractedValue ?? (
                      <span className="text-slate-400">—</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-slate-700">{row.reason}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-1">
        <label
          htmlFor="agent-note"
          className="text-sm font-medium text-slate-700"
        >
          Agent note (optional)
        </label>
        <textarea
          id="agent-note"
          rows={3}
          value={agentNote}
          onChange={(e) => setAgentNote(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          placeholder="Anything else the applicant should know"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
        >
          Confirm return for correction
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
