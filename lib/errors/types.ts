/**
 * Structured error vocabulary (P3-3).
 *
 * Bad inputs are NORMAL OUTCOMES, not errors (systemsdesign Error Handling).
 * The verify and batch entry points funnel every failure path through this
 * union so the UI renders one consistent shape and the agent never sees a
 * stack trace.
 *
 * Each code carries:
 *   - `message`: plain-language sentence safe to render in the UI. Never a
 *     zod path, never a stack trace, never applicant PII (NFR-2, NFR-4).
 *   - `retryable`: whether re-running the same input might succeed.
 *     `INVALID_INPUT` and `UNREADABLE_IMAGE` are NOT retryable as-is — the
 *     caller has to change something (fix the form / re-upload a clearer
 *     image). Provider failures (timeout, rate limit, 5xx) ARE retryable
 *     because the input is fine and the service blip might pass.
 *   - `recommendation`: when the error maps to FR-26b ("Return — unreadable
 *     image") the recommendation is set so the UI surfaces the deterministic
 *     disposition recommendation without re-deriving it from the message.
 *
 * Helpers below compose the right shape for each code so call sites don't
 * have to remember which fields go where.
 */

/**
 * Discriminator for the structured error union. Each value names a
 * specific failure class with a different UI affordance.
 */
export type StructuredErrorCode =
  | "INVALID_INPUT"
  | "UNREADABLE_IMAGE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL";

export type StructuredError = {
  code: StructuredErrorCode;
  /** Plain-language sentence safe to show in the UI. No zod paths, no stack traces. */
  message: string;
  /**
   * Whether re-running the same input might succeed. INVALID_INPUT and
   * UNREADABLE_IMAGE are NOT retryable as-is; the others are.
   */
  retryable: boolean;
  /** When the error maps to FR-26b, carry the recommendation here. */
  recommendation?: "return_unreadable_image";
  /** Optional per-field references for INVALID_INPUT. */
  fields?: ReadonlyArray<string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The caller passed something wrong. Surfaced as a 4xx at the API
 * boundary; never converted into a synthetic VerificationResult.
 */
export function invalidInput(
  message: string,
  fields?: ReadonlyArray<string>,
): StructuredError {
  return {
    code: "INVALID_INPUT",
    message,
    retryable: false,
    fields,
  };
}

/**
 * The image couldn't be transcribed. Routes through the FR-16 review
 * lane with the FR-26b "Return — unreadable image" recommendation.
 * Not retryable as-is — the applicant needs to re-upload.
 */
export function unreadableImage(reason?: string): StructuredError {
  return {
    code: "UNREADABLE_IMAGE",
    message:
      reason ??
      "The label image could not be read clearly enough to verify. Please re-upload a clearer image.",
    retryable: false,
    recommendation: "return_unreadable_image",
  };
}

/**
 * D10 — the provider call timed out twice. The agent sees a low-confidence
 * "could not verify in time" result and can retry the whole submission.
 */
export function providerTimeout(_ms: number): StructuredError {
  return {
    code: "PROVIDER_TIMEOUT",
    message:
      "Could not verify in time — the label-reading service was slow to respond. Please try again, or request a better image from the applicant.",
    retryable: true,
    recommendation: "return_unreadable_image",
  };
}

/**
 * D10 — the provider returned 429 twice. Same UI posture as a timeout
 * with a slightly different reason; the retry button is the same.
 */
export function providerRateLimit(): StructuredError {
  return {
    code: "PROVIDER_RATE_LIMIT",
    message:
      "Could not verify in time — the label-reading service is temporarily unavailable. Please try again in a moment.",
    retryable: true,
    recommendation: "return_unreadable_image",
  };
}

/**
 * D10 — the provider returned a 5xx / network error twice.
 */
export function providerUnavailable(_reason?: string): StructuredError {
  return {
    code: "PROVIDER_UNAVAILABLE",
    message:
      "Could not verify in time — the label-reading service is temporarily unavailable. Please try again in a moment.",
    retryable: true,
    recommendation: "return_unreadable_image",
  };
}

/**
 * Programming bug or other unexpected condition. Defensive copy — we
 * never leak `err.message` to the UI because there's no guarantee it
 * is free of internals.
 */
export function internalError(_reason?: string): StructuredError {
  return {
    code: "INTERNAL",
    message: "Something unexpected happened. Please try again.",
    retryable: true,
  };
}
