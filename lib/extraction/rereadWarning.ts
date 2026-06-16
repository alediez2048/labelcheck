/**
 * Targeted high-resolution re-read of the warning region (P3-2, D7).
 *
 * Called at most ONCE per application by the extraction service when
 * the first-pass extraction returned a low-legibility warning region
 * on the face the warning matcher pinned to (D14: the warning is one
 * field — one re-read per application is enough).
 *
 * Bounded by construction. The wrapper is a separate gated call from
 * the first-pass `withRetry(withTimeout(...))`: a SHORTER timeout
 * because the crop is much smaller than the full image, and NO retry
 * because the re-read is itself the retry. If the cropped re-read
 * also fails or times out, the result is `{ attempted: true, legibility:
 * "low", warningText: "" }` and the service keeps the first-pass
 * result — FR-16 + FR-26b then route the application to the
 * low-confidence "needs a better image" lane.
 *
 * Providers without a `rereadWarning` method (the live Anthropic
 * adapter in P3-2) are handled gracefully: `attempted: false`, zero
 * values, no crop, no model call.
 */

import { cropWarningRegion, type WarningRegionHint } from "@/lib/image";
import type { ImageMime } from "@/lib/image";
import type { FaceKind } from "@/types";

import { TimeoutError, withTimeout } from "@/lib/provider/withTimeout";
import type { VisionProvider } from "@/lib/provider";

/**
 * Tight timeout for the re-read call. Shorter than the first-pass
 * 8000ms budget because the crop is a fraction of the full face. No
 * retry: the re-read is itself the retry. A truly stuck second pass
 * times out cleanly and the service keeps the first-pass result.
 */
const REREAD_TIMEOUT_MS = 4000;

export type RereadInput = {
  provider: VisionProvider;
  applicationId: string;
  /** The preprocessed face bytes — the same bytes the first pass saw. */
  faceBytes: Buffer;
  faceMime: ImageMime;
  sourceFace: FaceKind;
  /**
   * Optional bounding box from the first-pass extraction. When absent
   * the crop falls back to the bottom 40% of the face — documented in
   * `cropWarningRegion.ts`.
   */
  regionHint?: WarningRegionHint;
};

export type RereadOutput = {
  /**
   * Was the provider's `rereadWarning` actually invoked? `false` when
   * the provider doesn't implement the optional method, or when the
   * crop itself threw (e.g. corrupted bytes).
   */
  attempted: boolean;
  /** The new transcription; empty when the re-read failed or timed out. */
  warningText: string;
  legibility: "good" | "low";
  allCaps: boolean;
  boldConfident: "yes" | "no" | "uncertain";
};

/**
 * Zero-value response for the "didn't attempt" / "attempted but failed"
 * branches. Same shape so the service's merge logic never has to
 * unwrap an optional.
 */
function emptyOutput(attempted: boolean): RereadOutput {
  return {
    attempted,
    warningText: "",
    legibility: "low",
    allCaps: false,
    boldConfident: "no",
  };
}

export async function rereadWarning(input: RereadInput): Promise<RereadOutput> {
  // 1. Provider seam — when the adapter doesn't implement the optional
  //    re-read method, return the "not attempted" zero-value response.
  //    The service keeps the first-pass result.
  const providerReread = input.provider.rereadWarning;
  if (!providerReread) {
    return emptyOutput(false);
  }

  // 2. Crop the warning region from the SAME preprocessed bytes the
  //    first pass saw. If the crop itself throws (degenerate hint,
  //    corrupt bytes), treat it as "not attempted" — there is nothing
  //    useful to send.
  let crop: { bytes: Buffer; mime: ImageMime };
  try {
    crop = await cropWarningRegion(
      input.faceBytes,
      input.faceMime,
      input.regionHint,
    );
  } catch {
    return emptyOutput(false);
  }

  // 3. Send the cropped region. Tight timeout, no retry. A timeout or
  //    a thrown error from the provider both collapse to the
  //    "attempted but failed" zero-value response — the service still
  //    has the first-pass result to fall back on.
  try {
    const response = await withTimeout(
      (_signal) =>
        providerReread.call(input.provider, {
          applicationId: input.applicationId,
          bytes: crop.bytes,
          mime: crop.mime,
          sourceFace: input.sourceFace,
        }),
      REREAD_TIMEOUT_MS,
    );
    return {
      attempted: true,
      warningText: response.warningText,
      legibility: response.legibility,
      allCaps: response.allCaps,
      boldConfident: response.boldConfident,
    };
  } catch (err) {
    // TimeoutError is the documented degraded path; anything else is
    // also collapsed to the same zero-value response because the only
    // alternative is to throw and break the request, which violates
    // FR-16 (severe degradation is a normal outcome, not an error).
    void err;
    return emptyOutput(true);
  }
}

/**
 * Exported for unit tests so the timeout can be asserted without
 * hardcoding the literal in every test file.
 */
export const REREAD_TIMEOUT_MS_FOR_TESTING = REREAD_TIMEOUT_MS;

// Re-export the TimeoutError symbol so consumers can identify a
// timeout-shaped failure without reaching into withTimeout directly.
export { TimeoutError };
