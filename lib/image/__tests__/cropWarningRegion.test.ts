/**
 * `cropWarningRegion` tests — exercises the two crop modes (hint and
 * fallback) and the clamping behaviour on out-of-range hints.
 *
 * Fixtures are generated programmatically with sharp in each test so
 * nothing binary ends up in the repo. Pattern follows `preprocess.test.ts`.
 */

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { cropWarningRegion } from "../cropWarningRegion";

/** Synthesise a tiny solid-color JPEG of the given dimensions. */
async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe("cropWarningRegion", () => {
  it("with a hint, crops to the expected pixel dimensions", async () => {
    const buf = await makeJpeg(1000, 800);
    const result = await cropWarningRegion(buf, "image/jpeg", {
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.3,
    });
    const meta = await sharp(result.bytes).metadata();
    // 0.5 * 1000 = 500, 0.3 * 800 = 240
    expect(meta.width).toBe(500);
    expect(meta.height).toBe(240);
    expect(result.mime).toBe("image/jpeg");
  });

  it("without a hint, crops the bottom 40% of the image (D12 fallback)", async () => {
    const buf = await makeJpeg(1000, 1000);
    const result = await cropWarningRegion(buf, "image/jpeg");
    const meta = await sharp(result.bytes).metadata();
    // top = 0.6 * 1000 = 600; height = 1000 - 600 = 400; width = 1000
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(400);
  });

  it("clamps hint coordinates outside the image without throwing", async () => {
    const buf = await makeJpeg(800, 600);
    // Way out of range — should be clamped, not thrown.
    const result = await cropWarningRegion(buf, "image/jpeg", {
      x: 1.5,
      y: 1.5,
      width: 2,
      height: 2,
    });
    const meta = await sharp(result.bytes).metadata();
    // x and y both clamp to 1 → pixel left/top get pushed inside; width
    // and height collapse to the smallest non-empty region (>=1).
    expect(meta.width).toBeGreaterThanOrEqual(1);
    expect(meta.height).toBeGreaterThanOrEqual(1);
    expect(meta.width).toBeLessThanOrEqual(800);
    expect(meta.height).toBeLessThanOrEqual(600);
  });

  it("clamps a partially-out-of-range hint to image bounds", async () => {
    const buf = await makeJpeg(1000, 800);
    // x + width = 0.9 + 0.5 = 1.4 → width must shrink so left + width
    // stays within the image (1000px).
    const result = await cropWarningRegion(buf, "image/jpeg", {
      x: 0.9,
      y: 0.1,
      width: 0.5,
      height: 0.3,
    });
    const meta = await sharp(result.bytes).metadata();
    // left = 0.9 * 1000 = 900; width must be at most 1000 - 900 = 100
    expect(meta.width).toBe(100);
    // height = 0.3 * 800 = 240
    expect(meta.height).toBe(240);
  });

  it("preserves the PNG mime when the source is PNG", async () => {
    const buf = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .png()
      .toBuffer();
    const result = await cropWarningRegion(buf, "image/png");
    expect(result.mime).toBe("image/png");
    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("png");
  });
});
