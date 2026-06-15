/**
 * Tests for the reusable per-application pipeline.
 *
 * Mirrors a subset of the integration tests in
 * `app/api/verify/__tests__/route.test.ts` but at the function seam
 * rather than the HTTP boundary, so the batch path's confidence in
 * `runVerification` is anchored in tests that don't go through
 * NextResponse.
 *
 * The provider is mocked via the same `getProvider` spy pattern the
 * route tests use — that's the right seam: `runVerification` calls
 * `extract()` which calls `getProvider()`; stubbing higher up the
 * stack would skip the very glue we're verifying.
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runVerification } from "../runVerification";
import * as configModule from "@/lib/config";
import * as providerModule from "@/lib/provider";
import type { ExtractionResponse } from "@/lib/provider";

const CANONICAL_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

const TEST_WARNING_CONFIG: configModule.WarningConfig = {
  version: "test",
  canonicalText: CANONICAL_WARNING_TEXT,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

async function jpegBuf(): Promise<Buffer> {
  return sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

const WINE_FORM = {
  brandName: "HARBOR MIST",
  fancifulName: "Coastal White",
  classType: "TABLE WINE",
  alcoholContent: "12.5%",
  netContents: "750 ML",
  producerName: "HARBOR MIST CELLARS",
  producerAddress: "123 VINE ST, NAPA CA",
  countryOfOrigin: "USA",
};

describe("runVerification", () => {
  const originalProvider = process.env.PROVIDER;

  beforeEach(() => {
    process.env.PROVIDER = "mock";
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    process.env.PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  it("returns a structured VerificationResult for a clean run", async () => {
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-green",
      extract: async (): Promise<ExtractionResponse> => ({
        faces: [
          {
            kind: "front",
            fields: {
              brand_name: "HARBOR MIST",
              fanciful_name: "Coastal White",
              class_type: "TABLE WINE",
              alcohol_content: "12.5% ALC/VOL",
              net_contents: "750 ML",
              country_of_origin: "USA",
            },
            warning: {
              presence: false,
              allCaps: false,
              boldConfident: "no",
              legibility: "good",
            },
          },
          {
            kind: "back",
            fields: {
              brand_name: "HARBOR MIST",
              producer_name: "HARBOR MIST CELLARS",
              producer_address: "123 VINE ST, NAPA CA",
              government_warning: CANONICAL_WARNING_TEXT,
            },
            warning: {
              presence: true,
              allCaps: true,
              boldConfident: "yes",
              legibility: "good",
            },
          },
        ],
      }),
    });

    const result = await runVerification({
      applicationId: "sample-green-001",
      beverageType: "wine",
      form: WINE_FORM,
      faces: [
        { kind: "front", bytes: await jpegBuf(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpegBuf(), mime: "image/jpeg" },
      ],
    });

    expect(result.lane).toBe("match");
    expect(result.extractionFailed).toBe(false);
    expect(result.applicationId).toBe("sample-green-001");
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it("returns the unreadable-image result when no face has usable text", async () => {
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-unreadable",
      extract: async (): Promise<ExtractionResponse> => ({
        faces: [
          {
            kind: "front",
            fields: {},
            warning: {
              presence: false,
              allCaps: false,
              boldConfident: "no",
              legibility: "low",
            },
          },
        ],
      }),
    });

    const result = await runVerification({
      applicationId: "sample-unreadable",
      beverageType: "wine",
      form: WINE_FORM,
      faces: [{ kind: "front", bytes: await jpegBuf(), mime: "image/jpeg" }],
    });

    expect(result.lane).toBe("review");
    expect(result.extractionFailed).toBe(true);
    expect(result.recommendation).toBe("return_unreadable_image");
    expect(result.fields).toEqual([]);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it("returns the degraded-timeout result when extraction reports degraded", async () => {
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-timeout",
      extract: async (): Promise<ExtractionResponse> => ({
        faces: [],
        degraded: "timeout",
      }),
    });

    const result = await runVerification({
      applicationId: "sample-timeout",
      beverageType: "wine",
      form: WINE_FORM,
      faces: [{ kind: "front", bytes: await jpegBuf(), mime: "image/jpeg" }],
    });

    expect(result.lane).toBe("review");
    expect(result.extractionFailed).toBe(true);
    expect(result.recommendation).toBe("return_unreadable_image");
    expect(result.flags[0]?.toLowerCase()).toContain("could not verify");
  });
});
