/**
 * Integration tests for POST /api/verify.
 *
 * These tests drive the route handler directly by constructing a `Request`
 * and calling `POST(req)` — no Next.js dev server, no network. The seam
 * we exercise here is the one a real client sees: JSON in, JSON out, status
 * codes that match the FR-14 / FR-16 / FR-26b contract.
 *
 * AC coverage:
 *   - AC-1: clean wine pair → lane=match, no per-field flags.
 *   - AC-2: ABV mismatch → lane=mismatch, alcohol_content surfaces.
 *   - AC-6: unreadable face → lane=review, extractionFailed=true,
 *           recommendation=return_unreadable_image (NOT a 500).
 *   - Validation failure: missing required field → 400 with plain-language
 *           error and `fields` listing the broken keys.
 *
 * The unreadable-image case mocks `getProvider()` to return an empty face,
 * mirroring the pattern from `lib/extraction/__tests__/service.test.ts`.
 * That's the right seam — the route handler delegates to the extraction
 * service which calls `getProvider()`; stubbing higher up the stack would
 * skip the very integration we're trying to verify.
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";
import * as configModule from "@/lib/config";
import * as providerModule from "@/lib/provider";
import { MockVisionProvider } from "@/lib/provider/mock";
import type { ExtractionRequest, ExtractionResponse } from "@/lib/provider";
import type { VerificationResult } from "@/types";

/**
 * Test-only canonical warning text. The repo ships a placeholder in
 * `config/warning.json` until A18 is resolved, which means the warning
 * matcher would reject every transcribed warning at integration time.
 * The integration tests inject a real canonical via `getWarningConfig`
 * so the routing logic is what's under test, not the placeholder. When
 * A18 lands and the config carries a real verbatim text, this stub is
 * still correct: the matcher compares whatever the test provider
 * returns to whatever this constant says, and the path is exercised.
 */
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

/**
 * Tiny synthetic JPEG so we can feed real bytes through preprocessing
 * without committing fixture binaries into the test file. Pattern lifted
 * from `lib/extraction/__tests__/service.test.ts`.
 */
async function jpeg(width = 200, height = 150): Promise<string> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buf.toString("base64");
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

const SPIRITS_FORM = {
  brandName: "OLD CEDAR",
  classType: "KENTUCKY STRAIGHT BOURBON",
  alcoholContent: "40%",
  netContents: "750 ML",
  producerName: "OLD CEDAR DISTILLERY",
  producerAddress: "456 BARREL LN, LOUISVILLE KY",
};

describe("POST /api/verify", () => {
  const originalProvider = process.env.PROVIDER;

  beforeEach(() => {
    process.env.PROVIDER = "mock";
    // Override the warning config globally — see TEST_WARNING_CONFIG
    // above. The matching engine reads from this accessor (P1-3); the
    // route handler delegates to the engine without re-wiring config.
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    process.env.PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC-1
  // -------------------------------------------------------------------------

  it("AC-1: green pair → 200, lane=match, no per-field flags", async () => {
    // Inject a provider that returns a clean wine extraction whose
    // warning text matches the LIVE canonical config. The bundled mock
    // ships its own canonical (post-A18 wording), which doesn't match
    // the placeholder still in config/warning.json. Reading the live
    // canonical here lets AC-1 stay green when A18 lands without
    // churning the test.
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-green",
      extract: async (_req): Promise<ExtractionResponse> => ({
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

    const frontBytes = await jpeg();
    const backBytes = await jpeg();

    const res = await POST(
      buildRequest({
        applicationId: "sample-green-001",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [
          { kind: "front", bytes: frontBytes, mime: "image/jpeg" },
          { kind: "back", bytes: backBytes, mime: "image/jpeg" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("match");
    expect(body.extractionFailed).toBe(false);
    expect(body.recommendation).toBeUndefined();
    expect(body.flags).toEqual([]);
    expect(body.fields.length).toBeGreaterThan(0);
    // No field reports a mismatch verdict.
    for (const f of body.fields) {
      expect(f.verdict).not.toBe("mismatch");
    }
  });

  // -------------------------------------------------------------------------
  // AC-2
  // -------------------------------------------------------------------------

  it("AC-2: ABV mismatch → 200, lane=mismatch, alcohol_content surfaces", async () => {
    // ABV is the surface failure. Warning passes (canonical text from
    // the live config) so the mismatch lane is driven by the alcohol
    // field alone — that's the FR-15 "identify the specific differing
    // field" guarantee on the wire.
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-abv-mismatch",
      extract: async (_req): Promise<ExtractionResponse> => ({
        faces: [
          {
            kind: "front",
            fields: {
              brand_name: "OLD CEDAR",
              class_type: "KENTUCKY STRAIGHT BOURBON",
              alcohol_content: "45% ALC/VOL", // label says 45; form says 40
              net_contents: "750 ML",
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
              brand_name: "OLD CEDAR",
              producer_name: "OLD CEDAR DISTILLERY",
              producer_address: "456 BARREL LN, LOUISVILLE KY",
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

    const frontBytes = await jpeg();
    const backBytes = await jpeg();

    const res = await POST(
      buildRequest({
        applicationId: "sample-abv-mismatch-001",
        beverageType: "distilled_spirits",
        form: SPIRITS_FORM,
        faces: [
          { kind: "front", bytes: frontBytes, mime: "image/jpeg" },
          { kind: "back", bytes: backBytes, mime: "image/jpeg" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("mismatch");
    expect(body.extractionFailed).toBe(false);

    const abv = body.fields.find((f) => f.field === "alcohol_content");
    expect(abv).toBeDefined();
    expect(abv?.verdict).toBe("mismatch");
    // The per-field reason carries the actual values so the agent's
    // attention goes to the specific differing field (FR-15).
    expect(abv?.reason.toLowerCase()).toContain("alcohol");
  });

  // -------------------------------------------------------------------------
  // AC-6 — Unreadable face
  // -------------------------------------------------------------------------

  it("AC-6: unreadable face → 200, lane=review, extractionFailed=true, recommendation=return_unreadable_image", async () => {
    // Stub the provider to return an empty front-face extraction — no
    // transcribed fields and warning.presence=false. That's the wire-
    // level signal for "image unreadable / model decline" per FR-26b.
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-unreadable",
      extract: async (_req: ExtractionRequest): Promise<ExtractionResponse> => ({
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

    const frontBytes = await jpeg();
    const res = await POST(
      buildRequest({
        applicationId: "sample-unreadable-001",
        beverageType: "distilled_spirits",
        form: SPIRITS_FORM,
        faces: [{ kind: "front", bytes: frontBytes, mime: "image/jpeg" }],
      }),
    );

    expect(res.status).toBe(200); // NOT a 500
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("review");
    expect(body.extractionFailed).toBe(true);
    expect(body.recommendation).toBe("return_unreadable_image");
    // The affected face must be cited in a plain-language flag.
    expect(body.flags.length).toBeGreaterThan(0);
    expect(body.flags[0]?.toLowerCase()).toContain("front");
    // No matching has run — no per-field results to mislead the agent.
    expect(body.fields).toEqual([]);
  });

  it("does NOT short-circuit when the warning is the only signal on a face", async () => {
    // A face that has a warning detected but no transcribable field
    // values is NOT unreadable — there IS usable text, just on a face
    // dedicated to the warning. Guards against an over-eager short-
    // circuit that would false-flag the typical back face.
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-warning-only",
      extract: async (_req): Promise<ExtractionResponse> => ({
        faces: [
          {
            kind: "front",
            fields: {
              brand_name: "OLD CEDAR",
              alcohol_content: "40% ALC/VOL",
              net_contents: "750 ML",
              class_type: "KENTUCKY STRAIGHT BOURBON",
              producer_name: "OLD CEDAR DISTILLERY",
              producer_address: "456 BARREL LN, LOUISVILLE KY",
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
            fields: { government_warning: CANONICAL_WARNING_TEXT },
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

    const frontBytes = await jpeg();
    const backBytes = await jpeg();
    const res = await POST(
      buildRequest({
        applicationId: "sample-warning-only-back",
        beverageType: "distilled_spirits",
        form: SPIRITS_FORM,
        faces: [
          { kind: "front", bytes: frontBytes, mime: "image/jpeg" },
          { kind: "back", bytes: backBytes, mime: "image/jpeg" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.extractionFailed).toBe(false);
    expect(body.recommendation).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Validation failures
  // -------------------------------------------------------------------------

  it("missing required field → 400 with plain-language message (no zod path)", async () => {
    const frontBytes = await jpeg();
    const res = await POST(
      buildRequest({
        applicationId: "sample-missing-brand",
        beverageType: "distilled_spirits",
        form: { ...SPIRITS_FORM, brandName: "" },
        faces: [{ kind: "front", bytes: frontBytes, mime: "image/jpeg" }],
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: string[] };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(body.error.toLowerCase()).toContain("brand");
    // No zod-style path leaks ("form.brandName") — NFR-2.
    expect(body.error).not.toMatch(/form\./);
    expect(body.fields).toContain("brandName");
  });

  it("missing applicationId → 400 with a clear message", async () => {
    const res = await POST(
      buildRequest({
        beverageType: "wine",
        form: WINE_FORM,
        faces: [{ kind: "front", bytes: await jpeg(), mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: string[] };
    expect(body.fields).toContain("applicationId");
  });

  it("malformed JSON body → 400", async () => {
    const req = new Request("http://localhost/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("missing face bytes → 400 with a per-face field path", async () => {
    const res = await POST(
      buildRequest({
        applicationId: "sample-empty-face",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [{ kind: "front", bytes: "", mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: string[] };
    expect(body.error.toLowerCase()).toContain("face");
  });

  // -------------------------------------------------------------------------
  // Smoke: extraction service is still being invoked end to end
  // -------------------------------------------------------------------------

  it("invokes the provider exactly once per request (D14)", async () => {
    const realMock = new MockVisionProvider();
    const callSpy = vi.fn(
      async (req: ExtractionRequest): Promise<ExtractionResponse> =>
        realMock.extract(req),
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-count",
      extract: callSpy,
    });

    await POST(
      buildRequest({
        applicationId: "sample-green-001",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [
          { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
          { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
        ],
      }),
    );

    expect(callSpy).toHaveBeenCalledTimes(1);
  });
});
