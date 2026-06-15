/**
 * Smoke test — proves the Vitest runner is wired. If this fails, nothing
 * else in the test surface runs either.
 */

import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
