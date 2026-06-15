/**
 * Extraction service tests — exercises the seam between the validated
 * Application shape and the provider adapter via the mock.
 *
 * The job-critical assertions:
 *   1. ONE provider call per application — never N sequential calls (D14).
 *   2. ALL faces attached to that one call.
 *   3. Response is text-only + warning flags — no `verdict`, no overall
 *      confidence (D4, D5; type-level guard already in
 *      lib/provider/__tests__/mock.test.ts; this asserts at runtime).
 *   4. The per-beverage-type field schema is read from config and passed
 *      through to the provider (FR-25).
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extract, type ExtractableApplication } from "../service";
import type { ExtractionRequest, ExtractionResponse } from "@/lib/provider";
import * as providerModule from "@/lib/provider";
import { MockVisionProvider } from "@/lib/provider/mock";

/** Tiny synthetic JPEG so we can feed real bytes through preprocessing. */
async function jpeg(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe("extraction service", () => {
  const originalProvider = process.env.PROVIDER;

  beforeEach(() => {
    process.env.PROVIDER = "mock";
  });

  afterEach(() => {
    process.env.PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  it("calls the provider exactly once per application (D14)", async () => {
    // Use the real mock directly — calling `getProvider()` inside the
    // spy would recurse because the spy IS the override for `getProvider`.
    const realMock = new MockVisionProvider();
    const callSpy = vi.fn(
      async (req: ExtractionRequest): Promise<ExtractionResponse> => {
        return realMock.extract(req);
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy",
      extract: callSpy,
    });

    const app: ExtractableApplication = {
      id: "sample-green-001",
      beverageType: "wine",
      faces: [
        { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
      ],
    };

    await extract(app);

    expect(callSpy).toHaveBeenCalledTimes(1);
  });

  it("attaches every face to the single provider call", async () => {
    let captured: ExtractionRequest | null = null;
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy",
      extract: async (req) => {
        captured = req;
        return { faces: [] };
      },
    });

    const app: ExtractableApplication = {
      id: "sample-multi",
      beverageType: "wine",
      faces: [
        { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "neck", bytes: await jpeg(), mime: "image/jpeg" },
      ],
    };

    await extract(app);

    expect(captured).not.toBeNull();
    expect(captured!.faces.length).toBe(3);
    expect(captured!.faces.map((f) => f.kind)).toEqual([
      "front",
      "back",
      "neck",
    ]);
  });

  it("returns transcribed text and warning flags only — no verdict", async () => {
    const app: ExtractableApplication = {
      id: "sample-green-001",
      beverageType: "wine",
      faces: [
        { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
      ],
    };

    const result = await extract(app);

    expect(result.faces.length).toBeGreaterThan(0);
    for (const face of result.faces) {
      // No verdict key at the response level
      expect("verdict" in face).toBe(false);
      // No overall confidence at the response level (D5)
      expect("confidence" in face).toBe(false);
      // Warning carries the four structural flags (D6)
      expect(typeof face.warning.presence).toBe("boolean");
      expect(typeof face.warning.allCaps).toBe("boolean");
      expect(["yes", "no", "uncertain"]).toContain(face.warning.boldConfident);
      expect(["good", "low"]).toContain(face.warning.legibility);
    }
  });

  it("passes the per-beverage-type field schema to the provider (FR-25)", async () => {
    let captured: ExtractionRequest | null = null;
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy",
      extract: async (req) => {
        captured = req;
        return { faces: [] };
      },
    });

    const wineApp: ExtractableApplication = {
      id: "wine-x",
      beverageType: "wine",
      faces: [{ kind: "front", bytes: await jpeg(), mime: "image/jpeg" }],
    };

    await extract(wineApp);

    expect(captured).not.toBeNull();
    // The wine schema includes country_of_origin (FR-3).
    expect(captured!.fieldSchema).toContain("country_of_origin");
    // Government warning is always in the schema (FR-11).
    expect(captured!.fieldSchema).toContain("government_warning");
  });
});
