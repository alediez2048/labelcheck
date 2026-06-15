/**
 * FieldTable — per-field breakdown (FR-15, FR-24).
 *
 * Each row shows: field, form value, label-extracted value, source face,
 * verdict, confidence. Flagged rows pair color with an icon and a text
 * label per AC-9 — the differing field is the agent's first stop on a
 * mismatch.
 */

import type { FieldResult, Verdict } from "@/types";

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

const VERDICT_TREATMENTS: Readonly<
  Record<
    Verdict,
    { label: string; icon: string; rowClass: string; chipClass: string }
  >
> = {
  match: {
    label: "Match",
    icon: "✓",
    rowClass: "",
    chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  mismatch: {
    label: "Mismatch",
    icon: "✕",
    rowClass: "bg-rose-50",
    chipClass: "bg-rose-100 text-rose-900 border-rose-400",
  },
  not_found: {
    label: "Not found",
    icon: "?",
    rowClass: "bg-amber-50",
    chipClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
  low_confidence: {
    label: "Low confidence",
    icon: "!",
    rowClass: "bg-amber-50",
    chipClass: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

export function FieldTable({
  fields,
}: {
  fields: ReadonlyArray<FieldResult>;
}): React.ReactElement {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No per-field results — the extraction step did not produce usable text.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Per-field comparison of the application form against the
          transcribed label text.
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">
            <th scope="col" className="py-2 pr-3">Field</th>
            <th scope="col" className="py-2 pr-3">Form value</th>
            <th scope="col" className="py-2 pr-3">Label read</th>
            <th scope="col" className="py-2 pr-3">Face</th>
            <th scope="col" className="py-2 pr-3">Verdict</th>
            <th scope="col" className="py-2 pr-3">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const t = VERDICT_TREATMENTS[f.verdict];
            return (
              <tr
                key={f.field}
                className={`border-b border-slate-100 ${t.rowClass}`}
              >
                <th scope="row" className="py-3 pr-3 text-left font-medium text-slate-800">
                  {FIELD_LABELS[f.field] ?? f.field}
                </th>
                <td className="py-3 pr-3 text-slate-700">
                  {f.formValue || <span className="text-slate-400">—</span>}
                </td>
                <td className="py-3 pr-3 text-slate-700">
                  {f.extractedValue ?? (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-3 pr-3 text-slate-700">
                  {f.sourceFace
                    ? FACE_LABELS[f.sourceFace] ?? f.sourceFace
                    : "—"}
                </td>
                <td className="py-3 pr-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.chipClass}`}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    <span>{t.label}</span>
                  </span>
                </td>
                <td className="py-3 pr-3 font-mono text-slate-700">
                  {(f.confidence * 100).toFixed(0)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fields.some((f) => f.verdict !== "match") && (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {fields
            .filter((f) => f.verdict !== "match")
            .map((f) => (
              <li key={f.field} className="flex gap-2">
                <span aria-hidden="true" className="text-slate-400">
                  •
                </span>
                <span>
                  <span className="font-medium">
                    {FIELD_LABELS[f.field] ?? f.field}:
                  </span>{" "}
                  {f.reason}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
