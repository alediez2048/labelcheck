/**
 * Mock provider tests.
 *
 * Two kinds of assertion: type-level guards that fail `pnpm build` if a
 * `verdict` or `confidence` field is added to the response (D4, D5
 * enforcement at compile time) and runtime Vitest tests that assert the
 * canned fixtures match what the matching engine in P1-3 expects.
 */

import { describe, expect, it } from "vitest";

import { MockVisionProvider } from "../mock";
import type {
  ExtractionRequest,
  ExtractionResponse,
  VisionProvider,
} from "../types";

// ---------------------------------------------------------------------------
// Type-level assertions — fail at build time if the contract drifts.
// ---------------------------------------------------------------------------

const _typecheck_provider: VisionProvider = new MockVisionProvider();
void _typecheck_provider;

/**
 * The response shape must NOT carry a verdict or overall confidence — those
 * belong to P1-3 (matching) and P1-5 (triage), not the provider (D4, D5).
 * If a future change adds either field, these type-level guards stop
 * compiling.
 */
type _ResponseHasNoVerdict = "verdict" extends keyof ExtractionResponse
  ? never
  : true;
type _ResponseHasNoOverallConfidence = "confidence" extends keyof ExtractionResponse
  ? never
  : true;
const _verdict_guard: _ResponseHasNoVerdict = true;
const _confidence_guard: _ResponseHasNoOverallConfidence = true;
void _verdict_guard;
void _confidence_guard;

// ---------------------------------------------------------------------------
// Runtime assertions.
// ---------------------------------------------------------------------------

const provider = new MockVisionProvider();
const baseRequest: Omit<ExtractionRequest, "applicationId"> = {
  beverageType: "wine",
  faces: [],
  fieldSchema: [],
};

describe("MockVisionProvider", () => {
  it("returns canned green-match data for sample-green-001", async () => {
    const result = await provider.extract({
      ...baseRequest,
      applicationId: "sample-green-001",
    });
    expect(result.faces.length).toBe(2);
    expect(result.faces[0]?.kind).toBe("front");
    expect(result.faces[0]?.fields.brand_name).toBe("HARBOR MIST");
    expect(result.faces[1]?.warning.presence).toBe(true);
    expect(result.faces[1]?.warning.allCaps).toBe(true);
  });

  it("returns 45% ALC/VOL on the front face for sample-abv-mismatch-001", async () => {
    const result = await provider.extract({
      ...baseRequest,
      applicationId: "sample-abv-mismatch-001",
    });
    expect(result.faces[0]?.fields.alcohol_content).toBe("45% ALC/VOL");
  });

  it("returns warning with allCaps:false for sample-warning-titlecase-001", async () => {
    const result = await provider.extract({
      ...baseRequest,
      applicationId: "sample-warning-titlecase-001",
    });
    expect(result.faces[1]?.warning.presence).toBe(true);
    expect(result.faces[1]?.warning.allCaps).toBe(false);
  });

  it("returns a neutral front-face-only fallback for unknown IDs", async () => {
    const result = await provider.extract({
      ...baseRequest,
      applicationId: "unknown-sample-999",
    });
    expect(result.faces.length).toBe(1);
    expect(result.faces[0]?.warning.presence).toBe(false);
  });
});
