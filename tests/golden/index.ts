/**
 * The Phase 1 golden set — fixtures that anchor AC-1 through AC-6 plus
 * the false-negative probes from observability.md.
 *
 * Each entry is a self-contained, deterministic scenario the pipeline
 * runs against. The `applicationId` doubles as the mock provider's
 * fixture key — `lib/provider/mock.ts` has a canned response per id,
 * so the golden set is reproducible byte-for-byte under CI.
 *
 * The set is intentionally small. A bigger registry-driven evaluation
 * lands in P5-2 (the offline eval harness); P1-10 is the assertion
 * surface for "the AC sentences are executable today".
 *
 * Categories:
 *   - greenPairs            — clean match (AC-1, AC-5)
 *   - warningDefects        — title-case (AC-3) and missing warning (AC-4)
 *   - fieldMismatches       — ABV mismatch (AC-2)
 *   - unreadableImages      — face the model can't transcribe (AC-6)
 *   - falseNegativeProbes   — look clean, actually defective; lane must NEVER be 'match'
 */

import type { BeverageType, FieldName, Lane } from "@/types";

import type { SampleForm } from "@/fixtures/samples";

export type GoldenCategory =
  | "greenPairs"
  | "warningDefects"
  | "fieldMismatches"
  | "fuzzyPasses"
  | "unreadableImages"
  | "falseNegativeProbes";

export type GoldenEntry = {
  /** Unique fixture id — also the mock provider's lookup key. */
  id: string;
  category: GoldenCategory;
  /** Short description of what this fixture asserts. */
  notes: string;
  /** What ticket AC this entry exercises, for traceability. */
  acceptanceCriterion: string;
  beverageType: BeverageType;
  form: SampleForm;
  /** The triage lane this fixture must produce. */
  expectedLane: Lane;
  /** Optional — which fields must show up as flagged. */
  expectedFlaggedFields?: FieldName[];
  /** Optional — lane this fixture must NEVER produce (false-negative probes). */
  laneMustNotBe?: Lane;
};

const HARBOR_MIST_FORM: SampleForm = {
  brandName: "HARBOR MIST",
  fancifulName: "Coastal White",
  classType: "TABLE WINE",
  alcoholContent: "12.5%",
  netContents: "750 ML",
  producerName: "HARBOR MIST CELLARS",
  producerAddress: "123 VINE ST, NAPA CA",
  countryOfOrigin: "USA",
};

const OLD_CEDAR_FORM: SampleForm = {
  brandName: "OLD CEDAR",
  classType: "KENTUCKY STRAIGHT BOURBON",
  alcoholContent: "40%",
  netContents: "750 ML",
  producerName: "OLD CEDAR DISTILLERY",
  producerAddress: "456 BARREL LN, LOUISVILLE KY",
};

const CEDAR_RIDGE_FORM: SampleForm = {
  brandName: "CEDAR RIDGE",
  fancifulName: "Pale Ale",
  classType: "MALT BEVERAGE",
  alcoholContent: "5.6%",
  netContents: "12 FL OZ",
  producerName: "CEDAR RIDGE BREWING CO",
  producerAddress: "789 HOP LN, PORTLAND OR",
};

export const GOLDEN_SET: GoldenEntry[] = [
  // -----------------------------------------------------------------------
  // AC-1 — green pair → match lane
  // -----------------------------------------------------------------------
  {
    id: "sample-green-001",
    category: "greenPairs",
    acceptanceCriterion: "AC-1",
    notes: "Every form field matches the label; warning passes verbatim + caps.",
    beverageType: "wine",
    form: HARBOR_MIST_FORM,
    expectedLane: "match",
  },

  // -----------------------------------------------------------------------
  // AC-2 — ABV mismatch → mismatch lane with alcohol_content flagged
  // -----------------------------------------------------------------------
  {
    id: "sample-abv-mismatch-001",
    category: "fieldMismatches",
    acceptanceCriterion: "AC-2",
    notes: "Form ABV 40%, label ABV 45%. Must surface alcohol_content mismatch.",
    beverageType: "distilled_spirits",
    form: OLD_CEDAR_FORM,
    expectedLane: "mismatch",
    expectedFlaggedFields: ["alcohol_content"],
  },

  // -----------------------------------------------------------------------
  // AC-3 — title-case warning heading → mismatch
  // -----------------------------------------------------------------------
  {
    id: "sample-warning-titlecase-001",
    category: "warningDefects",
    acceptanceCriterion: "AC-3",
    notes:
      "Warning heading is 'Government Warning:' instead of 'GOVERNMENT WARNING:'. Strict caps fail.",
    beverageType: "malt_beverage",
    form: CEDAR_RIDGE_FORM,
    expectedLane: "mismatch",
    expectedFlaggedFields: ["government_warning"],
  },

  // -----------------------------------------------------------------------
  // AC-4 — missing warning → mismatch
  // -----------------------------------------------------------------------
  {
    id: "sample-warning-missing-001",
    category: "warningDefects",
    acceptanceCriterion: "AC-4",
    notes: "No face carries the government warning. Missing warning is a real defect.",
    beverageType: "distilled_spirits",
    form: OLD_CEDAR_FORM,
    expectedLane: "mismatch",
    expectedFlaggedFields: ["government_warning"],
  },

  // -----------------------------------------------------------------------
  // AC-5 — fuzzy brand match (apostrophe / case / whitespace tolerance)
  // -----------------------------------------------------------------------
  {
    id: "sample-fuzzy-brand-001",
    category: "fuzzyPasses",
    acceptanceCriterion: "AC-5",
    notes:
      "Label says STONE'S THROW; form says Stone's Throw. Normalisation makes this a match.",
    beverageType: "wine",
    form: {
      brandName: "Stone's Throw",
      classType: "TABLE WINE",
      alcoholContent: "13%",
      netContents: "750 ML",
      producerName: "Stone's Throw Vineyards",
      producerAddress: "9 Orchard Way, Paso Robles CA",
      countryOfOrigin: "USA",
    },
    expectedLane: "match",
  },

  // -----------------------------------------------------------------------
  // AC-6 — unreadable face → review with the "Return — unreadable image"
  // recommendation. Asserted in the route-handler tests against the wire
  // shape; here we only assert the lane.
  // -----------------------------------------------------------------------
  {
    id: "sample-unreadable-001",
    category: "unreadableImages",
    acceptanceCriterion: "AC-6",
    notes:
      "Front face has no transcribable text and reports low legibility. Route returns review lane + recommendation.",
    beverageType: "wine",
    form: HARBOR_MIST_FORM,
    expectedLane: "review",
  },

  // -----------------------------------------------------------------------
  // False-negative probes — observability.md: the headline safety metric.
  // Each probe MUST NOT land in match lane.
  // -----------------------------------------------------------------------
  {
    id: "sample-fn-probe-warning-case-001",
    category: "falseNegativeProbes",
    acceptanceCriterion: "FN-probe",
    notes:
      "Every field aligns EXCEPT the warning heading is title-case. Easy to overlook on a skim.",
    beverageType: "wine",
    form: {
      brandName: "RIVER BEND",
      fancifulName: "Cabernet",
      classType: "TABLE WINE",
      alcoholContent: "14%",
      netContents: "750 ML",
      producerName: "RIVER BEND WINERY",
      producerAddress: "12 RIVER RD, SONOMA CA",
      countryOfOrigin: "USA",
    },
    expectedLane: "mismatch",
    expectedFlaggedFields: ["government_warning"],
    laneMustNotBe: "match",
  },
  {
    id: "sample-fn-probe-abv-half-001",
    category: "falseNegativeProbes",
    acceptanceCriterion: "FN-probe",
    notes:
      "Form 40%, label 40.5%. Close enough to skim past; matcher requires stated-equals-stated.",
    beverageType: "distilled_spirits",
    form: {
      brandName: "BLACK FOREST",
      classType: "KENTUCKY STRAIGHT BOURBON",
      alcoholContent: "40%",
      netContents: "750 ML",
      producerName: "BLACK FOREST DISTILLERY",
      producerAddress: "33 OAK LN, LEXINGTON KY",
    },
    expectedLane: "mismatch",
    expectedFlaggedFields: ["alcohol_content"],
    laneMustNotBe: "match",
  },
  {
    id: "sample-fn-probe-brand-drift-001",
    category: "falseNegativeProbes",
    acceptanceCriterion: "FN-probe",
    notes:
      "Label says VINTAGE PEAK; form says VINTAGE PARK. One-character drift; should NOT clear.",
    beverageType: "wine",
    form: {
      brandName: "VINTAGE PARK",
      classType: "TABLE WINE",
      alcoholContent: "13.5%",
      netContents: "750 ML",
      producerName: "VINTAGE PEAK CELLARS",
      producerAddress: "21 RIDGE LN, NAPA CA",
      countryOfOrigin: "USA",
    },
    expectedLane: "mismatch",
    expectedFlaggedFields: ["brand_name"],
    laneMustNotBe: "match",
  },
];

export function byCategory(cat: GoldenCategory): GoldenEntry[] {
  return GOLDEN_SET.filter((g) => g.category === cat);
}
