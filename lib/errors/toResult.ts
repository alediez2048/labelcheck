/**
 * Converter — `StructuredError` → degraded `VerificationResult`.
 *
 * Used by the verify and batch entry points so the agent's UI renders
 * one shape for both success and degraded outcomes (FR-14 + FR-16 +
 * FR-26b). Lane=review, overallConfidence=0, `extractionFailed=true`,
 * the recommendation copied through when present.
 *
 * `INVALID_INPUT` is NOT converted here — that path returns a 4xx with
 * the error message and never produces a synthetic result. The handler
 * never calls this with an `INVALID_INPUT` error.
 */

import { EMPTY_WARNING } from "@/lib/verify/result";
import type { VerificationResult } from "@/types";

import type { StructuredError } from "./types";

/**
 * Build a degraded VerificationResult from a structured error.
 *
 * - `UNREADABLE_IMAGE` → review lane with the structured-error message as the
 *   single flag and the `return_unreadable_image` recommendation.
 * - `PROVIDER_TIMEOUT` / `PROVIDER_RATE_LIMIT` / `PROVIDER_UNAVAILABLE` →
 *   review lane with the structured-error message as the single flag
 *   (the wording matches the prior `buildTimeoutResult` shape).
 * - `INTERNAL` → review lane with a defensive message; NO recommendation
 *   (a programming bug shouldn't pretend to be an FR-26b case).
 * - `INVALID_INPUT` → still produces a result (defensive, never expected),
 *   but the caller should be returning a 4xx instead.
 */
export function toDegradedResult(
  applicationId: string,
  err: StructuredError,
): VerificationResult {
  return {
    applicationId,
    lane: "review",
    overallConfidence: 0,
    fields: [],
    warning: EMPTY_WARNING,
    flags: [err.message],
    extractionFailed: true,
    ...(err.recommendation ? { recommendation: err.recommendation } : {}),
  };
}
