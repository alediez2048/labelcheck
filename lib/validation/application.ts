/**
 * Application submission validation.
 *
 * Zod schemas mirror the `Application` domain type from `@/types`. The
 * server-side verify endpoint (P1-7) parses the FormData through these
 * before any work runs, so bad input never reaches the extraction
 * service.
 *
 * Beverage-type-conditional required fields come from
 * `config/fields-by-type.json` via `lib/config` — never hardcoded here.
 * Editing the per-type required list is a config change (FR-25), not a
 * code change.
 */

import { z } from "zod";

import { getRequiredFields, type ConfigFieldKey } from "@/lib/config";
import type { BeverageType } from "@/types";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const BeverageTypeSchema = z.enum([
  "wine",
  "distilled_spirits",
  "malt_beverage",
]);

const FaceKindSchema = z.enum(["front", "back", "neck"]);

const ImageMimeSchema = z.enum(["image/jpeg", "image/png"]);

const MAX_FACE_BYTES = 12 * 1024 * 1024; // 12 MB per face — generous for phone photos.

/**
 * One face that arrived at the server. The bytes live transiently in the
 * request lifecycle (NFR-4) and the type carries them only at the API
 * boundary; downstream code uses the `ProviderFaceInput` shape after
 * preprocessing (P0-5).
 */
export const RawLabelFaceSchema = z.object({
  kind: FaceKindSchema,
  bytes: z.instanceof(Buffer).refine(
    (b) => b.length > 0 && b.length <= MAX_FACE_BYTES,
    { message: "Face image must be between 1 byte and 12 MB" },
  ),
  mime: ImageMimeSchema,
});

export type RawLabelFace = z.infer<typeof RawLabelFaceSchema>;

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

/**
 * Form fields. Every value is `string` because that's what an applicant
 * types in the form; normalisation (case, units, whitespace) happens in
 * the matching engine (P1-3), not here.
 *
 * All fields are technically optional at the type level; the
 * beverage-type-aware refinement below enforces required-ness based on
 * `config/fields-by-type.json`.
 */
export const FormFieldsSchema = z.object({
  brandName: z.string().trim().default(""),
  fancifulName: z.string().trim().optional(),
  classType: z.string().trim().default(""),
  alcoholContent: z.string().trim().default(""),
  netContents: z.string().trim().default(""),
  producerName: z.string().trim().default(""),
  producerAddress: z.string().trim().default(""),
  countryOfOrigin: z.string().trim().optional(),
});

export type FormFieldsInput = z.infer<typeof FormFieldsSchema>;

/**
 * Map between the form-field camelCase keys and the user-facing field
 * names that appear in validation error messages.
 */
const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand name",
  fancifulName: "Fanciful name",
  classType: "Class/type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  producerName: "Producer name",
  producerAddress: "Producer address",
  countryOfOrigin: "Country of origin",
};

function isFormFieldKey(key: ConfigFieldKey): key is Exclude<ConfigFieldKey, "government_warning"> {
  return key !== "government_warning";
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * The full submission. Validates the form, requires at least one face,
 * checks per-beverage-type required fields against `config/fields-by-type.json`.
 *
 * Returns a clean, UI-friendly result via `validateApplication()` below
 * so the form can render error messages without leaking zod issue paths.
 */
export const ApplicationSubmissionSchema = z.object({
  beverageType: BeverageTypeSchema,
  form: FormFieldsSchema,
  faces: z
    .array(RawLabelFaceSchema)
    .min(1, "Upload at least one label face")
    .max(3, "At most three label faces (front, back, neck)"),
});

export type ApplicationSubmission = z.infer<typeof ApplicationSubmissionSchema>;

/**
 * UI-friendly validation result. `fieldErrors` is keyed by form-field
 * camelCase name; `formErrors` carries non-field issues (e.g. missing
 * faces). The verify endpoint maps zod's raw issues into this shape so
 * the UI never sees a zod path.
 */
export type ValidationResult =
  | {
      ok: true;
      data: ApplicationSubmission;
    }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof FormFieldsInput, string>>;
      formErrors: string[];
    };

/**
 * Parse and validate a submission, including the per-beverage-type
 * required-field check sourced from `config/fields-by-type.json`.
 */
export function validateApplication(raw: unknown): ValidationResult {
  const parsed = ApplicationSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return zodIssuesToResult(parsed.error);
  }

  const { beverageType, form } = parsed.data;
  const requiredFields = getRequiredFields(beverageType);

  const fieldErrors: Partial<Record<keyof FormFieldsInput, string>> = {};
  for (const key of requiredFields) {
    if (!isFormFieldKey(key)) continue; // government_warning lives on the label, not the form
    const value = form[key];
    if (typeof value !== "string" || value.length === 0) {
      fieldErrors[key] = `${FIELD_LABELS[key] ?? key} is required for ${beverageTypeLabel(beverageType)}`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, formErrors: [] };
  }

  return { ok: true, data: parsed.data };
}

function beverageTypeLabel(t: BeverageType): string {
  return {
    wine: "wine",
    distilled_spirits: "distilled spirits",
    malt_beverage: "malt beverage",
  }[t];
}

function zodIssuesToResult(err: z.ZodError): ValidationResult {
  const fieldErrors: Partial<Record<keyof FormFieldsInput, string>> = {};
  const formErrors: string[] = [];
  for (const issue of err.issues) {
    const [first, second] = issue.path;
    if (first === "form" && typeof second === "string" && second in FIELD_LABELS) {
      fieldErrors[second as keyof FormFieldsInput] = issue.message;
    } else if (first === "faces" || first === "beverageType") {
      formErrors.push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }
  return { ok: false, fieldErrors, formErrors };
}
