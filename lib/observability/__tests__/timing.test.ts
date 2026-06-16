/**
 * Tests for `lib/observability/timing.ts`.
 *
 * Three properties matter for the P5-1 swap:
 *   1. The wrapped function's value is returned verbatim.
 *   2. The duration reflects actual wall-clock cost (≥ 0; not zero on
 *      a noticeably slow function).
 *   3. Thrown errors propagate — the helper does NOT swallow them and
 *      does NOT return a tuple on the throw path.
 */

import { describe, expect, it } from "vitest";

import { timed } from "../timing";

describe("timed", () => {
  it("resolves to the wrapped function's value", async () => {
    const { result } = await timed(async () => 42);
    expect(result).toBe(42);
  });

  it("returns a non-negative duration that reflects the wait", async () => {
    const { durationMs } = await timed(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // Wall-clock jitter on a CI box can swing by a few ms either way;
    // 8 is the conservative lower bound the prompt called out.
    expect(durationMs).toBeGreaterThanOrEqual(8);
  });

  it("returns a duration of 0 or more for an instant resolve", async () => {
    const { durationMs } = await timed(async () => "ok");
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates thrown errors instead of returning a tuple", async () => {
    await expect(
      timed(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
