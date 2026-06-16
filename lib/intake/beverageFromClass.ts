/**
 * Map a TTB "Class/Type" string to one of our three beverage types
 * (P5-8). The TTB taxonomy has ~hundreds of entries; the routing
 * model (D15) only distinguishes three buckets, so a small string
 * test is enough.
 *
 * Defaults to "distilled_spirits" — the most common bucket on the
 * curated demo set and a safe default for the rare unmapped class.
 */

import type { BeverageType } from "@/types";

const WINE_TOKENS = [
  "WINE",
  "CHAMPAGNE",
  "SAKE",
  "VERMOUTH",
  "CIDER",
  "MEAD",
];

const SPIRITS_TOKENS = [
  "WHISKY",
  "WHISKEY",
  "BOURBON",
  "RYE",
  "TEQUILA",
  "GIN",
  "VODKA",
  "RUM",
  "BRANDY",
  "LIQUEUR",
  "CORDIAL",
  "PISCO",
  "MEZCAL",
];

const MALT_TOKENS = ["ALE", "MALT", "BEER", "LAGER", "PORTER", "STOUT", "IPA"];

export function beverageFromClass(classType: string): BeverageType {
  const upper = classType.toUpperCase();
  if (WINE_TOKENS.some((t) => upper.includes(t))) return "wine";
  if (MALT_TOKENS.some((t) => upper.includes(t))) return "malt_beverage";
  if (SPIRITS_TOKENS.some((t) => upper.includes(t))) return "distilled_spirits";
  return "distilled_spirits";
}
