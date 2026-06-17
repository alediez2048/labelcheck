/**
 * Client-side form-field parser for TTB COLA PDFs (P5-8).
 *
 * Tuned against real TTB F 5100.31 COLAs from the Public COLA
 * Registry. The form is all-caps with numbered sections; values
 * follow the field label on the same logical line and end at the
 * next numbered section, the next ALL-CAPS field heading, or a
 * "PART I/II/III" boundary.
 *
 * Returns a partial SampleForm + the list of required fields that
 * could NOT be confidently extracted, so the dropzone can fill safe
 * placeholder defaults (which the matcher will surface as mismatches
 * when they don't appear on the label).
 */

import type { SampleForm } from "@/fixtures/samples";

const REQUIRED_FIELDS: ReadonlyArray<keyof SampleForm> = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
];

type Anchor = {
  field: keyof SampleForm;
  patterns: ReadonlyArray<RegExp>;
  /** Optional cleaner to strip junk specific to this field. */
  postClean?: (value: string) => string;
};

const ANCHORS: ReadonlyArray<Anchor> = [
  {
    field: "brandName",
    patterns: [
      // "5. BRAND NAME (Required) CASCADE WINERY 7a. MAILING ADDRESS..."
      /BRAND NAME\s*(?:\(Required\))?\s+(.+?)(?=\s+\d{1,2}[a-z]?\.\s+[A-Z]|\s+(?:FANCIFUL NAME|MAILING ADDRESS|NET CONTENTS|ALCOHOL|CLASS\/TYPE|PART|QUALIFICATIONS|STATUS|TYPE OF|EMAIL))/i,
    ],
  },
  {
    field: "fancifulName",
    patterns: [
      /FANCIFUL NAME\s*(?:\(If any\))?\s+(.+?)(?=\s+\d{1,2}[a-z]?\.\s+[A-Z]|\s+(?:NAME AND ADDRESS|MAILING|EMAIL|PHONE|FORMULA|LAB|SERIAL|PART|QUALIFICATIONS|TYPE OF))/i,
    ],
  },
  {
    field: "classType",
    patterns: [
      // "CLASS/TYPE DESCRIPTION TABLE RED WINE EXPIRATION DATE..."
      // We do NOT fall back to "TYPE OF PRODUCT" because that line on
      // TTB Form 5100.31 is a checkbox row that text-extracts as the
      // literal list ("WINE DISTILLED SPIRITS MALT BEVERAGE"). When the
      // description field is missing, leave class blank — the matcher
      // treats UNKNOWN as "trust the label" instead of mismatching.
      /CLASS\/TYPE(?:\s+DESCRIPTION)?\s+(.+?)(?=\s+(?:EXPIRATION|AFFIX|IMAGE TYPE|ACTUAL DIMENSIONS|QUALIFICATIONS|STATUS|TTB F|PART|PHONE|FAX)|\s+\d{1,2}[a-z]?\.\s+[A-Z])/i,
    ],
  },
  {
    field: "alcoholContent",
    patterns: [
      // "12. ALCOHOL CONTENT 11.5"
      /ALCOHOL CONTENT\s+([0-9]+(?:\.[0-9]+)?\s*%?)/i,
    ],
    postClean: (v) => {
      const num = v.match(/[0-9]+(?:\.[0-9]+)?/);
      if (!num) return "";
      return v.includes("%") ? v.trim() : `${num[0]}%`;
    },
  },
  {
    field: "netContents",
    patterns: [
      // "11. NET CONTENTS 750 MILLILITERS"
      /NET CONTENTS\s+([0-9]+(?:\.[0-9]+)?\s*(?:ML|MILLILITERS|L|LITERS|LITRE|FL\s*OZ|OUNCES|OZ|GAL|GALLONS)\.?)/i,
    ],
  },
  {
    field: "producerName",
    patterns: [
      // "USED ON LABEL (Required) CASCADE WINERY, CASCADE WINERY, INC. 6275 28TH ST..."
      // Capture up to the street number (3+ digits).
      /(?:USED ON LABEL|ON LABEL)\s*(?:\(Required\))?\s+([A-Z][A-Z\s,.&'-]{2,80}?)(?=\s+\d{3,}\b)/i,
      /NAME AND ADDRESS OF APPLICANT[^A-Z]*?\(Required\)\s+([A-Z][A-Z\s,.&'-]{2,80}?)(?=\s+\d{3,}\b)/i,
    ],
  },
  {
    field: "producerAddress",
    patterns: [
      // "6275 28TH ST GRAND RAPIDS MI 49546" — street + city + state + ZIP
      /(\d{3,}\s+[A-Z0-9][A-Z0-9\s,.&'-]{5,100}?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?)/,
    ],
  },
  {
    field: "countryOfOrigin",
    patterns: [
      /(?:Country of Origin|ORIGIN CODE)\s*[:\s]+([A-Z][A-Za-z\s]{1,30}?)(?=\s+\d{1,2}[a-z]?\.\s+[A-Z]|\s+(?:CLASS|PART|QUALIFICATIONS|TYPE))/i,
    ],
  },
];

function genericClean(value: string): string {
  let v = value
    .replace(/\s+/g, " ")
    .replace(/^\s*[:.\-]\s*/, "")
    .trim();
  // Strip "(Required)" / "(Optional)" / "(If any)" form annotations.
  v = v.replace(/\((?:Required|Optional|If any|Used on label)\)/gi, "").trim();
  // Strip trailing commas / orphan punctuation.
  v = v.replace(/[,;]+\s*$/, "").trim();
  // Require at least 2 alphanumeric chars to count as a real value.
  const alnum = v.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length < 2) return "";
  return v;
}

export type ParsedColaForm = {
  form: Partial<SampleForm>;
  missing: ReadonlyArray<keyof SampleForm>;
};

export function parseColaForm(page1Text: string): ParsedColaForm {
  const form: Partial<SampleForm> = {};
  const text = page1Text.replace(/\s+/g, " ").trim();

  for (const anchor of ANCHORS) {
    for (const pattern of anchor.patterns) {
      const m = text.match(pattern);
      if (m && m[1]) {
        const raw = m[1];
        const cleaned = genericClean(raw);
        const finalValue = anchor.postClean ? anchor.postClean(cleaned) : cleaned;
        if (finalValue.length > 0 && finalValue.length < 250) {
          form[anchor.field] = finalValue;
          break;
        }
      }
    }
  }

  // Derive countryOfOrigin from address state if we got it from the
  // address but not as a separate field. US states default to "USA".
  if (!form.countryOfOrigin && form.producerAddress) {
    if (/\b[A-Z]{2}\s+\d{5}\b/.test(form.producerAddress)) {
      form.countryOfOrigin = "USA";
    }
  }

  const missing = REQUIRED_FIELDS.filter((f) => !form[f]);
  return { form, missing };
}
