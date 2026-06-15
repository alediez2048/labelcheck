/**
 * Configuration loader tests — skeleton until P0-7 wires Vitest.
 *
 * Two job-critical assertions live here:
 *
 *   1. The A18 placeholder sentinel is present in `config/warning.json`.
 *      This is INVERTED — the test passes while A18 is open, and FAILS
 *      the day someone replaces the placeholder. That forces a deliberate
 *      removal of this test as part of resolving A18, ensuring the team
 *      cannot silently ship with a paraphrased warning string.
 *
 *   2. The per-field tolerances and the per-type required-field lists
 *      load and parse cleanly without runtime errors.
 *
 * Picked up by Vitest automatically when P0-7 installs it. Type checks
 * happen today under `pnpm build`.
 */

import {
  getRequiredFields,
  getTolerances,
  getWarningConfig,
  _resetConfigCacheForTesting,
} from "../index";

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function beforeEach(fn: () => void): void;
declare function expect<T>(value: T): {
  toBe(expected: T): void;
  toBeDefined(): void;
  toContain(expected: string): void;
  toEqual(expected: unknown): void;
  toMatch(expected: RegExp): void;
};

describe("config loaders", () => {
  beforeEach(() => {
    _resetConfigCacheForTesting();
  });

  it("loads warning.json and exposes the A18 placeholder (delete this test when A18 is resolved)", () => {
    const cfg = getWarningConfig();
    expect(cfg.canonicalText).toContain("__TODO_VERBATIM_TEXT_A18__");
    expect(cfg.headingText).toBe("GOVERNMENT WARNING:");
    expect(cfg.headingCapsRequired).toBe(true);
    expect(cfg.headingBoldEnforcement).toBe("best_effort");
  });

  it("loads tolerances.json with ABV stated-equals-stated (FR-9, A19)", () => {
    const t = getTolerances();
    expect(t.brandName.rule).toBe("fuzzy");
    expect(t.alcoholContent.rule).toBe("stated_equals_stated");
    expect(t.countryOfOrigin.rule).toBe("exact");
  });

  it("returns countryOfOrigin for wine but not for distilled_spirits (FR-3)", () => {
    const wine = getRequiredFields("wine");
    const spirits = getRequiredFields("distilled_spirits");
    expect(wine).toContain("countryOfOrigin");
    expect(spirits).toContain("brandName");
    // distilled_spirits does NOT require countryOfOrigin
    const spiritsHasCountry = spirits.includes("countryOfOrigin");
    expect(spiritsHasCountry).toBe(false);
  });

  it("memoises — repeated calls return the same object reference", () => {
    const a = getWarningConfig();
    const b = getWarningConfig();
    expect(a).toBe(b);
  });
});
