/**
 * P3-4 — Per-stage timing helper.
 *
 * Time an async stage. Returns the result and the elapsed milliseconds
 * (rounded to integer). Used by `runVerification` to instrument the
 * verify pipeline so each stage's contribution to the request total is
 * measurable per request.
 *
 * Production observability (OpenTelemetry spans) lands in P5-1; this
 * helper is the seam those spans will consume — same `start` / `end`
 * boundaries, same `durationMs` shape. Keeping the contract narrow now
 * (single async function in, `{ result, durationMs }` out) means the
 * P5-1 swap is a wrapper around this, not a rewrite of the call sites.
 */

export type Timed<T> = {
  result: T;
  durationMs: number;
};

/**
 * Time an async function. The wrapped function is invoked immediately;
 * its result is returned alongside the elapsed wall-clock milliseconds
 * (rounded). Throws propagate — the result-and-duration tuple is only
 * returned on success.
 */
export async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}
