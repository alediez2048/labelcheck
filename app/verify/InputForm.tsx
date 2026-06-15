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

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import type { Sample, SampleForm } from "@/fixtures/samples";
import type { ConfigFieldKey } from "@/lib/config";
import type { BeverageType, FaceKind, VerificationResult } from "@/types";

import { FaceUploader } from "./FaceUploader";
import { SamplePicker } from "./SamplePicker";

/**
 * sessionStorage key the result page reads on mount. SessionStorage is
 * scoped to the tab, cleared on close — meets NFR-4 (no persistence) and
 * removes the need to thread the VerificationResult through a URL.
 */
const RESULT_STORAGE_KEY = "labelcheck:verification-result";
/**
 * Stash the as-submitted application alongside the result so the review
 * page can render the as-submitted side without a second round-trip.
 */
const SUBMISSION_STORAGE_KEY = "labelcheck:submitted-application";

type StoredSubmission = {
  applicationId: string;
  beverageType: BeverageType;
  form: SampleForm;
  faces: Array<{ kind: FaceKind; previewUrl: string }>;
};

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

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function sampleUrlToBase64(url: string): Promise<{ bytes: string; mime: string }> {
  const res = await fetch(url);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const mime = blob.type === "image/png" ? "image/png" : "image/jpeg";
  return { bytes: btoa(binary), mime };
}

export function InputForm({ fieldsByType, samples }: Props): React.ReactElement {
  const router = useRouter();
  const [beverageType, setBeverageType] = useState<BeverageType>("distilled_spirits");
  const [form, setForm] = useState<SampleForm>(DEFAULT_FORM);
  const [faces, setFaces] = useState<FaceState[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);

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
    setSelectedSampleId(sample.id);
    setFieldErrors({});
    setFormErrors([]);
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
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
        return;
      }

      setFieldErrors({});
      setFormErrors([]);
      setSubmitting(true);
      try {
        // Encode each face as base64. Sample faces come from public URLs;
        // uploads come from File handles. Both end up as base64 strings
        // matching the route's JSON wire shape (P1-7).
        const facePayloads = await Promise.all(
          faces.map(async (f) => {
            if (f.file) {
              const bytes = await fileToBase64(f.file);
              const mime = f.file.type === "image/png" ? "image/png" : "image/jpeg";
              return { kind: f.kind, bytes, mime };
            }
            const fetched = await sampleUrlToBase64(f.sourceUrl ?? f.previewUrl);
            return { kind: f.kind, bytes: fetched.bytes, mime: fetched.mime };
          }),
        );
        // applicationId: the chosen sample id when a sample was loaded
        // (drives the mock provider's canned fixture), otherwise a
        // browser-generated id for uploads.
        const applicationId =
          selectedSampleId ??
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `app-${Date.now()}`);
        const body = {
          applicationId,
          beverageType,
          form,
          faces: facePayloads,
        };
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            fields?: string[];
          };
          setFormErrors([err.error ?? "Verification failed — please review the form."]);
          // Map field-scoped errors back to field highlights.
          if (Array.isArray(err.fields)) {
            const fieldErrs: FieldErrors = {};
            for (const f of err.fields) {
              if (FORM_FIELD_KEYS.includes(f as keyof SampleForm)) {
                fieldErrs[f as keyof SampleForm] = err.error ?? "Invalid";
              }
            }
            setFieldErrors(fieldErrs);
          }
          return;
        }
        const result = (await res.json()) as VerificationResult;
        const submission: StoredSubmission = {
          applicationId,
          beverageType,
          form,
          faces: faces.map((f) => ({ kind: f.kind, previewUrl: f.previewUrl })),
        };
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            RESULT_STORAGE_KEY,
            JSON.stringify(result),
          );
          window.sessionStorage.setItem(
            SUBMISSION_STORAGE_KEY,
            JSON.stringify(submission),
          );
        }
        router.push("/verify/result");
      } catch {
        setFormErrors([
          "Could not reach the verification service. Please try again.",
        ]);
      } finally {
        setSubmitting(false);
      }
    },
    [beverageType, faces, fieldsByType, form, router, selectedSampleId],
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
          disabled={submitting}
          className="w-full rounded-md bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400"
        >
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </form>
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
