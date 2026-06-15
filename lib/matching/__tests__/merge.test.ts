/**
 * Multi-face merge tests (D12, FR-15).
 *
 * Two test surfaces:
 *
 *   1. `mergeFaces` — unit tests against constructed per-face FieldResult
 *      fixtures. The priority order and tie-break rules live here, so
 *      they're tested directly.
 *   2. `matchApplication` — integration tests that exercise the same
 *      multi-face cases end-to-end through the orchestrator so the
 *      wiring stays honest (the orchestrator is what callers use).
 */

import { describe, expect, it } from "vitest";

import type { WarningConfig } from "@/lib/config";
import type { ExtractionResponse, FaceExtraction } from "@/lib/provider";
import type { FaceKind, FieldName, FieldResult } from "@/types";

import { matchApplication } from "../match";
import { mergeFaces } from "../merge";

const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health " +
  "problems.";

const TEST_WARNING_CONFIG: WarningConfig = {
  version: "test",
  canonicalText: CANONICAL_WARNING,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

function fieldResult(
  overrides: Partial<FieldResult> & Pick<FieldResult, "field" | "sourceFace">,
): FieldResult {
  return {
    formValue: "",
    extractedValue: null,
    verdict: "match",
    confidence: 1,
    reason: "",
    ...overrides,
  };
}

function face(
  kind: FaceKind,
  fields: Partial<Record<FieldName, string>> = {},
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
// mergeFaces — direct unit tests
// ---------------------------------------------------------------------------

describe("mergeFaces — priority order", () => {
  it("any face matches → match wins, highest-confidence face is source", () => {
    const merged = mergeFaces([
      fieldResult({
        field: "brand_name",
        sourceFace: "front",
        verdict: "match",
        confidence: 0.7,
        extractedValue: "OLD CEDAR",
      }),
      fieldResult({
        field: "brand_name",
        sourceFace: "back",
        verdict: "match",
        confidence: 0.95,
        extractedValue: "OLD CEDAR",
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("match");
    expect(merged[0].sourceFace).toBe("back");
    expect(merged[0].confidence).toBe(0.95);
  });

  it("no match but some mismatch → mismatch with highest-confidence mismatched face", () => {
    const merged = mergeFaces([
      fieldResult({
        field: "alcohol_content",
        sourceFace: "front",
        verdict: "mismatch",
        confidence: 0.6,
      }),
      fieldResult({
        field: "alcohol_content",
        sourceFace: "back",
        verdict: "mismatch",
        confidence: 0.95,
      }),
      fieldResult({
        field: "alcohol_content",
        sourceFace: "neck",
        verdict: "not_found",
        confidence: 0.5,
      }),
    ]);
    expect(merged[0].verdict).toBe("mismatch");
    expect(merged[0].sourceFace).toBe("back");
  });

  it("only low_confidence + not_found → low_confidence wins", () => {
    const merged = mergeFaces([
      fieldResult({
        field: "class_type",
        sourceFace: "front",
        verdict: "not_found",
        confidence: 0.5,
      }),
      fieldResult({
        field: "class_type",
        sourceFace: "back",
        verdict: "low_confidence",
        confidence: 0.4,
      }),
    ]);
    expect(merged[0].verdict).toBe("low_confidence");
    expect(merged[0].sourceFace).toBe("back");
  });

  it("every face not_found → merged not_found", () => {
    const merged = mergeFaces([
      fieldResult({
        field: "producer_address",
        sourceFace: null,
        verdict: "not_found",
        confidence: 0.5,
      }),
    ]);
    expect(merged[0].verdict).toBe("not_found");
    expect(merged[0].sourceFace).toBeNull();
  });

  it("tie on confidence within tier → deterministic face order (front > back > neck)", () => {
    const merged = mergeFaces([
      fieldResult({
        field: "brand_name",
        sourceFace: "neck",
        verdict: "match",
        confidence: 0.9,
      }),
      fieldResult({
        field: "brand_name",
        sourceFace: "front",
        verdict: "match",
        confidence: 0.9,
      }),
      fieldResult({
        field: "brand_name",
        sourceFace: "back",
        verdict: "match",
        confidence: 0.9,
      }),
    ]);
    expect(merged[0].sourceFace).toBe("front");
  });

  it("groups results by field — one merged result per field", () => {
    const merged = mergeFaces([
      fieldResult({ field: "brand_name", sourceFace: "front", verdict: "match" }),
      fieldResult({ field: "brand_name", sourceFace: "back", verdict: "match" }),
      fieldResult({ field: "alcohol_content", sourceFace: "front", verdict: "match" }),
    ]);
    expect(merged).toHaveLength(2);
    const fields = new Set(merged.map((r) => r.field));
    expect(fields.has("brand_name")).toBe(true);
    expect(fields.has("alcohol_content")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// matchApplication — integration tests for the multi-face scenarios
// ---------------------------------------------------------------------------

describe("matchApplication — multi-face merge integration (D12)", () => {
  const FORM = {
    brandName: "OLD CEDAR",
    classType: "KENTUCKY STRAIGHT BOURBON",
    alcoholContent: "40%",
    netContents: "750 ML",
    producerName: "OLD CEDAR DISTILLERY",
    producerAddress: "456 BARREL LN, LOUISVILLE KY",
  };

  it("single front face, no warning → warning verdict is mismatch (missing is a real defect)", () => {
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: FORM,
      extraction: extraction([
        face("front", {
          brand_name: "OLD CEDAR",
          class_type: "KENTUCKY STRAIGHT BOURBON",
          alcohol_content: "40% ALC/VOL",
          net_contents: "750 ML",
          producer_name: "OLD CEDAR DISTILLERY",
          producer_address: "456 BARREL LN, LOUISVILLE KY",
        }),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });
    const warning = results.find((r) => r.field === "government_warning");
    expect(warning?.verdict).toBe("mismatch");
    expect(warning?.reason.toLowerCase()).toContain("not present");
    // Other fields read from front.
    expect(results.find((r) => r.field === "brand_name")?.sourceFace).toBe("front");
    expect(results.find((r) => r.field === "alcohol_content")?.sourceFace).toBe("front");
  });

  it("front + back: brand/ABV on front, warning on back → all match, warning sourceFace='back'", () => {
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: FORM,
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
    for (const r of results) expect(r.verdict).toBe("match");
    const warning = results.find((r) => r.field === "government_warning");
    expect(warning?.sourceFace).toBe("back");
    expect(results.find((r) => r.field === "brand_name")?.sourceFace).toBe("front");
  });

  it("front + back + neck: brand on neck, ABV on front, warning on back → each sourceFace tagged correctly", () => {
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: FORM,
      extraction: extraction([
        face("front", {
          alcohol_content: "40% ALC/VOL",
          net_contents: "750 ML",
          class_type: "KENTUCKY STRAIGHT BOURBON",
          producer_name: "OLD CEDAR DISTILLERY",
          producer_address: "456 BARREL LN, LOUISVILLE KY",
        }),
        face(
          "back",
          { government_warning: CANONICAL_WARNING },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
        face("neck", { brand_name: "OLD CEDAR" }),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });
    expect(results.find((r) => r.field === "brand_name")?.sourceFace).toBe("neck");
    expect(results.find((r) => r.field === "alcohol_content")?.sourceFace).toBe("front");
    expect(results.find((r) => r.field === "government_warning")?.sourceFace).toBe("back");
  });

  it("front-only upload with warning ON the front → warning passes, sourceFace='front'", () => {
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: FORM,
      extraction: extraction([
        face(
          "front",
          {
            brand_name: "OLD CEDAR",
            class_type: "KENTUCKY STRAIGHT BOURBON",
            alcohol_content: "40% ALC/VOL",
            net_contents: "750 ML",
            producer_name: "OLD CEDAR DISTILLERY",
            producer_address: "456 BARREL LN, LOUISVILLE KY",
            government_warning: CANONICAL_WARNING,
          },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });
    const warning = results.find((r) => r.field === "government_warning");
    expect(warning?.verdict).toBe("match");
    expect(warning?.sourceFace).toBe("front");
  });

  it("warning altered on the back face (no other face has the warning) → mismatch, sourceFace='back'", () => {
    const altered = CANONICAL_WARNING.replace(
      "Surgeon General",
      "Surgeon Generals",
    );
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: FORM,
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
          { government_warning: altered },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });
    const warning = results.find((r) => r.field === "government_warning");
    expect(warning?.verdict).toBe("mismatch");
    expect(warning?.sourceFace).toBe("back");
  });

  it("same field on two faces with equal confidence → front wins by deterministic tie-break", () => {
    // Both faces normalize to the same string, so confidences match
    // exactly. The tie-break rule (front > back > neck) then makes the
    // outcome deterministic — important for stable test fixtures and
    // for the review UI's per-field face pointer (FR-15).
    const results = matchApplication({
      beverageType: "distilled_spirits",
      form: FORM,
      extraction: extraction([
        face("front", { brand_name: "OLD CEDAR" }),
        face(
          "back",
          {
            brand_name: "OLD CEDAR",
            government_warning: CANONICAL_WARNING,
          },
          { presence: true, allCaps: true, boldConfident: "yes" },
        ),
      ]),
      warningConfig: TEST_WARNING_CONFIG,
    });
    const brand = results.find((r) => r.field === "brand_name");
    expect(brand?.verdict).toBe("match");
    expect(brand?.sourceFace).toBe("front");
  });
});
