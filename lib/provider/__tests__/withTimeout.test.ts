/**
 * Tests for the D10 timeout + retry helpers.
 *
 * Uses Vitest fake timers so the tests don't actually sleep — the same
 * code runs against simulated time, the assertions don't drift, and the
 * test suite stays sub-second. The two patterns to know:
 *
 *   1. `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)`
 *      drives any pending setTimeout callbacks AND flushes the
 *      microtask queue so promises resolved inside them settle.
 *
 *   2. For "race the timeout against the work" patterns, we kick off the
 *      promise with `withTimeout(...)` (do NOT `await` it yet), then
 *      advance time, then await the resulting promise. Awaiting first
 *      would block the test thread before time can advance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extract, type ExtractableApplication } from "@/lib/extraction/service";
import * as providerModule from "@/lib/provider";
import type { ExtractionRequest, ExtractionResponse } from "@/lib/provider";
import {
  isTransientError,
  TimeoutError,
  withRetry,
  withTimeout,
} from "../withTimeout";

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value when the function resolves before the deadline", async () => {
    const p = withTimeout(async () => {
      await new Promise<void>((r) => setTimeout(r, 100));
      return "ok";
    }, 1000);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBe("ok");
  });

  it("throws TimeoutError when the function exceeds the deadline", async () => {
    const p = withTimeout(async () => {
      await new Promise<void>((r) => setTimeout(r, 2000));
      return "ok";
    }, 1000);
    // Catch ahead of advancing to avoid an unhandled rejection between
    // the timer firing and the assertion.
    const settled = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1100);
    await settled;
  });

  it("aborts the inner signal on timeout", async () => {
    let abortedFlag = false;
    const p = withTimeout(async (signal) => {
      signal.addEventListener("abort", () => {
        abortedFlag = true;
      });
      await new Promise<void>((r) => setTimeout(r, 2000));
      return "unreachable";
    }, 500);
    const settled = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(600);
    await settled;
    expect(abortedFlag).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on a clean first attempt — no backoff sleep", async () => {
    const fn = vi.fn(async () => "ok");
    const p = withRetry(fn, {
      attempts: 2,
      backoffMs: 250,
      retryOn: () => true,
    });
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on a transient error, then returns the second attempt's value", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TimeoutError(100);
      }
      return "second";
    });
    const p = withRetry(fn, {
      attempts: 2,
      backoffMs: 250,
      retryOn: isTransientError,
    });
    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after the budget is exhausted (both attempts fail transiently)", async () => {
    const fn = vi.fn(async () => {
      throw new TimeoutError(100);
    });
    const p = withRetry(fn, {
      attempts: 2,
      backoffMs: 250,
      retryOn: isTransientError,
    });
    const settled = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(300);
    await settled;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry non-transient errors — surface immediately", async () => {
    const validationError = new Error("Bad input");
    const fn = vi.fn(async () => {
      throw validationError;
    });
    const p = withRetry(fn, {
      attempts: 2,
      backoffMs: 250,
      retryOn: isTransientError,
    });
    await expect(p).rejects.toBe(validationError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// isTransientError
// ---------------------------------------------------------------------------

describe("isTransientError", () => {
  it("classifies TimeoutError as transient", () => {
    expect(isTransientError(new TimeoutError(100))).toBe(true);
  });

  it("classifies AbortError by name", () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(isTransientError(err)).toBe(true);
  });

  it("classifies HTTP 429 as transient", () => {
    expect(isTransientError({ status: 429 })).toBe(true);
  });

  it("classifies HTTP 5xx as transient", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
  });

  it("does NOT classify HTTP 400 / 422 as transient", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 422 })).toBe(false);
  });

  it("does NOT classify a plain Error as transient", () => {
    expect(isTransientError(new Error("plain"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extract() integration — the degraded-on-timeout contract
// ---------------------------------------------------------------------------

describe("extract() — D10 degraded-on-timeout contract", () => {
  const originalProvider = process.env.PROVIDER;

  beforeEach(() => {
    process.env.PROVIDER = "mock";
  });

  afterEach(() => {
    process.env.PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  async function tinyJpeg(): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg({ quality: 50 })
      .toBuffer();
  }

  it("returns a degraded ExtractionResponse when both provider attempts time out", async () => {
    // Throwing TimeoutError directly exercises the same catch path that
    // the real-world double-timeout takes — withRetry sees a transient
    // error, retries once, gets the same error, and extract()'s catch
    // converts it to the degraded response. This avoids racing fake
    // timers against sharp's native async work.
    const failingProvider = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => {
        throw new TimeoutError(8000);
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-timeout",
      extract: failingProvider,
    });

    const app: ExtractableApplication = {
      id: "sample-timeout",
      beverageType: "distilled_spirits",
      faces: [{ kind: "front", bytes: await tinyJpeg(), mime: "image/jpeg" }],
    };

    const result = await extract(app);
    expect(result.degraded).toBe("timeout");
    expect(result.faces).toEqual([]);
    // Two attempts — initial call plus one retry per D10.
    expect(failingProvider).toHaveBeenCalledTimes(2);
  });

  it("returns degraded='transient' when both attempts hit a non-timeout transient error", async () => {
    // HTTP 503 from the provider is transient per isTransientError. The
    // retry budget is one, and after the second 503 extract() should
    // return a degraded='transient' response (NOT throw).
    const failingProvider = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => {
        throw Object.assign(new Error("Service unavailable"), { status: 503 });
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-503",
      extract: failingProvider,
    });

    const app: ExtractableApplication = {
      id: "sample-503",
      beverageType: "wine",
      faces: [{ kind: "front", bytes: await tinyJpeg(), mime: "image/jpeg" }],
    };

    const result = await extract(app);
    expect(result.degraded).toBe("transient");
    expect(failingProvider).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on non-transient errors — surfaces them to the caller", async () => {
    const validationError = Object.assign(new Error("Schema mismatch"), {
      status: 400,
    });
    const failingProvider = vi.fn(async (): Promise<ExtractionResponse> => {
      throw validationError;
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-bad-request",
      extract: failingProvider,
    });

    const app: ExtractableApplication = {
      id: "sample-bad-req",
      beverageType: "wine",
      faces: [{ kind: "front", bytes: await tinyJpeg(), mime: "image/jpeg" }],
    };

    await expect(extract(app)).rejects.toBe(validationError);
    expect(failingProvider).toHaveBeenCalledTimes(1);
  });

  it("succeeds with no retry on a fast happy path", async () => {
    const fastProvider = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => ({
        faces: [
          {
            kind: "front",
            fields: { brand_name: "OK" },
            warning: {
              presence: false,
              allCaps: false,
              boldConfident: "no",
              legibility: "good",
            },
          },
        ],
      }),
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-fast",
      extract: fastProvider,
    });

    const app: ExtractableApplication = {
      id: "sample-fast",
      beverageType: "wine",
      faces: [{ kind: "front", bytes: await tinyJpeg(), mime: "image/jpeg" }],
    };

    const result = await extract(app);
    expect(result.degraded).toBeUndefined();
    expect(result.faces.length).toBe(1);
    expect(fastProvider).toHaveBeenCalledTimes(1);
  });

  it("succeeds on retry when the first attempt is transient and the second is clean", async () => {
    let calls = 0;
    const flakyProvider = vi.fn(
      async (_req: ExtractionRequest): Promise<ExtractionResponse> => {
        calls += 1;
        if (calls === 1) throw new TimeoutError(8000);
        return {
          faces: [
            {
              kind: "front",
              fields: { brand_name: "OK" },
              warning: {
                presence: false,
                allCaps: false,
                boldConfident: "no",
                legibility: "good",
              },
            },
          ],
        };
      },
    );
    vi.spyOn(providerModule, "getProvider").mockReturnValue({
      name: "spy-flaky",
      extract: flakyProvider,
    });

    const app: ExtractableApplication = {
      id: "sample-flaky",
      beverageType: "wine",
      faces: [{ kind: "front", bytes: await tinyJpeg(), mime: "image/jpeg" }],
    };

    const result = await extract(app);
    expect(result.degraded).toBeUndefined();
    expect(result.faces[0]?.fields.brand_name).toBe("OK");
    expect(flakyProvider).toHaveBeenCalledTimes(2);
  });
});
