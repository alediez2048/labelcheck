/**
 * Crop the warning region from a preprocessed face image (P3-2, D7).
 *
 * Used by the targeted re-read path. When the first-pass extraction
 * reports `warning.legibility: "low"` on the face the warning matcher
 * pinned to, the extraction service crops just that region from the
 * SAME preprocessed bytes the model already saw and asks the provider
 * for a high-resolution second read of the slice alone. The crop must
 * preserve the original (preprocessed) resolution — re-encoding at a
 * lower quality would defeat the entire point.
 *
 * Two crop modes:
 *
 *   1. With a `WarningRegionHint` — convert the model's normalized
 *      bounding box to integer pixel coordinates and call sharp's
 *      `.extract()` on it. Hint values are clamped to image bounds so
 *      a slightly out-of-range hint never throws.
 *
 *   2. Without a hint — fall back to the bottom 40% of the image at
 *      full width. The warning lives on the back face in the lower
 *      half for ~all real labels (D12); a back-face bottom crop is the
 *      right heuristic when the model didn't ship a hint. Documented
 *      so a future agent doesn't replace it with a "smarter" detector
 *      that quietly fails on edge cases.
 *
 * Pure function — same input, same output. No logging (NFR-4: bytes
 * never logged).
 */

// sharp is imported lazily so the module-load phase never touches
// sharp's native bindings on Vercel.
type SharpFactory = (typeof import("sharp"))["default"];
let sharpModule: SharpFactory | null = null;
async function getSharp(): Promise<SharpFactory> {
  if (sharpModule) return sharpModule;
  sharpModule = (await import("sharp")).default;
  return sharpModule;
}

import type { ImageMime } from "./preprocess";

/**
 * Normalized warning region from the model. All fields are fractions of
 * the image's dimensions in [0, 1]: `x` and `width` are fractions of the
 * image width; `y` and `height` are fractions of the image height. The
 * model returns these in image coordinates; the conversion to pixels is
 * `Math.round(value * dimension)`.
 */
export type WarningRegionHint = {
  /** Fraction of width: 0..1. */
  x: number;
  /** Fraction of height: 0..1. */
  y: number;
  /** Fraction of width: 0..1. */
  width: number;
  /** Fraction of height: 0..1. */
  height: number;
};

export type CropResult = {
  bytes: Buffer;
  mime: ImageMime;
};

/**
 * Fallback heuristic when no hint is provided: crop the bottom 40% of
 * the image at full width. The 0.6 top fraction is documented here
 * rather than buried as a magic constant — D12 says the warning lives
 * on the back face in the lower half, and the bottom 40% (1 - 0.6)
 * gives comfortable slack around the typical warning block (~25% of
 * label height plus padding for the heading and the paragraph below).
 *
 * Height is computed as `imageHeight - top` so the crop reaches the
 * actual image edge regardless of any rounding drift.
 */
const FALLBACK_TOP_FRACTION = 0.6;

/**
 * Clamp `value` into the half-open interval [min, max). Used to round
 * the normalized hint into the image's pixel bounds without ever
 * producing a zero-size or out-of-range region.
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export async function cropWarningRegion(
  bytes: Buffer,
  mime: ImageMime,
  hint?: WarningRegionHint,
): Promise<CropResult> {
  const sharp = await getSharp();
  const meta = await sharp(bytes).metadata();
  const imageWidth = meta.width;
  const imageHeight = meta.height;
  if (!imageWidth || !imageHeight) {
    throw new Error("Image could not be decoded");
  }

  let left: number;
  let top: number;
  let width: number;
  let height: number;

  if (hint) {
    // Convert the normalized hint to pixel coordinates, clamping every
    // value into image bounds. A hint that lands fully outside the
    // image collapses to a 1px region at the nearest edge rather than
    // throwing — the caller treats a degenerate crop as "no useful
    // warning region" via the re-read's low-legibility branch.
    const hintLeft = Math.round(clamp(hint.x, 0, 1) * imageWidth);
    const hintTop = Math.round(clamp(hint.y, 0, 1) * imageHeight);
    const hintWidth = Math.round(clamp(hint.width, 0, 1) * imageWidth);
    const hintHeight = Math.round(clamp(hint.height, 0, 1) * imageHeight);

    left = Math.min(hintLeft, imageWidth - 1);
    top = Math.min(hintTop, imageHeight - 1);
    // Ensure left+width and top+height stay inside the image.
    width = Math.max(1, Math.min(hintWidth, imageWidth - left));
    height = Math.max(1, Math.min(hintHeight, imageHeight - top));
  } else {
    // Bottom 40% at full width — see comment on FALLBACK_TOP_FRACTION /
    // FALLBACK_HEIGHT_FRACTION above.
    left = 0;
    top = Math.round(imageHeight * FALLBACK_TOP_FRACTION);
    width = imageWidth;
    height = Math.max(1, imageHeight - top);
  }

  // Re-encode to the SAME mime as the input. sharp's `.extract()`
  // preserves pixel resolution; the toBuffer call is what serialises
  // back to a real image file. We do NOT pass quality knobs — the
  // crop should keep the model's full usable resolution (D7).
  const pipeline = sharp(bytes).extract({ left, top, width, height });
  const out =
    mime === "image/png"
      ? await pipeline.png().toBuffer()
      : await pipeline.jpeg().toBuffer();

  return { bytes: out, mime };
}
