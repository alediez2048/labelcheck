/**
 * Shared response parser for the OpenAI-compatible vision adapters
 * (OpenAI GPT-4o, OpenRouter). The Anthropic adapter has its own copy
 * because its SDK returns content blocks rather than a plain string;
 * this module is for adapters that go through the OpenAI chat-completions
 * shape.
 */

/**
 * Best-effort JSON parser tolerant of a wrapped code fence the model
 * sometimes adds despite the "no markdown" instruction.
 */
export function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? (fenced[1] ?? trimmed) : trimmed;
  return JSON.parse(body);
}

/**
 * Coerce nulls/undefineds in `faces[].fields` to empty strings. Vision
 * models often return `null` for fields they cannot read; our schema
 * requires strings. The matcher treats "" as a missing value so this
 * transformation is safe (no false-positive matches).
 */
export function coerceNullFieldsToEmptyStrings(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") return;
  const root = parsed as { faces?: Array<{ fields?: Record<string, unknown> }> };
  if (!Array.isArray(root.faces)) return;
  for (const face of root.faces) {
    if (!face || typeof face !== "object" || !face.fields) continue;
    for (const k of Object.keys(face.fields)) {
      const v = face.fields[k];
      if (typeof v !== "string") {
        face.fields[k] = "";
      }
    }
  }
}
