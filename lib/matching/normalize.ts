/**
 * Normalisation helpers shared across the per-field matchers.
 *
 * The matching engine intentionally separates normalisation from
 * comparison so the rules in `config/tolerances.json` (`["case",
 * "punctuation", "whitespace", "unit"]`) can drive which normalisers
 * apply on a per-field basis. A future config change like adding a
 * `"diacritics"` step is one new normaliser here, not a rewrite of
 * every matcher.
 */

/**
 * Lower-case + strip punctuation + collapse whitespace. The default
 * normaliser for fuzzy text fields (brand, class/type, producer).
 */
export function normalizeForFuzzy(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse an ABV-as-stated to a numeric value, tolerant of "40%",
 * "40 %", "40% ALC/VOL", "40% ABV", "40", "40.5%". Returns null when
 * no number can be extracted (the matcher treats that as a parse
 * failure, not a silent zero).
 */
export function parseAbvPercent(s: string): number | null {
  if (!s) return null;
  const match = s.match(/(\d+(?:\.\d+)?)/);
  if (!match || match[1] === undefined) return null;
  return Number.parseFloat(match[1]);
}

export type NetContents = { value: number; unit: NetUnit };
export type NetUnit = "ml" | "l" | "fl_oz";

/**
 * Parse "750 mL", "750ML", "750 ml", "750 mL.", "750 millilitres",
 * "12 FL OZ", "12 fl. oz.", "1.0 L" into `{ value, unit }`. Unit is
 * normalised to one of three canonical tokens; mixed-case and
 * punctuation variants collapse. Returns null on parse failure.
 */
export function parseNetContents(s: string): NetContents | null {
  if (!s) return null;
  // Don't blanket-strip periods — that would eat decimals like "0.75 L".
  // The unit regexes below tolerate optional trailing periods explicitly.
  const cleaned = s.toLowerCase();
  // value
  const valMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!valMatch || valMatch[1] === undefined) return null;
  const value = Number.parseFloat(valMatch[1]);
  // unit
  // - Negative lookbehind/lookahead used instead of \b so "750ML" (no space)
  //   matches the same as "750 ML" — \b would require a word/non-word
  //   transition that fails between a digit and a letter.
  if (/fl\.?\s*oz\.?|fluid\s*ounces?/.test(cleaned)) return { value, unit: "fl_oz" };
  if (/(?<![a-z])ml(?![a-z])|milliliters?|millilitres?/.test(cleaned)) return { value, unit: "ml" };
  if (/(?<![a-z\d])l(?![a-z])|liters?|litres?/.test(cleaned)) return { value, unit: "l" };
  return null;
}

/**
 * Collapse whitespace but preserve case — used by the warning verbatim
 * check, where ALL CAPS detection is a SEPARATE strict step downstream.
 */
export function normalizeWarningText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
