/**
 * In-memory image preprocessing — EXIF orientation + long-edge cap (D7).
 *
 * Every face image passes through this function before reaching the vision
 * provider (P1-2). Two jobs only:
 *   1. Normalise EXIF orientation so phone-camera labels come out upright.
 *   2. Cap the long edge at the provider's usable maximum (default 1568px
 *      for Claude per D7) — but NEVER downscale below it. The smallest,
 *      highest-stakes text on the label is the government warning;
 *      shrinking the image to "improve latency" silently breaks the
 *      warning check, which is the most-important check we run.
 *
 * Everything happens in memory. No temp files, no disk writes, no logs
 * that include the bytes themselves (NFR-4). The provider caps oversized
 * images internally, so sending >1568 buys nothing but tokens and latency.
 *
 * Configurable: `process.env.IMAGE_MAX_LONG_EDGE` (default 1568). When
 * P6-1 swaps to Azure OpenAI vision or self-hosted olmOCR with a
 * different cap, the change is a config edit, not a code change.
 */

import sharp from "sharp";

const DEFAULT_MAX_LONG_EDGE = 1568;

export type ImageMime = "image/jpeg" | "image/png";

export type PreprocessResult = {
  /** Output bytes — in-memory only; never written to disk. */
  bytes: Buffer;
  /** Width of the output image, post-rotation and post-cap. */
  width: number;
  /** Height of the output image, post-rotation and post-cap. */
  height: number;
  /** MIME echoed back so the provider request carries it through. */
  mime: ImageMime;
};

function resolveMaxEdge(): number {
  const raw = process.env.IMAGE_MAX_LONG_EDGE;
  if (!raw) return DEFAULT_MAX_LONG_EDGE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_LONG_EDGE;
  }
  return parsed;
}

/**
 * Read input metadata up front so the logger has the pre-rotation
 * dimensions. Throws our clean error on corrupt bytes.
 */
async function readInputMetadata(bytes: Buffer): Promise<sharp.Metadata> {
  try {
    return await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw new Error("Image could not be decoded");
  }
}

/**
 * Preprocess one face image. Pure function — same input, same output.
 *
 * Throws `Error("Image could not be decoded")` (no stack trace, no path,
 * no bytes) on any decode failure. The layer above maps this to the
 * FR-16 "needs a better image" review-lane outcome.
 */
export async function preprocessImage(
  bytes: Buffer,
  mime: ImageMime,
): Promise<PreprocessResult> {
  const maxEdge = resolveMaxEdge();

  const inputMeta = await readInputMetadata(bytes);
  if (!inputMeta.width || !inputMeta.height) {
    throw new Error("Image could not be decoded");
  }

  // Single chained pipeline:
  //  - .rotate()                — apply EXIF orientation (no args!)
  //  - .resize({ fit: "inside", withoutEnlargement: true })
  //                              — cap the LONG edge at maxEdge if over,
  //                                pass through unchanged if at or below.
  //                                Together these two options express D7
  //                                exactly: "shrink iff oversized; never grow."
  let outBuf: Buffer;
  try {
    outBuf = await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch {
    throw new Error("Image could not be decoded");
  }

  const outMeta = await sharp(outBuf).metadata();
  if (!outMeta.width || !outMeta.height) {
    throw new Error("Image could not be decoded");
  }

  // Structured log point — input/output dimensions only. Bytes never logged.
  // NEVER include a file path or any user content (NFR-4).
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "image.preprocess",
      inputWidth: inputMeta.width,
      inputHeight: inputMeta.height,
      outputWidth: outMeta.width,
      outputHeight: outMeta.height,
      longEdgeCap: maxEdge,
    }),
  );

  return {
    bytes: outBuf,
    width: outMeta.width,
    height: outMeta.height,
    mime,
  };
}
