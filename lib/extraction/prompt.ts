/**
 * Extraction prompt template.
 *
 * Lives in its own file so the prompt can be diffed and versioned cleanly
 * (P5-5 evaluates prompt regressions against the golden set). The version
 * string is bumped on any wording change so the eval gate can attribute a
 * score shift to a prompt edit.
 *
 * The prompt asks the model for ONE thing: transcribe what is printed.
 * Not "match" anything. Not "judge" anything. The model returns text and
 * structural flags; the matching engine (P1-3) does the comparison
 * (D4, D5). A future agent tempted to add a "matches" question is doing
 * the matching engine's job in the wrong place.
 */

import type { BeverageType, FaceKind, FieldName } from "@/types";

export const EXTRACTION_PROMPT_VERSION = "v1.0.0";

/**
 * Build the user-message text. Image content is attached separately by
 * the provider adapter; this string is the instructional payload.
 *
 * The face order in the prompt MUST match the order images are attached
 * to the request — the model uses ordinal position to associate each
 * image with its `kind` label. Provider adapters are responsible for
 * preserving that order.
 */
export function buildExtractionPrompt(opts: {
  beverageType: BeverageType;
  fieldSchema: ReadonlyArray<FieldName>;
  faces: ReadonlyArray<FaceKind>;
}): string {
  const fieldList = opts.fieldSchema
    .filter((f) => f !== "government_warning")
    .map((f) => `  - ${f}`)
    .join("\n");

  const faceList = opts.faces
    .map((k, i) => `  ${i + 1}. ${k}`)
    .join("\n");

  return `You are a TTB compliance OCR specialist. Transcribe what is printed on each alcohol product label face — do not infer, do not paraphrase, do not correct apparent typos. If a field is not visible on a face, omit that key from the face's \`fields\` object rather than guessing.

Beverage type: ${opts.beverageType}

Faces in this application, in the order the images appear:
${faceList}

Fields to transcribe per face (only include keys you can read):
${fieldList}

For the U.S. government health warning, report four structural flags per face:
  - presence: true if a warning block is detected, false otherwise.
  - allCaps: true if the heading "GOVERNMENT WARNING:" appears entirely in capital letters.
  - boldConfident: "yes" / "no" / "uncertain" for whether the heading is bold. Use "uncertain" when the styling is ambiguous; do NOT guess.
  - legibility: "good" or "low" based on whether the warning region is clearly readable.

Also include the full transcribed warning text under a "government_warning" key on the face's \`fields\` object when present.

You are NOT comparing the label to any application form. You are NOT deciding whether a field "matches". You ONLY transcribe what is printed and the warning structural flags. Return ONLY a JSON object matching this exact shape — no prose, no markdown, no code fences:

{
  "faces": [
    {
      "kind": "front" | "back" | "neck",
      "fields": {
        "brand_name"?: string,
        "fanciful_name"?: string,
        "class_type"?: string,
        "alcohol_content"?: string,
        "net_contents"?: string,
        "producer_name"?: string,
        "producer_address"?: string,
        "country_of_origin"?: string,
        "government_warning"?: string
      },
      "warning": {
        "presence": boolean,
        "allCaps": boolean,
        "boldConfident": "yes" | "no" | "uncertain",
        "legibility": "good" | "low"
      }
    }
  ]
}
`;
}
