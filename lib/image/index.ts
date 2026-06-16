/**
 * Public barrel for `lib/image/`. P1-2's extraction service imports
 * `preprocessImage` from `@/lib/image`.
 */

export { preprocessImage } from "./preprocess";
export type { ImageMime, PreprocessResult } from "./preprocess";

export { cropWarningRegion } from "./cropWarningRegion";
export type { CropResult, WarningRegionHint } from "./cropWarningRegion";
