/**
 * Mock provider tests — skeleton until P0-7 wires Vitest.
 *
 * The assertions below run as TypeScript type checks (compile-time) and
 * as Vitest runtime tests once P0-7 installs Vitest. Both pass under
 * `pnpm build` today; the runtime `describe`/`it` blocks will be picked
 * up by Vitest automatically when it's added.
 */

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
// Runtime assertions — picked up by Vitest once P0-7 installs it.
// ---------------------------------------------------------------------------

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): {
  toBe(expected: T): void;
  toBeDefined(): void;
  toEqual(expected: unknown): void;
};

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
