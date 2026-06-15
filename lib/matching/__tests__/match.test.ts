/**
 * Matching engine tests — per-field + orchestrator.
 *
 * The acceptance-criteria-aligned tests are tagged in the description
 * strings so the eventual P1-10 golden-set harness can grep them when
 * tracing AC numbers back to runtime tests.
 *
 * The warning matcher tests pass a fixed `WarningConfig` rather than
 * relying on `config/warning.json`'s A18 placeholder — `config/warning.json`
 * exists explicitly so that a "real" warning text comparison would
 * always fail (which is the placeholder's design). Tests should not
 * depend on that placeholder.
 */

import { describe, expect, it } from "vitest";

import type { WarningConfig } from "@/lib/config";
import type { ExtractionResponse, FaceExtraction } from "@/lib/provider";

import { matchAbv } from "../abv";
import { matchFuzzy } from "../fuzzy";
import { matchApplication } from "../match";
import { matchNetContents } from "../netContents";
import { matchOrigin } from "../origin";
import { matchWarning } from "../warning";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health " +
  "problems.";

const TITLE_CASED_WARNING = CANONICAL_WARNING.replace(
  "GOVERNMENT WARNING:",
  "Government Warning:",
);

const TEST_WARNING_CONFIG: WarningConfig = {
  version: "test",
  canonicalText: CANONICAL_WARNING,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

function face(
  kind: "front" | "back" | "neck",
  fields: Record<string, string> = {},
  warning: {
    presence?: boolean;
    allCaps?: boolean;
    boldConfident?: "yes" | "no" | "uncertain";
    legibility?: "good" | "low";
  } = {},
): FaceExtraction {
  return {
    kind,
    fields: fields as FaceExtraction["fields"],
    warning: {
      presence: warning.presence ?? false,
      allCaps: warning.allCaps ?? false,
      boldConfident: warning.boldConfident ?? "no",
      legibility: warning.legibility ?? "good",
    },
  };
}

function extraction(faces: FaceExtraction[]): ExtractionResponse {
  return { faces };
}

// ---------------------------------------------------------------------------
// Fuzzy field matcher (brand, class/type, producer)
// ---------------------------------------------------------------------------

describe("matchFuzzy (FR-8, AC-5)", () => {
  it("AC-5: STONE'S THROW vs Stone's Throw → match", () => {
    const result = matchFuzzy({
      field: "brand_name",
      formValue: "Stone's Throw",
      extracted: { value: "STONE'S THROW", face: "front" },
      minSimilarity: 0.92,
      fieldLabel: "Brand name",
    });
    expect(result.verdict).toBe("match");
  });

  it("flags genuine brand differences (Old Cedar vs Old Cherry)", () => {
    const result = matchFuzzy({
      field: "brand_name",
      formValue: "OLD CHERRY",
      extracted: { value: "OLD CEDAR", face: "front" },
      minSimilarity: 0.92,
      fieldLabel: "Brand name",
    });
    expect(result.verdict).toBe("mismatch");
  });

  it("returns not_found when the field is not on any face", () => {
    const result = matchFuzzy({
      field: "brand_name",
      formValue: "STONE'S THROW",
      extracted: null,
      minSimilarity: 0.92,
      fieldLabel: "Brand name",
    });
    expect(result.verdict).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// ABV matcher (FR-9, AC-2, A19 simplification)
// ---------------------------------------------------------------------------

describe("matchAbv (FR-9, AC-2)", () => {
  it("AC-2: form 40% vs label 45% → mismatch", () => {
    const result = matchAbv({
      formValue: "40%",
      extracted: { value: "45% ALC/VOL", face: "front" },
    });
    expect(result.verdict).toBe("mismatch");
  });

  it("matches stated-equals-stated (40% vs 40% ALC/VOL)", () => {
    const result = matchAbv({
      formValue: "40%",
      extracted: { value: "40% ALC/VOL", face: "front" },
    });
    expect(result.verdict).toBe("match");
  });

  it("matches with decimal precision (12.5% vs 12.5%)", () => {
    const result = matchAbv({
      formValue: "12.5%",
      extracted: { value: "12.5% ALC/VOL", face: "front" },
    });
    expect(result.verdict).toBe("match");
  });
});

// ---------------------------------------------------------------------------
// Net contents matcher (FR-10, AC-?)
// ---------------------------------------------------------------------------

describe("matchNetContents (FR-10)", () => {
  it("750 mL vs 750ML → match (unit case + space normalised)", () => {
    const result = matchNetContents({
      formValue: "750 mL",
      extracted: { value: "750ML", face: "front" },
    });
    expect(result.verdict).toBe("match");
  });

  it("750 mL vs 375 mL → mismatch", () => {
    const result = matchNetContents({
      formValue: "750 mL",
      extracted: { value: "375 mL", face: "front" },
    });
    expect(result.verdict).toBe("mismatch");
  });

  it("12 FL OZ vs 12 fl. oz. → match (unit punctuation normalised)", () => {
    const result = matchNetContents({
      formValue: "12 FL OZ",
      extracted: { value: "12 fl. oz.", face: "front" },
    });
    expect(result.verdict).toBe("match");
  });

  it("750 ML vs 0.75 L → mismatch (we do not cross-convert units)", () => {
    const result = matchNetContents({
      formValue: "750 ML",
      extracted: { value: "0.75 L", face: "front" },
    });
    expect(result.verdict).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// Country of origin (exact, conditional)
// ---------------------------------------------------------------------------

describe("matchOrigin", () => {
  it("USA vs USA → match", () => {
    const result = matchOrigin({
      formValue: "USA",
      extracted: { value: "USA", face: "back" },
    });
    expect(result.verdict).toBe("match");
  });

  it("USA vs France → mismatch", () => {
    const result = matchOrigin({
      formValue: "USA",
      extracted: { value: "France", face: "back" },
    });
    expect(result.verdict).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// Government warning (FR-11, FR-12, AC-3, AC-4, D6)
// ---------------------------------------------------------------------------

describe("matchWarning (FR-11, FR-12, D6)", () => {
  it("AC-4: warning missing on every face → mismatch", () => {
    const result = matchWarning({
      faces: [face("front"), face("back")],
      config: TEST_WARNING_CONFIG,
    });
    expect(result.verdict).toBe("mismatch");
    expect(result.reason.toLowerCase()).toContain("not present");
  });

  it("AC-3: 'Government Warning:' title-case heading → mismatch (caps strict)", () => {
    const result = matchWarning({
      faces: [
        face(
          "back",
          { government_warning: TITLE_CASED_WARNING },
          { presence: true, allCaps: false, boldConfident: "yes" },
        ),
      ],
      config: TEST_WARNING_CONFIG,
    });
    expect(result.verdict).toBe("mismatch");
  });

  it("verbatim drift (one word swapped) → mismatch", () => {
    const altered = CANONICAL_WARNING.replace("Surgeon General", "Surgeon Generals");
    const result = matchWarning({
      faces: [
        face(
          "back",
          { government_warning: altered },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ],
      config: TEST_WARNING_CONFIG,
    });
    expect(result.verdict).toBe("mismatch");
  });

  it("bold uncertain → low_confidence (D6)", () => {
    const result = matchWarning({
      faces: [
        face(
          "back",
          { government_warning: CANONICAL_WARNING },
          { presence: true, allCaps: true, boldConfident: "uncertain" },
        ),
      ],
      config: TEST_WARNING_CONFIG,
    });
    expect(result.verdict).toBe("low_confidence");
    expect(result.reason.toLowerCase()).toContain("bold");
  });

  it("presence + verbatim + ALL CAPS + bold confirmed → match", () => {
    const result = matchWarning({
      faces: [
        face(
          "back",
          { government_warning: CANONICAL_WARNING },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ],
      config: TEST_WARNING_CONFIG,
    });
    expect(result.verdict).toBe("match");
  });

  it("found across faces (D12): warning on back face only is still present", () => {
    const result = matchWarning({
      faces: [
        face("front"),
        face(
          "back",
          { government_warning: CANONICAL_WARNING },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ],
      config: TEST_WARNING_CONFIG,
    });
    expect(result.verdict).toBe("match");
    expect(result.sourceFace).toBe("back");
  });
});

// ---------------------------------------------------------------------------
// Orchestrator (matchApplication)
// ---------------------------------------------------------------------------

describe("matchApplication orchestrator", () => {
  it("dispatches each required field to the right matcher", () => {
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: {
        brandName: "OLD CEDAR",
        classType: "KENTUCKY STRAIGHT BOURBON",
        alcoholContent: "40%",
        netContents: "750 ML",
        producerName: "OLD CEDAR DISTILLERY",
        producerAddress: "456 BARREL LN, LOUISVILLE KY",
      },
      extraction: extraction([
        face("front", {
          brand_name: "OLD CEDAR",
          class_type: "KENTUCKY STRAIGHT BOURBON",
          alcohol_content: "40% ALC/VOL",
          net_contents: "750 ML",
          producer_name: "OLD CEDAR DISTILLERY",
          producer_address: "456 BARREL LN, LOUISVILLE KY",
        }),
        face(
          "back",
          { government_warning: CANONICAL_WARNING },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });

    const verdicts = Object.fromEntries(
      results.map((r) => [r.field, r.verdict] as const),
    );
    expect(verdicts.brand_name).toBe("match");
    expect(verdicts.class_type).toBe("match");
    expect(verdicts.alcohol_content).toBe("match");
    expect(verdicts.net_contents).toBe("match");
    expect(verdicts.producer_name).toBe("match");
    expect(verdicts.producer_address).toBe("match");
    expect(verdicts.government_warning).toBe("match");
  });

  it("catches the ABV mismatch when form differs from label (AC-2)", () => {
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: {
        brandName: "OLD CEDAR",
        classType: "KENTUCKY STRAIGHT BOURBON",
        alcoholContent: "40%",
        netContents: "750 ML",
        producerName: "OLD CEDAR DISTILLERY",
        producerAddress: "456 BARREL LN, LOUISVILLE KY",
      },
      extraction: extraction([
        face("front", {
          brand_name: "OLD CEDAR",
          class_type: "KENTUCKY STRAIGHT BOURBON",
          alcohol_content: "45% ALC/VOL",
          net_contents: "750 ML",
          producer_name: "OLD CEDAR DISTILLERY",
          producer_address: "456 BARREL LN, LOUISVILLE KY",
        }),
        face(
          "back",
          { government_warning: CANONICAL_WARNING },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });
    const abv = results.find((r) => r.field === "alcohol_content");
    expect(abv?.verdict).toBe("mismatch");
  });
});
