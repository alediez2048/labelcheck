/**
 * Application submission validation tests.
 *
 * Asserts the per-beverage-type required-field check (driven by
 * `config/fields-by-type.json`) is honoured and that the result shape
 * is UI-friendly (no raw zod paths leak through).
 */

import { describe, expect, it } from "vitest";

import { validateApplication } from "../application";

function jpegBuffer(size = 64): Buffer {
  return Buffer.alloc(size, 0xff);
}

function spiritsForm() {
  return {
    brandName: "OLD CEDAR",
    fancifulName: "",
    classType: "KENTUCKY STRAIGHT BOURBON",
    alcoholContent: "40%",
    netContents: "750 ML",
    producerName: "OLD CEDAR DISTILLERY",
    producerAddress: "456 BARREL LN, LOUISVILLE KY",
    countryOfOrigin: "",
  };
}

function wineForm() {
  return {
    brandName: "HARBOR MIST",
    fancifulName: "Coastal White",
    classType: "TABLE WINE",
    alcoholContent: "12.5%",
    netContents: "750 ML",
    producerName: "HARBOR MIST CELLARS",
    producerAddress: "123 VINE ST, NAPA CA",
    countryOfOrigin: "USA",
  };
}

function faceInput(kind: "front" | "back" | "neck" = "front") {
  return { kind, bytes: jpegBuffer(), mime: "image/jpeg" as const };
}

describe("validateApplication", () => {
  it("accepts a valid distilled-spirits submission", () => {
    const result = validateApplication({
      beverageType: "distilled_spirits",
      form: spiritsForm(),
      faces: [faceInput()],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a valid wine submission with countryOfOrigin", () => {
    const result = validateApplication({
      beverageType: "wine",
      form: wineForm(),
      faces: [faceInput()],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects wine submission missing countryOfOrigin (FR-3)", () => {
    const result = validateApplication({
      beverageType: "wine",
      form: { ...wineForm(), countryOfOrigin: "" },
      faces: [faceInput()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.countryOfOrigin).toBeDefined();
    }
  });

  it("does NOT require countryOfOrigin for distilled spirits (FR-3, A10)", () => {
    const result = validateApplication({
      beverageType: "distilled_spirits",
      form: { ...spiritsForm(), countryOfOrigin: "" },
      faces: [faceInput()],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects submission with zero faces", () => {
    const result = validateApplication({
      beverageType: "distilled_spirits",
      form: spiritsForm(),
      faces: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formErrors.length).toBeGreaterThan(0);
    }
  });

  it("rejects submission with too many faces", () => {
    const result = validateApplication({
      beverageType: "distilled_spirits",
      form: spiritsForm(),
      faces: [
        faceInput("front"),
        faceInput("back"),
        faceInput("neck"),
        faceInput("front"),
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty brand name with a UI-friendly error (not a zod path)", () => {
    const result = validateApplication({
      beverageType: "distilled_spirits",
      form: { ...spiritsForm(), brandName: "" },
      faces: [faceInput()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.brandName).toMatch(/Brand name/i);
      // No zod path strings (e.g. "form.brandName") leaking through.
      expect(result.fieldErrors.brandName).not.toMatch(/form\./);
    }
  });
});
