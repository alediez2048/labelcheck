/**
 * Timeout + retry wrappers for provider calls (D10).
 *
 * Two small composable helpers — `withTimeout` and `withRetry` — keep the
 * extraction service's call site readable:
 *
 *   withRetry(() => withTimeout(() => provider.extract(req), 8000), {
 *     attempts: 2,
 *     backoffMs: 250,
 *     retryOn: isTransient,
 *   });
 *
 * The 8-second per-attempt timeout is a degradation knob, NOT a hard kill
 * on every request. p95-under-5-seconds is the GOAL we measure against in
 * P1-11 (NFR-1). The timeout exists so a truly stuck provider doesn't
 * hang the UI; the retry exists so a transient blip doesn't surface to
 * the agent as a failure. Together they buy resilience without buying
 * brittleness — one retry only, small backoff, transient errors only.
 *
 * Non-transient errors (validation, programming bugs, malformed-input
 * 4xx from the provider) are NOT retried — those should surface
 * immediately so the right caller can fix them. The retry budget is for
 * transient infrastructure noise, not for masking real defects.
 */

import {
  internalError,
  providerRateLimit,
  providerTimeout,
  providerUnavailable,
  type StructuredError,
} from "@/lib/errors/types";

/**
 * Thrown by `withTimeout` when the wrapped function does not settle
 * within the deadline. Used by `withRetry` to distinguish "this is
 * transient, try once more" from a real exception.
 */
export class TimeoutError extends Error {
  readonly kind = "timeout" as const;
  readonly ms: number;
  constructor(ms: number) {
    super(`Provider call timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

/**
 * Race the given async function against a timeout. The wrapped function
 * is started immediately; if it settles before the deadline its result
 * propagates. If the deadline wins, a `TimeoutError` is thrown.
 *
 * The wrapped function receives an `AbortSignal` so it can cancel its
 * own work on timeout — but it's not required to honour it. Callers
 * that do not check the signal will keep running in the background
 * until they settle on their own; the wrapper's promise is rejected as
 * soon as the deadline elapses regardless.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([fn(ac.signal), timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export type RetryOptions = {
  /** Total attempt count, INCLUDING the first try. D10 says 2 (one retry). */
  attempts: number;
  /** Delay between attempts in milliseconds. D10 suggests a small backoff. */
  backoffMs: number;
  /** Decide which errors are worth retrying. Non-transient errors throw. */
  retryOn: (error: unknown) => boolean;
};

/**
 * Run `fn` up to `attempts` times, sleeping `backoffMs` between attempts.
 * Only retries when `retryOn(err)` returns true. The retry budget is the
 * documented degrade budget — keep it tight (D10).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === opts.attempts || !opts.retryOn(err)) {
        throw err;
      }
      await sleep(opts.backoffMs);
    }
  }
  // Unreachable — the loop either returns or throws — but TypeScript
  // demands a terminator.
  throw lastError;
}

/**
 * What counts as "worth retrying". Timeouts are always transient. HTTP
 * 429 and 5xx from the provider are transient (the provider exposes the
 * status as `error.status` on its SDK errors). A small set of fetch /
 * network error names (`AbortError`, `FetchError`, `ECONNRESET`) also
 * count — they're the noise floor of any cross-network call.
 *
 * Validation errors, schema mismatches, and any 4xx other than 429 are
 * NOT transient — those are real, retrying just hides them.
 */
export function isTransientError(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; status?: unknown; code?: unknown };
  if (typeof e.name === "string") {
    if (e.name === "AbortError") return true;
    if (e.name === "FetchError") return true;
    if (e.name === "TimeoutError") return true;
  }
  if (typeof e.code === "string") {
    if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT") return true;
  }
  if (typeof e.status === "number") {
    if (e.status === 429) return true;
    if (e.status >= 500 && e.status < 600) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Module-boundary helper: convert whatever the provider stack threw into
 * a `StructuredError` the verify / batch routes can render uniformly.
 *
 * - `TimeoutError` → `PROVIDER_TIMEOUT`.
 * - Anything with `status: 429` → `PROVIDER_RATE_LIMIT`.
 * - Anything with `5xx` status, or an obvious transient name/code
 *   (AbortError, FetchError, ECONNRESET, ETIMEDOUT) → `PROVIDER_UNAVAILABLE`.
 * - Anything else → `INTERNAL` (defensive — we never leak `err.message`).
 *
 * The `withTimeout` + `withRetry` helpers continue to throw their original
 * errors internally; this helper is what the caller invokes at the seam to
 * normalize the outcome.
 */
export function toStructuredError(err: unknown): StructuredError {
  if (err instanceof TimeoutError) {
    return providerTimeout(err.ms);
  }
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; status?: unknown; code?: unknown };
    if (typeof e.status === "number") {
      if (e.status === 429) return providerRateLimit();
      if (e.status >= 500 && e.status < 600) return providerUnavailable();
    }
    if (typeof e.name === "string") {
      if (
        e.name === "AbortError" ||
        e.name === "FetchError" ||
        e.name === "TimeoutError"
      ) {
        return providerUnavailable();
      }
    }
    if (typeof e.code === "string") {
      if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT") {
        return providerUnavailable();
      }
    }
  }
  return internalError();
}
