/**
 * AsSubmittedView — read-only render of the application as the agent
 * entered it (FR-21).
 *
 * Lives alongside the field-versus-label table so the agent can see what
 * was submitted next to what was read. No edits here — this is the audit
 * trail, not a second input form.
 */

import type { BeverageType, FaceKind } from "@/types";

import type { SampleForm } from "@/fixtures/samples";

const FIELD_LABELS: Readonly<Record<keyof SampleForm, string>> = {
  brandName: "Brand name",
  fancifulName: "Fanciful name",
  classType: "Class / type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  producerName: "Producer name",
  producerAddress: "Producer address",
  countryOfOrigin: "Country of origin",
};

const BEVERAGE_LABELS: Readonly<Record<BeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Distilled spirits",
  malt_beverage: "Malt beverage",
};

const FACE_LABELS: Readonly<Record<FaceKind, string>> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
};

export function AsSubmittedView({
  applicationId,
  beverageType,
  form,
  faces,
}: {
  applicationId: string;
  beverageType: BeverageType;
  form: SampleForm;
  faces: ReadonlyArray<{ kind: FaceKind; previewUrl: string }>;
}): React.ReactElement {
  const entries = (Object.keys(FIELD_LABELS) as (keyof SampleForm)[])
    .filter((k) => form[k] && form[k]!.length > 0)
    .map((k) => [FIELD_LABELS[k], form[k] as string] as const);

  return (
    <section
      aria-labelledby="as-submitted-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <header className="mb-3 border-b border-slate-100 pb-2">
        <h2
          id="as-submitted-heading"
          className="text-base font-semibold text-slate-800"
        >
          As submitted
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Application <span className="font-mono">{applicationId}</span> —{" "}
          {BEVERAGE_LABELS[beverageType]}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-3 sm:gap-x-4">
        {entries.map(([label, value]) => (
          <div key={label} className="sm:col-span-3 sm:grid sm:grid-cols-3">
            <dt className="text-xs font-medium uppercase text-slate-500 sm:col-span-1">
              {label}
            </dt>
            <dd className="text-sm text-slate-800 sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>

      {faces.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="text-sm font-medium text-slate-700">Label faces</h3>
          <ul className="mt-2 flex flex-wrap gap-3">
            {faces.map((f) => (
              <li
                key={f.kind}
                className="flex flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.previewUrl}
                  alt={`${FACE_LABELS[f.kind]} face submitted with this application`}
                  className="h-32 w-32 rounded object-cover"
                />
                <span className="text-xs font-medium text-slate-600">
                  {FACE_LABELS[f.kind]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
