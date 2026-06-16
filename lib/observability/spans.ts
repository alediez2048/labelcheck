/**
 * Typed span helpers (P5-1).
 *
 * Call sites in the verification pipeline and the assistant turn use
 * these helpers instead of touching the raw OTel API. The helpers
 * enforce three invariants:
 *
 *   1. Every string attribute either has a key in the allow-list
 *      (`SAFE_ATTRIBUTE_KEYS` in `redact.ts`) or is hashed via
 *      `hashPii` before it touches the span. This is the typed wall
 *      observability.md flags as the privacy boundary.
 *   2. The span is always ended — `withVerificationSpan` and
 *      `withAssistantSpan` use try / catch / finally so a thrown error
 *      still flushes the span instead of leaking an open one.
 *   3. Errors recorded on the span set status `ERROR` and call
 *      `recordException` so the trace tells the difference between a
 *      `lane=review` outcome (no error) and a thrown exception.
 *
 * The matching engine's per-field events are emitted via
 * `addFieldEvent` from the route handler, not from inside
 * `matchApplication` itself — the latter does not have access to the
 * `ctx`. Option (b) from the P5-1 prompt: keep the engine pure, set
 * events from the route handler where `fieldResults` is already
 * available. The trade-off is documented at the call site.
 */

import {
  SpanStatusCode,
  trace,
  type Attributes,
  type AttributeValue,
  type Span,
} from "@opentelemetry/api";

import {
  hashPii,
  isSafeAttributeKey,
} from "./redact";
import { getTracer } from "./tracing";
import {
  assistantLatencyHistogram,
  assistantRefusalCounter,
  assistantTurnsCounter,
  verificationLaneCounter,
  verificationLatencyHistogram,
  verificationRequestsCounter,
} from "./metrics";

// ---------------------------------------------------------------------------
// Attribute redaction
// ---------------------------------------------------------------------------

/**
 * Apply the redaction wall to one attribute. The contract:
 *   - If the value is not a string (number / boolean / array of safe
 *     primitives / undefined), pass through unchanged.
 *   - If the key is in `SAFE_ATTRIBUTE_KEYS` (or matches the dynamic
 *     per-field family), pass the value through.
 *   - Otherwise hash the value through `hashPii` before storing.
 *
 * Arrays of strings: each element is treated independently against the
 * allow-list. The assistant's `assistant.retrieved_sources` is on the
 * allow-list because the chunk filenames are admin-uploaded reference
 * material (NFR-4 carve-out per P4-1), not applicant data.
 */
function redactAttributeValue(
  key: string,
  value: AttributeValue | undefined,
): AttributeValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return isSafeAttributeKey(key) ? value : hashPii(value);
  }
  if (Array.isArray(value)) {
    // Mixed-type arrays are not allowed by the OTel attribute type;
    // we already narrow per-element by `key`.
    if (isSafeAttributeKey(key)) return value;
    return value.map((v) => (typeof v === "string" ? hashPii(v) : v)) as AttributeValue;
  }
  return value;
}

function applyAttributes(
  span: Span,
  attrs: Record<string, AttributeValue | undefined>,
): void {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(attrs)) {
    const redacted = redactAttributeValue(k, v);
    if (redacted !== undefined) out[k] = redacted;
  }
  if (Object.keys(out).length > 0) span.setAttributes(out);
}

// ---------------------------------------------------------------------------
// Verification span
// ---------------------------------------------------------------------------

export type VerificationSpanAttributes = Record<
  string,
  string | number | boolean | undefined
>;

export type VerificationSpanContext = {
  setAttributes(attrs: VerificationSpanAttributes): void;
  addFieldEvent(
    fieldName: string,
    verdict: string,
    confidence: number,
    sourceFace: string | null,
  ): void;
  recordError(err: unknown): void;
};

/**
 * Start a `verification` parent span. `applicationId` is the SYSTEM
 * internal id — not applicant PII — so it's set verbatim under the
 * allow-listed `verification.id` key. (`docs/PRIVACY-IN-TRACES.md`
 * spells this distinction out.)
 *
 * The span ends in `finally`, so a thrown error inside `fn` still
 * flushes the span. On error the status is set to `ERROR` and the
 * exception is recorded — that's the difference between an exception
 * and a `lane=review` outcome.
 *
 * After the span ends we bump the request counter, the lane counter,
 * and the latency histogram. Metrics are emitted post-`end()` so the
 * span has the final attributes for the backend's correlation.
 */
export async function withVerificationSpan<T>(
  applicationId: string,
  fn: (ctx: VerificationSpanContext) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan("verification", async (span) => {
    span.setAttribute("verification.id", applicationId);
    let lane: string | undefined;
    let errored = false;
    const startedAt = performance.now();

    const ctx: VerificationSpanContext = {
      setAttributes(attrs) {
        applyAttributes(span, attrs);
        if (typeof attrs["verification.lane"] === "string") {
          lane = attrs["verification.lane"];
        }
      },
      addFieldEvent(fieldName, verdict, confidence, sourceFace) {
        // Per-field events sit on the parent span. Keys follow the
        // `verification.field.<name>.*` family that `redact.ts`
        // recognises as safe.
        const eventAttrs: Attributes = {
          [`verification.field.${fieldName}.verdict`]: verdict,
          [`verification.field.${fieldName}.confidence`]: confidence,
        };
        if (sourceFace) {
          eventAttrs[`verification.field.${fieldName}.source_face`] = sourceFace;
        }
        span.addEvent(`verification.field.${fieldName}`, eventAttrs);
      },
      recordError(err) {
        errored = true;
        const exc = err instanceof Error ? err : new Error(String(err));
        span.recordException(exc);
        span.setStatus({ code: SpanStatusCode.ERROR, message: exc.message });
      },
    };

    try {
      const result = await fn(ctx);
      return result;
    } catch (err) {
      ctx.recordError(err);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      span.end();

      // Metrics. Tag with lane / outcome so the backend can split by
      // distribution. Outcome is `ok` unless we recorded an error.
      const outcome = errored ? "error" : "ok";
      const attrs: Attributes = { outcome };
      if (lane) attrs["lane"] = lane;
      try {
        verificationRequestsCounter.add(1, attrs);
        verificationLatencyHistogram.record(durationMs, attrs);
        if (lane) {
          verificationLaneCounter.add(1, { lane });
        }
      } catch {
        // Metrics SDK failures must not propagate to the caller —
        // a broken meter must not break verification.
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Assistant span
// ---------------------------------------------------------------------------

export type AssistantSpanAttributes = Record<
  string,
  string | number | boolean | string[] | undefined
>;

export type AssistantSpanContext = {
  setAttributes(attrs: AssistantSpanAttributes): void;
  recordError(err: unknown): void;
};

/**
 * Start an `assistant.turn` parent span. The user's `question` IS
 * applicant input (FR-30 / D16 say the assistant is on the same
 * privacy boundary as the verification pipeline), so we hash it
 * before storing it under `assistant.question_hash`.
 *
 * Retrieved chunk text bodies are NOT recorded as attributes — only
 * filenames go on the span (under the allow-listed
 * `assistant.retrieved_sources`). Per P4-1's NFR-4 carve-out,
 * filenames of admin-uploaded reference content are safe verbatim.
 *
 * Metrics: turn counter + latency histogram on every call, refusal
 * counter when a refusal template was applied.
 */
export async function withAssistantSpan<T>(
  role: "agent" | "admin",
  question: string,
  fn: (ctx: AssistantSpanContext) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan("assistant.turn", async (span) => {
    span.setAttribute("assistant.role", role);
    // The question text is user input — hash it before it touches the
    // span. The hash lets the backend group turns from the same
    // question without storing the literal.
    span.setAttribute("assistant.question_hash", hashPii(question));

    let refusalTemplate: string | undefined;
    let errored = false;
    const startedAt = performance.now();

    const ctx: AssistantSpanContext = {
      setAttributes(attrs) {
        applyAttributes(
          span,
          attrs as Record<string, AttributeValue | undefined>,
        );
        if (typeof attrs["assistant.refusal_template"] === "string") {
          refusalTemplate = attrs["assistant.refusal_template"];
        }
      },
      recordError(err) {
        errored = true;
        const exc = err instanceof Error ? err : new Error(String(err));
        span.recordException(exc);
        span.setStatus({ code: SpanStatusCode.ERROR, message: exc.message });
      },
    };

    try {
      const result = await fn(ctx);
      return result;
    } catch (err) {
      ctx.recordError(err);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      span.end();
      const outcome = errored ? "error" : "ok";
      const attrs: Attributes = { role, outcome };
      try {
        assistantTurnsCounter.add(1, attrs);
        assistantLatencyHistogram.record(durationMs, attrs);
        if (refusalTemplate && refusalTemplate !== "none") {
          assistantRefusalCounter.add(1, {
            role,
            refusal_template: refusalTemplate,
          });
        }
      } catch {
        // See verification span — metric failures never propagate.
      }
    }
  });
}

/**
 * Helper for child-span creation in the matching engine / extraction
 * service. Re-exported so call sites don't have to import the OTel
 * api directly.
 */
export function getActiveTracer() {
  return getTracer();
}

export { trace, SpanStatusCode };
