/**
 * `preprocessImage` tests — skeleton until P0-7 wires Vitest.
 *
 * Fixtures are generated programmatically with sharp in `beforeAll` so
 * nothing binary ends up in the repo. This is a small intentional
 * deviation from the ticket's "create tests/fixtures/images/*.jpg" wording
 * — generating in-test keeps the repo light and the assertions
 * self-documenting (the test reads "make a 3000x2000 image; expect 1568
 * long edge", not "open this opaque .jpg and trust it's the right size").
 *
 * The D7 promise enforced here:
 *   - Oversize gets capped at the long edge.
 *   - In-spec is passed through unchanged (NO downscale).
 *   - EXIF orientation normalised — phone-rotated images come out upright.
 *   - Corrupt bytes throw the clean "Image could not be decoded" error,
 *     never a stack trace or a filesystem path.
 */

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { preprocessImage } from "../preprocess";

/** Synthesise a tiny solid-color JPEG with optional EXIF orientation. */
async function makeJpeg(
  width: number,
  height: number,
  opts: { orientation?: 1 | 6 | 8 } = {},
): Promise<Buffer> {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  });
  if (opts.orientation) {
    pipeline = pipeline.withMetadata({ orientation: opts.orientation });
  }
  return pipeline.jpeg({ quality: 80 }).toBuffer();
}

describe("preprocessImage", () => {
  it("returns bytes + width + height + mime", async () => {
    const buf = await makeJpeg(800, 600);
    const result = await preprocessImage(buf, "image/jpeg");
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.mime).toBe("image/jpeg");
  });

  it("passes in-spec images through unchanged (D7 — no downscale)", async () => {
    const buf = await makeJpeg(1200, 800);
    const result = await preprocessImage(buf, "image/jpeg");
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
  });

  it("caps oversize landscape at long edge 1568 (D7)", async () => {
    const buf = await makeJpeg(3000, 2000);
    const result = await preprocessImage(buf, "image/jpeg");
    expect(result.width).toBe(1568);
    // 1568/3000 * 2000 = 1045.33; sharp rounds to 1045
    expect(result.height).toBe(1045);
  });

  it("caps oversize portrait at long edge 1568 (D7)", async () => {
    const buf = await makeJpeg(2000, 3000);
    const result = await preprocessImage(buf, "image/jpeg");
    // 1568/3000 * 2000 = 1045.33; sharp rounds to 1045
    expect(result.width).toBe(1045);
    expect(result.height).toBe(1568);
  });

  it("normalises EXIF orientation 6 (camera rotated 90 CW)", async () => {
    // orientation 6 = "rotate 90 CW for display"
    // file stored as 400x600 → displayed as 600x400 after rotation
    const buf = await makeJpeg(400, 600, { orientation: 6 });
    const result = await preprocessImage(buf, "image/jpeg");
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
  });

  it("throws 'Image could not be decoded' on corrupt bytes", async () => {
    const buf = Buffer.from("not an image, just random ascii bytes");
    let err: Error | null = null;
    try {
      await preprocessImage(buf, "image/jpeg");
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).toBe("Image could not be decoded");
  });

  it("respects IMAGE_MAX_LONG_EDGE env override", async () => {
    const original = process.env.IMAGE_MAX_LONG_EDGE;
    process.env.IMAGE_MAX_LONG_EDGE = "1024";
    try {
      const buf = await makeJpeg(2000, 1500);
      const result = await preprocessImage(buf, "image/jpeg");
      expect(result.width).toBe(1024);
    } finally {
      process.env.IMAGE_MAX_LONG_EDGE = original;
    }
  });
});
