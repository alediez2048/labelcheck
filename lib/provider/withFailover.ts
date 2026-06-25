/**
 * Cross-provider failover wrapper — clean rebuild.
 *
 * Tries each slot in order. If a slot throws (because the per-provider
 * retry+timeout budget exhausted, the API key is bad, the model is
 * unavailable, the response was unparseable — ANY error), advance to
 * the next slot. After every slot has failed, throw the LAST slot's
 * error so the caller's existing degraded-result path renders the
 * friendly "service unavailable" wording.
 *
 * No structured-error code matching, no "skip this kind of error,
 * advance on that kind." Lessons learned from the previous attempt:
 * fine-grained classification of provider errors causes the chain to
 * stall on edge cases (a JSON parse error didn't trigger advance; a
 * 400 with no body didn't trigger advance, etc.). Simpler rule: if
 * the provider couldn't produce a usable response, try the next one.
 *
 * Slots are loaded LAZILY — a misconfigured fallback (missing API key
 * on slot 2) does not block startup of a healthy primary. The slot's
 * factory only runs when the chain advances to it.
 */

import { trace } from "@opentelemetry/api";

import type {
  ExtractionRequest,
  ExtractionResponse,
  VisionProvider,
} from "./types";
import type { ProviderChainSlot } from "./index";
import { isTransientError, withRetry, withTimeout } from "./withTimeout";

export type FailoverPolicy = {
  /** Per-provider attempt count (initial + retries). D10 = 2. */
  attempts: number;
  /** Delay between in-provider retries (ms). */
  backoffMs: number;
  /** Per-attempt timeout (ms). Degradation knob, not a hard kill. */
  timeoutMs: number;
};

export type FailoverSuccess = {
  response: ExtractionResponse;
  finalProvider: VisionProvider;
  hops: number;
};

export async function withFailover(
  chain: ReadonlyArray<ProviderChainSlot>,
  request: ExtractionRequest,
  policy: FailoverPolicy,
): Promise<FailoverSuccess> {
  if (chain.length === 0) {
    throw new Error(
      "withFailover called with an empty chain — PROVIDER is not configured",
    );
  }

  let lastErr: unknown = new Error(
    "Provider chain ran without producing an error",
  );
  let hops = 0;

  for (let i = 0; i < chain.length; i++) {
    const slot = chain[i]!;
    const slotStart = performance.now();

    // 1) Load the adapter. If it throws (missing env, constructor
    //    failure), treat as the same kind of failure as an extract
    //    error and advance.
    let provider: VisionProvider;
    try {
      provider = await slot.load();
    } catch (loadErr) {
      lastErr = loadErr;
      logFailoverHop({
        applicationId: request.applicationId,
        fromProvider: slot.id,
        toProvider: i < chain.length - 1 ? chain[i + 1]!.id : null,
        reason: "load_failure",
        hopMs: Math.round(performance.now() - slotStart),
      });
      hops += 1;
      continue;
    }

    // 2) Run the in-provider retry+timeout budget. Any throw here
    //    advances the chain — no error-shape inspection.
    try {
      const response = await withRetry(
        () =>
          withTimeout(
            (_signal) => provider.extract(request),
            policy.timeoutMs,
          ),
        {
          attempts: policy.attempts,
          backoffMs: policy.backoffMs,
          retryOn: isTransientError,
        },
      );
      recordSpanAttributes({
        hops,
        fromProvider: chain[0]!.id,
        finalProvider: slot.id,
      });
      return { response, finalProvider: provider, hops };
    } catch (err) {
      lastErr = err;
      logFailoverHop({
        applicationId: request.applicationId,
        fromProvider: slot.id,
        toProvider: i < chain.length - 1 ? chain[i + 1]!.id : null,
        reason: errReason(err),
        hopMs: Math.round(performance.now() - slotStart),
      });
      hops += 1;
    }
  }

  // Every slot failed. Re-throw the last slot's error so the existing
  // extract() catch block surfaces a degraded result with sensible
  // wording (driven by toStructuredError on the last error's shape).
  recordSpanAttributes({
    hops: hops - 1,
    fromProvider: chain[0]!.id,
    finalProvider: chain[chain.length - 1]!.id,
  });
  throw lastErr;
}

function errReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return "timeout";
    const e = err as { status?: unknown };
    if (typeof e.status === "number") return `http_${e.status}`;
    return err.name || "error";
  }
  return "error";
}

function recordSpanAttributes(attrs: {
  hops: number;
  fromProvider: string;
  finalProvider: string;
}): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.setAttributes({
    "extraction.failover.hops": attrs.hops,
    "extraction.failover.from_provider": attrs.fromProvider,
    "extraction.failover.final_provider": attrs.finalProvider,
  });
}

function logFailoverHop(line: {
  applicationId: string;
  fromProvider: string;
  toProvider: string | null;
  reason: string;
  hopMs: number;
}): void {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "provider.failover",
      applicationId: line.applicationId,
      from: line.fromProvider,
      to: line.toProvider,
      reason: line.reason,
      hopMs: line.hopMs,
    }),
  );
}
