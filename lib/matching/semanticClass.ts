/**
 * Semantic class/type fallback — asks the Anthropic model whether
 * two class strings describe the same TTB beverage classification.
 *
 * Used when the deterministic matcher (containment + Levenshtein)
 * returns mismatch for class/type. Real TTB labels routinely use the
 * specific varietal ("GRÜNER VELTLINER", "PINOT NOIR") while the form
 * has the broader category ("TABLE WHITE WINE", "TABLE RED WINE").
 * These are the SAME thing for compliance — a Grüner Veltliner IS a
 * table white wine — but Levenshtein has no way to know that.
 *
 * Cache by `<formNorm>::<labelNorm>` so a repeated upload of the same
 * pair doesn't re-pay the round trip.
 *
 * Vercel-safe: the SDK is loaded lazily and the call is short (<1s
 * typical). On any error, returns false so the fallback to the
 * original fuzzy verdict is the safe default.
 */

const cache = new Map<string, boolean>();

function cacheKey(formValue: string, labelValue: string): string {
  return `${formValue.toLowerCase().trim()}::${labelValue.toLowerCase().trim()}`;
}

export async function semanticClassMatch(
  formValue: string,
  labelValue: string,
): Promise<boolean> {
  const key = cacheKey(formValue, labelValue);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return false;
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

    const prompt =
      `Are these two strings describing the same TTB-regulated alcoholic ` +
      `beverage classification, accounting for language, varietal vs. ` +
      `category, and synonyms?\n\n` +
      `Form value: "${formValue}"\n` +
      `Label read: "${labelValue}"\n\n` +
      `Answer with one word only: YES if they describe the same class ` +
      `(e.g. "TABLE WHITE WINE" and "GRÜNER VELTLINER" both describe a ` +
      `still white wine), NO if they describe different classes (e.g. ` +
      `"BOURBON" and "GIN"). Strict on category boundaries (wine vs ` +
      `spirits vs malt), tolerant within a category (varietal vs broad ` +
      `category).`;

    const response = await client.messages.create({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .map((b) =>
        b.type === "text" ? (b as { type: "text"; text: string }).text : "",
      )
      .join("")
      .trim()
      .toUpperCase();

    const isMatch = text.startsWith("YES");
    cache.set(key, isMatch);
    return isMatch;
  } catch {
    cache.set(key, false);
    return false;
  }
}
