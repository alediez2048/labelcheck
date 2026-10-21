/**
 * In-memory image preprocessing — EXIF orientation + long-edge cap.
 *
 * Every face image passes through this function before reaching the vision
 * provider. Two jobs only:
 *   1. Normalise EXIF orientation so phone-camera labels come out upright.
 *   2. Cap the long edge at the provider's usable maximum (default 1568px
 *      for Claude) — but NEVER downscale below it. The smallest,
 *      highest-stakes text on the label is the government warning;
 *      shrinking the image to "improve latency" silently breaks the
 *      warning check, which is the most-important check we run.
 *
 * Everything happens in memory. No temp files, no disk writes, no logs
 * that include the bytes themselves. The provider caps oversized
 * images internally, so sending >1568 buys nothing but tokens and latency.
 *
 * Configurable: `process.env.IMAGE_MAX_LONG_EDGE` (default 1568). When
 * A later change swaps to Azure OpenAI vision or self-hosted olmOCR with a
 * different cap, the change is a config edit, not a code change.
 */

/**
 * sharp is imported lazily so the module-load phase never touches
 * sharp's native bindings. On Vercel's serverless runtime the bundler
 * was sometimes dropping the linux-x64 binary; a lazy import lets the
 * function cold-start successfully and resolve sharp on first use.
 */
type SharpFactory = (typeof import("sharp"))["default"];
let sharpModule: SharpFactory | null = null;
async function getSharp(): Promise<SharpFactory> {
  if (sharpModule) return sharpModule;
  // CJS / ESM interop: depending on whether webpack treats `sharp` as
  // external or not, the dynamic import returns either `{ default: fn }`
  // (esm-wrapper shape) or the function itself (passthrough). Handle
  // both by probing both shapes.
  const mod = (await import("sharp")) as unknown as
    | (typeof import("sharp"))["default"]
    | { default: (typeof import("sharp"))["default"] };
  const candidate =
    typeof mod === "function"
      ? mod
      : (mod as { default: (typeof import("sharp"))["default"] }).default;
  sharpModule = candidate;
  return sharpModule;
}

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
 * True when the bytes start with a JPEG, PNG or WebP file signature.
 * Used to tell "sharp could not run here" (pass the image through) from
 * "this is not an image" (reject it).
 */
function hasImageSignature(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

/**
 * Read input metadata up front so the logger has the pre-rotation
 * dimensions. Throws our clean error on corrupt bytes.
 */
async function readInputMetadata(bytes: Buffer) {
  try {
    const sharp = await getSharp();
    return await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw new Error("Image could not be decoded");
  }
}

/**
 * Preprocess one face image. Pure function — same input, same output.
 *
 * Throws `Error("Image could not be decoded")` (no stack trace, no path,
 * no bytes) when the bytes are not a JPEG, PNG or WebP. A real image that
 * sharp cannot process here is passed through unchanged (see below). The layer above maps this to the
 * FR-16 "needs a better image" review-lane outcome.
 */
export async function preprocessImage(
  bytes: Buffer,
  mime: ImageMime,
): Promise<PreprocessResult> {
  const maxEdge = resolveMaxEdge();

  // Best-effort sharp pipeline: on Vercel the native binding can fail
  // to load OR to decode through the bundler's CJS/ESM interop. The
  // browser-rendered PNG is already at the target long-edge cap and
  // EXIF-clean (canvas output has no EXIF), so a sharp failure is
  // tolerated — we pass the bytes through unchanged and let the
  // provider handle the original buffer. Demo posture; production
  // path (in-boundary self-hosted) runs against a known sharp
  // build and re-enables strict preprocessing.
  let inputMeta: { width?: number; height?: number } = {};
  let outBuf: Buffer = bytes;
  let outMeta: { width?: number; height?: number } = {};
  let bypassReason: string | null = null;

  try {
    inputMeta = await readInputMetadata(bytes);
    if (!inputMeta.width || !inputMeta.height) {
      throw new Error("Image could not be decoded");
    }
    const sharp = await getSharp();
    outBuf = await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
    outMeta = await sharp(outBuf).metadata();
    if (!outMeta.width || !outMeta.height) {
      throw new Error("Image could not be decoded");
    }
  } catch (err) {
    // Bytes that are not an image at all fail here, whatever sharp did.
    // Only a real image (by its file signature) is passed through.
    if (!hasImageSignature(bytes)) {
      throw new Error("Image could not be decoded");
    }
    bypassReason = err instanceof Error ? err.message : String(err);
    outBuf = bytes;
    outMeta = { width: inputMeta.width, height: inputMeta.height };
  }

  // Structured log point — input/output dimensions only. Bytes never logged.
  // NEVER include a file path or any user content.
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "image.preprocess",
      inputWidth: inputMeta.width,
      inputHeight: inputMeta.height,
      outputWidth: outMeta.width,
      outputHeight: outMeta.height,
      longEdgeCap: maxEdge,
      bypassed: bypassReason,
    }),
  );

  return {
    bytes: outBuf,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    mime,
  };
}
