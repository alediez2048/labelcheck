/**
 * P5-3 — effective-lane derivation (`lib/feedback/effectiveLane.ts`).
 *
 * Covers the FR-26b unreadable path and the structured-reason failure
 * path so a refactor can't silently weaken the override detection
 * downstream.
 */

import { describe, expect, it } from "vitest";

import { deriveEffectiveLane } from "@/lib/feedback/effectiveLane";

describe("deriveEffectiveLane (P5-3)", () => {
  it("approve → match (agent says it is fine)", () => {
    expect(deriveEffectiveLane({ kind: "approve" })).toBe("match");
  });

  it("return_for_correction with empty failedFields → mismatch", () => {
    expect(
      deriveEffectiveLane({
        kind: "return_for_correction",
        returnReason: { failedFields: [] },
      }),
    ).toBe("mismatch");
  });

  it("return_for_correction with one ABV failedField → mismatch", () => {
    expect(
      deriveEffectiveLane({
        kind: "return_for_correction",
        returnReason: {
          failedFields: [
            {
              reason:
                "ABV mismatch: form 40% vs label 45%",
            },
          ],
        },
      }),
    ).toBe("mismatch");
  });

  it("return_for_correction citing unreadable image → review (FR-26b)", () => {
    expect(
      deriveEffectiveLane({
        kind: "return_for_correction",
        returnReason: {
          failedFields: [
            {
              reason:
                "Front face is unreadable — please re-upload a clearer photo.",
            },
          ],
        },
      }),
    ).toBe("review");
  });

  it("return_for_correction without returnReason → mismatch", () => {
    expect(
      deriveEffectiveLane({
        kind: "return_for_correction",
      }),
    ).toBe("mismatch");
  });
});
