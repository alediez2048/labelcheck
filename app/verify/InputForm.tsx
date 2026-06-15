/**
 * InputForm — the verify-page client component.
 *
 * Holds:
 *   - beverageType (drives the rendered field set; FR-3)
 *   - form values (one shape across all beverage types)
 *   - faces (1..3 label-face entries; D12)
 *   - errors + submission preview state
 *
 * Verify-button submit validates required fields against the
 * fields-by-type config (no hardcoding; FR-25) and at least one face,
 * then shows a Submission Preview panel. The Preview is a stand-in for
 * the real POST to /api/verify, which lands in P1-7. P1-2 plugs the
 * extraction service into that endpoint.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";

import type { Sample, SampleForm } from "@/fixtures/samples";
import type { ConfigFieldKey } from "@/lib/config";
import type { BeverageType, FaceKind } from "@/types";

import { FaceUploader } from "./FaceUploader";
import { SamplePicker } from "./SamplePicker";

type FaceState = {
  kind: FaceKind;
  /** Preview URL — object URL for uploads, public path for samples. */
  previewUrl: string;
  /** Set when this face came from a file upload. */
  file?: File;
  /** Set when this face came from a sample fixture. */
  sourceUrl?: string;
};

type FieldErrors = Partial<Record<keyof SampleForm, string>>;

const FORM_FIELD_KEYS: ReadonlyArray<keyof SampleForm> = [
  "brandName",
  "fancifulName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "producerAddress",
  "countryOfOrigin",
];

const FIELD_LABELS: Record<keyof SampleForm, string> = {
  brandName: "Brand name",
  fancifulName: "Fanciful name",
  classType: "Class / type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  producerName: "Producer name",
  producerAddress: "Producer address",
  countryOfOrigin: "Country of origin",
};

const BEVERAGE_LABELS: Record<BeverageType, string> = {
  wine: "wine",
  distilled_spirits: "distilled spirits",
  malt_beverage: "malt beverage",
};

const DEFAULT_FORM: SampleForm = {
  brandName: "",
  fancifulName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  producerName: "",
  producerAddress: "",
  countryOfOrigin: "",
};

function isFormFieldKey(key: ConfigFieldKey): key is keyof SampleForm {
  return key !== "government_warning";
}

type Props = {
  fieldsByType: Record<BeverageType, readonly ConfigFieldKey[]>;
  samples: Sample[];
};

export function InputForm({ fieldsByType, samples }: Props): React.ReactElement {
  const [beverageType, setBeverageType] = useState<BeverageType>("distilled_spirits");
  const [form, setForm] = useState<SampleForm>(DEFAULT_FORM);
  const [faces, setFaces] = useState<FaceState[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<unknown>(null);

  // Revoke object URLs on unmount.
  useEffect(
    () => () => {
      faces.forEach((f) => {
        if (f.file) URL.revokeObjectURL(f.previewUrl);
      });
    },
    [faces],
  );

  const updateField = useCallback(
    (key: keyof SampleForm, value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const loadSample = useCallback((sample: Sample) => {
    setBeverageType(sample.beverageType);
    setForm({ ...DEFAULT_FORM, ...sample.form });
    setFaces(
      sample.faces.map((f) => ({
        kind: f.kind,
        previewUrl: f.imageSrc,
        sourceUrl: f.imageSrc,
      })),
    );
    setFieldErrors({});
    setFormErrors([]);
    setPreview(null);
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const nextFieldErrors: FieldErrors = {};
      const nextFormErrors: string[] = [];

      const required = fieldsByType[beverageType];
      for (const key of required) {
        if (!isFormFieldKey(key)) continue;
        const value = form[key];
        if (typeof value !== "string" || value.trim().length === 0) {
          nextFieldErrors[key] = `${FIELD_LABELS[key]} is required for ${BEVERAGE_LABELS[beverageType]}`;
        }
      }

      if (faces.length === 0) {
        nextFormErrors.push("Upload at least one label face (front, back, or neck).");
      }

      if (Object.keys(nextFieldErrors).length > 0 || nextFormErrors.length > 0) {
        setFieldErrors(nextFieldErrors);
        setFormErrors(nextFormErrors);
        setPreview(null);
        return;
      }

      setFieldErrors({});
      setFormErrors([]);
      setPreview({
        beverageType,
        form,
        faces: faces.map((f) => ({
          kind: f.kind,
          source: f.file ? "upload" : "sample",
          ...(f.file
            ? { fileName: f.file.name, sizeBytes: f.file.size, mime: f.file.type }
            : { url: f.sourceUrl }),
        })),
      });
    },
    [beverageType, faces, fieldsByType, form],
  );

  const requiredFields = fieldsByType[beverageType];
  const requiredFormFieldKeys = FORM_FIELD_KEYS.filter((k) =>
    requiredFields.includes(k),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">LabelCheck</h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit an application and one or more label face images. Verification lands in P1-7;
          today the Verify button validates the submission and shows what would be sent.
        </p>
      </header>

      <section className="mb-8 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Load a sample</h2>
        <p className="mt-1 text-xs text-slate-500">
          Hydrates the form and faces from a preloaded fixture. The same fixtures drive the Phase 1 acceptance tests.
        </p>
        <SamplePicker samples={samples} onSelect={loadSample} />
      </section>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <BeverageTypeFieldset value={beverageType} onChange={setBeverageType} />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-slate-700">
            Application data
          </legend>
          {FORM_FIELD_KEYS.map((key) => {
            const isRequired = requiredFormFieldKeys.includes(key);
            const isShown = isRequired || form[key];
            if (!isShown) return null;
            return (
              <FormField
                key={key}
                fieldKey={key}
                label={FIELD_LABELS[key]}
                required={isRequired}
                value={form[key] ?? ""}
                error={fieldErrors[key]}
                onChange={(v) => updateField(key, v)}
              />
            );
          })}
        </fieldset>

        <FaceUploader
          faces={faces}
          onChange={setFaces}
          maxFaces={3}
        />

        {formErrors.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          >
            <span aria-hidden="true" className="mt-0.5 text-base">⚠</span>
            <ul className="flex-1 list-disc pl-5">
              {formErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-md bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          Verify
        </button>
      </form>

      {preview !== null && (
        <section
          aria-live="polite"
          className="mt-8 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <h2 className="text-sm font-semibold">Submission preview</h2>
          <p className="mt-1 text-xs text-emerald-800">
            Validated. P1-7 will POST this shape to <code>/api/verify</code>.
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-white p-3 text-xs text-slate-800">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BeverageTypeFieldset({
  value,
  onChange,
}: {
  value: BeverageType;
  onChange: (next: BeverageType) => void;
}): React.ReactElement {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-slate-700">Beverage type</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(BEVERAGE_LABELS) as BeverageType[]).map((t) => (
          <label
            key={t}
            className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
              t === value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="beverageType"
              value={t}
              checked={t === value}
              onChange={() => onChange(t)}
              className="sr-only"
            />
            {BEVERAGE_LABELS[t]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FormField({
  fieldKey,
  label,
  required,
  value,
  error,
  onChange,
}: {
  fieldKey: keyof SampleForm;
  label: string;
  required: boolean;
  value: string;
  error?: string;
  onChange: (next: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldKey} className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </label>
      <input
        id={fieldKey}
        name={fieldKey}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldKey}-error` : undefined}
        className={`rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-2 ${
          error
            ? "border-rose-400 focus:ring-rose-300"
            : "border-slate-300 focus:ring-slate-300"
        }`}
      />
      {error && (
        <p
          id={`${fieldKey}-error`}
          role="alert"
          className="flex items-center gap-1 text-sm text-rose-700"
        >
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
    </div>
  );
}
