/**
 * P3-3 — error-scenarios audit table, one test per row.
 *
 * Drives the real route handlers (`POST /api/verify` and `POST /api/batch`,
 * `GET /api/batch/[id]`) with constructed `Request` objects so the wire
 * shape every test asserts against IS the contract the agent's UI sees.
 *
 * No Next dev server, no network — pattern lifted from
 * `app/api/verify/__tests__/route.test.ts`. The provider is stubbed via
 * `vi.spyOn(getProvider)` so each row exercises one failure shape in
 * isolation:
 *
 *   - INVALID_INPUT      — wrong file type / missing field / malformed body
 *   - UNREADABLE_IMAGE   — empty face, no warning presence (FR-16 / FR-26b)
 *   - PROVIDER_TIMEOUT   — provider throws TimeoutError twice
 *   - PROVIDER_UNAVAILABLE — provider throws { status: 503 } twice
 *   - PROVIDER_RATE_LIMIT — provider throws { status: 429 } twice
 *   - Batch mixed       — malformed item alongside a good one
 *   - Batch body bad    — wholly-malformed body
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as VerifyPOST } from "@/app/api/verify/route";
import { POST as BatchPOST } from "@/app/api/batch/route";
import { GET as BatchGET } from "@/app/api/batch/[id]/route";
import { __resetStoreForTests } from "@/lib/batch/store";
import * as configModule from "@/lib/config";
import * as providerModule from "@/lib/provider";
import type { ExtractionRequest, ExtractionResponse } from "@/lib/provider";
import { TimeoutError } from "@/lib/provider/withTimeout";
import type { VerificationResult } from "@/types";

const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

const TEST_WARNING_CONFIG: configModule.WarningConfig = {
  version: "test",
  canonicalText: CANONICAL_WARNING,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

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

async function jpegBase64(width = 200, height = 150): Promise<string> {
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

function verifyRequest(body: unknown): Request {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function batchRequest(body: unknown): Request {
  return new Request("http://localhost/api/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("P3-3 — bad-input audit table", () => {
  const originalProvider = process.env.PROVIDER;

  beforeEach(() => {
    process.env.PROVIDER = "mock";
    __resetStoreForTests();
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    process.env.PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // INVALID_INPUT — wrong MIME (e.g. PDF) at the verify boundary
  // -------------------------------------------------------------------------

  it("INVALID_INPUT: rejects an application/pdf face mime with a 400 + plain message", async () => {
    const res = await VerifyPOST(
      verifyRequest({
        applicationId: "sample-pdf-mime",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [
          {
            kind: "front",
            // Real-looking base64 — the mime is what we want rejected.
            bytes: await jpegBase64(),
            mime: "application/pdf",
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: string[] };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    // No raw zod path leaks (NFR-2).
    expect(body.error).not.toMatch(/faces\.\d+\.mime/);
  });

  // -------------------------------------------------------------------------
  // INVALID_INPUT — missing required field (form.brandName)
  // -------------------------------------------------------------------------

  it("INVALID_INPUT: missing brandName → 400, names the field, no zod path", async () => {
    const res = await VerifyPOST(
      verifyRequest({
        applicationId: "sample-missing-brand",
        beverageType: "distilled_spirits",
        form: { ...SPIRITS_FORM, brandName: "" },
        faces: [{ kind: "front", bytes: await jpegBase64(), mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: string[] };
    expect(body.fields).toContain("brandName");
    expect(body.error.toLowerCase()).toContain("brand");
    expect(body.error).not.toMatch(/form\./);
  });

  // -------------------------------------------------------------------------
  // UNREADABLE_IMAGE — empty face, warning.presence: false
  // -------------------------------------------------------------------------

  it("UNREADABLE_IMAGE: empty face → 200, lane=review, recommendation=return_unreadable_image (FR-26b / AC-6)", async () => {
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

    const res = await VerifyPOST(
      verifyRequest({
        applicationId: "sample-unreadable",
        beverageType: "distilled_spirits",
        form: SPIRITS_FORM,
        faces: [{ kind: "front", bytes: await jpegBase64(), mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("review");
    expect(body.extractionFailed).toBe(true);
    expect(body.recommendation).toBe("return_unreadable_image");
    expect(body.flags.length).toBeGreaterThan(0);
    expect(body.flags[0]?.toLowerCase()).toContain("front");
  });

  // -------------------------------------------------------------------------
  // PROVIDER_TIMEOUT — provider throws TimeoutError on every attempt
  // -------------------------------------------------------------------------

  it("PROVIDER_TIMEOUT: provider times out twice → 200, degraded review-lane result", async () => {
    const failing = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => {
        throw new TimeoutError(8000);
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-timeout",
      extract: failing,
    });

    const res = await VerifyPOST(
      verifyRequest({
        applicationId: "sample-timeout",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [{ kind: "front", bytes: await jpegBase64(), mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("review");
    expect(body.extractionFailed).toBe(true);
    expect(body.recommendation).toBe("return_unreadable_image");
    expect(body.flags[0]).toMatch(/could not verify/i);
    // D10 — exactly two attempts (initial + one retry).
    expect(failing).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // PROVIDER_UNAVAILABLE — provider 5xx on both attempts
  // -------------------------------------------------------------------------

  it("PROVIDER_UNAVAILABLE: provider 503 twice → 200, degraded with temporarily-unavailable wording", async () => {
    const failing = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => {
        throw Object.assign(new Error("Service unavailable"), { status: 503 });
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-503",
      extract: failing,
    });

    const res = await VerifyPOST(
      verifyRequest({
        applicationId: "sample-503",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [{ kind: "front", bytes: await jpegBase64(), mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("review");
    expect(body.extractionFailed).toBe(true);
    expect(body.recommendation).toBe("return_unreadable_image");
    expect(body.flags[0]?.toLowerCase()).toContain("temporarily unavailable");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // PROVIDER_RATE_LIMIT — provider 429 on both attempts
  // -------------------------------------------------------------------------

  it("PROVIDER_RATE_LIMIT: provider 429 twice → 200, degraded with temporarily-unavailable wording", async () => {
    const failing = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => {
        throw Object.assign(new Error("Too many requests"), { status: 429 });
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-429",
      extract: failing,
    });

    const res = await VerifyPOST(
      verifyRequest({
        applicationId: "sample-429",
        beverageType: "wine",
        form: WINE_FORM,
        faces: [{ kind: "front", bytes: await jpegBase64(), mime: "image/jpeg" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationResult;
    expect(body.lane).toBe("review");
    expect(body.extractionFailed).toBe(true);
    expect(body.recommendation).toBe("return_unreadable_image");
    expect(body.flags[0]?.toLowerCase()).toContain("temporarily unavailable");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Batch — wholly-malformed body → 400 with a plain message
  // -------------------------------------------------------------------------

  it("BATCH bad body: non-object → 400 with a plain message", async () => {
    const res = await BatchPOST(batchRequest("not json"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    // No stack / framework noise leaked.
    expect(body.error).not.toMatch(/at .*\(.*\)/);
  });

  // -------------------------------------------------------------------------
  // Batch — one malformed item alongside a good one
  // -------------------------------------------------------------------------

  it("BATCH mixed: one malformed item lands as `failed` with StructuredError; good item lands `done`", async () => {
    // Pin the provider to a clean response for the good item.
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-batch-good",
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
              government_warning: CANONICAL_WARNING,
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

    const goodBytes = await jpegBase64();

    const res = await BatchPOST(
      batchRequest({
        applications: [
          {
            applicationId: "good-app-001",
            beverageType: "wine",
            form: WINE_FORM,
            faces: [
              { kind: "front", bytes: goodBytes, mime: "image/jpeg" },
              { kind: "back", bytes: goodBytes, mime: "image/jpeg" },
            ],
          },
          {
            applicationId: "malformed-app-001",
            beverageType: "wine",
            // Missing brandName — fails the per-beverage-type required check.
            form: { ...WINE_FORM, brandName: "" },
            faces: [{ kind: "front", bytes: goodBytes, mime: "image/jpeg" }],
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const { jobId } = (await res.json()) as { jobId: string };
    expect(typeof jobId).toBe("string");

    // Poll until the job finishes (the orchestrator is fire-and-forget).
    const maxPollMs = 3000;
    const start = Date.now();
    let polled;
    while (Date.now() - start < maxPollMs) {
      const pollRes = await BatchGET(
        new Request(`http://localhost/api/batch/${jobId}`),
        { params: Promise.resolve({ id: jobId }) },
      );
      polled = (await pollRes.json()) as {
        finished: boolean;
        items: Array<{
          applicationId: string;
          status: string;
          error?: {
            code: string;
            message: string;
            retryable: boolean;
          };
          result?: { lane: string };
        }>;
      };
      if (polled.finished) break;
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    expect(polled).toBeDefined();
    expect(polled!.finished).toBe(true);

    const good = polled!.items.find((i) => i.applicationId === "good-app-001");
    const bad = polled!.items.find(
      (i) => i.applicationId === "malformed-app-001",
    );
    expect(good?.status).toBe("done");
    expect(bad?.status).toBe("failed");
    // P3-3: every failed item carries a `StructuredError`-shaped error.
    expect(bad?.error?.code).toBe("INVALID_INPUT");
    expect(typeof bad?.error?.message).toBe("string");
    expect(bad?.error?.retryable).toBe(false);
  });
});
