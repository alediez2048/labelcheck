# P0-5 — Image preprocessing

Ship the in-memory image preprocessing function: normalize EXIF orientation and cap at the provider's maximum usable resolution (~1568px long edge for Claude), with NO downscaling below it (D7). Bytes never touch disk (NFR-4). This is the function every face passes through before reaching the provider adapter.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-5: Image preprocessing.

Current state: (at start)
- [Paste P0-1..P0-4 actual output: Next.js + TS strict scaffold; `types/domain.ts`; provider adapter interface + mock; config store with warning/tolerances/fields-by-type.]

What's NOT done yet:
- [P0-5] Image preprocessing function not built.
- [P0-6, P0-7] Access gate and CI still pending.
- [P1-2] Extraction service will call this function for every face before invoking the provider adapter.
- [P3-2] Imperfect-image robustness adds the cropped-region re-read on top of this same module.

TICKET-P0-5 Goal:
Build `lib/image/preprocess.ts` exporting `preprocessImage(bytes: Buffer, mime: string): Promise<{ bytes: Buffer; width: number; height: number; mime: string }>`. The function reads EXIF orientation and rotates if needed, then caps the long edge at the configured maximum (default 1568px) ONLY if the image exceeds it — it never downscales an image below the cap because the smallest, highest-stakes text (the warning) must stay legible (D7). Everything happens in memory; no temp files, no disk writes, no logs that include the bytes (NFR-4).

Check `lib/image/` does not exist before creating. Don't overwrite existing code.
Follow @systemsdesign.md D7 (image resolution), and @techstack.md Image Preprocessing.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-5 Scope

- Phase: Phase 0 — Foundations
- Time budget: 2h
- Dependencies: P0-1
- Branch: `feat/image-prep`

### Acceptance criteria

- [ ] `preprocessImage(bytes, mime)` exported from `lib/image/preprocess.ts`.
- [ ] EXIF orientation normalized — an image taken sideways comes out upright.
- [ ] If the long edge exceeds the cap (default 1568px), the image is resized so the long edge equals the cap; aspect ratio preserved.
- [ ] If the long edge is at or below the cap, the image is RETURNED UNCHANGED in dimensions (NO upscale, NO downscale). The warning text legibility constraint (D7) is non-negotiable.
- [ ] Output is a `Buffer` (in-memory only) plus the resulting `width`, `height`, and `mime`. No temp files. No disk writes anywhere in the function.
- [ ] Supports JPEG and PNG inputs (FR-1).
- [ ] An invalid image (non-image bytes, corrupt header) throws a clear `Error("Image could not be decoded")` — not a stack trace. (Higher layers map this to the FR-16 "needs a better image" path.)
- [ ] The cap is read from `config` or an env-overridable default (`process.env.IMAGE_MAX_LONG_EDGE`, default 1568) so a future provider swap (P6-1 in-boundary model with a different cap) is a config change.
- [ ] Unit tests cover: rotated image normalises, oversize downscales, in-spec image passes through unchanged, corrupt bytes throw.

### Implementation details

1. Install `sharp` (see Dependencies below).
2. Create `lib/image/preprocess.ts`:
   ```ts
   import sharp from "sharp";
   const DEFAULT_MAX_LONG_EDGE = 1568;
   export async function preprocessImage(bytes: Buffer, mime: string): Promise<PreprocessResult> {
     const maxEdge = Number(process.env.IMAGE_MAX_LONG_EDGE ?? DEFAULT_MAX_LONG_EDGE);
     const pipeline = sharp(bytes, { failOn: "error" }).rotate(); // .rotate() with no args applies EXIF orientation
     const meta = await pipeline.metadata();
     if (!meta.width || !meta.height) throw new Error("Image could not be decoded");
     const longEdge = Math.max(meta.width, meta.height);
     let outPipeline = pipeline;
     if (longEdge > maxEdge) {
       outPipeline = pipeline.resize({ width: meta.width >= meta.height ? maxEdge : undefined, height: meta.height > meta.width ? maxEdge : undefined, withoutEnlargement: true });
     }
     const outBuf = await outPipeline.toBuffer();
     const outMeta = await sharp(outBuf).metadata();
     return { bytes: outBuf, width: outMeta.width!, height: outMeta.height!, mime };
   }
   ```
   (Pseudocode — handle the resize sizing properly so the LONG edge is capped regardless of orientation.)
3. Export a `PreprocessResult` type and re-export from `lib/image/index.ts`.
4. Create `lib/image/__tests__/preprocess.test.ts` (Vitest wiring lands in P0-7; for now write the test file so it picks up automatically). Fixtures:
   - `tests/fixtures/images/rotated-portrait.jpg` (with EXIF orientation 6 or 8).
   - `tests/fixtures/images/oversize-3000x2000.jpg`.
   - `tests/fixtures/images/in-spec-1200x800.jpg`.
   - `tests/fixtures/images/corrupt.bin` (random bytes).
   Use tiny synthetic fixtures, not real labels (NFR-4 / privacy hygiene).
5. Make `preprocessImage` deterministic with respect to input bytes — same input, same output buffer length (within sharp's encoder tolerance).
6. Add a structured log point (`console.info`) noting `{ inputWidth, inputHeight, outputWidth, outputHeight, longEdgeCap }` — but NEVER log the bytes themselves and NEVER log a path.
7. Confirm in a smoke check: invoking the function in a Next.js route handler does not leave a file in `/tmp`, `os.tmpdir()`, or anywhere else.

### Key constraints

1. **D7: do NOT downscale below the cap.** This is the most-likely-to-be-broken rule. If a future agent tries to set the cap to 512 "for speed", the warning text becomes illegible and the highest-stakes check silently weakens. Document the rule in the file's top comment.
2. **D7: the provider caps oversized images internally.** Uploading >1568px buys nothing but latency and tokens — cap at the ceiling but never below.
3. **NFR-4: no persistence.** No temp files. `sharp` works in-memory; do not call `.toFile()`. Do not write to `os.tmpdir()`.
4. **NFR-1: p95 under 5s.** The whole preprocess step should run in well under a second per face (techstack: "input validation and image preprocessing in well under a second"). If a fixture takes longer than 500ms, flag it.
5. **TypeScript strict, no `any`.**
6. **The cap is configurable** — read `process.env.IMAGE_MAX_LONG_EDGE` (default 1568). When P6-1 swaps to Azure OpenAI vision, the cap may differ; this should be a config change, not a code edit.
7. **WCAG / NFR-2** does not apply directly (no UI here), but the function must not silently throw a generic Error; downstream UI maps a clean `"Image could not be decoded"` to the FR-16 needs-a-better-image result.

### Files to modify

- `.gitignore` (at start — paste real file content from prior ticket) — confirm `tests/fixtures/images/` is committed (small synthetic fixtures) and that any user-uploaded images path is ignored.

### Files to create

1. `lib/image/preprocess.ts` — the `preprocessImage` function and `PreprocessResult` type.
2. `lib/image/index.ts` — barrel re-export.
3. `lib/image/__tests__/preprocess.test.ts` — orientation, oversize cap, in-spec passthrough, corrupt-bytes error.
4. `tests/fixtures/images/rotated-portrait.jpg` — small synthetic with EXIF orientation.
5. `tests/fixtures/images/oversize-3000x2000.jpg` — small synthetic oversize.
6. `tests/fixtures/images/in-spec-1200x800.jpg` — small synthetic at or below cap.
7. `tests/fixtures/images/corrupt.bin` — random bytes for error path.

### Config / schema / store updates

- Document `IMAGE_MAX_LONG_EDGE` in `README.md` env section (default 1568, do not set below this without changing the provider).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] Run the preprocess on a rotated phone photo (any sample with EXIF orientation) — the resulting buffer, when written to disk for inspection only, comes out upright.
- [ ] Run the preprocess on a 3000x2000 JPEG — confirm output is 1568x1045 (long edge capped).
- [ ] Run the preprocess on a 1200x800 JPEG — confirm output is 1200x800 (passthrough). This is the D7 acceptance.
- [ ] Verify no files appear in `/tmp` or `os.tmpdir()` during or after the call (`ls -la $(node -p "require('os').tmpdir()")` before/after).
- [ ] Pass a corrupt buffer — confirm the function throws exactly `Image could not be decoded`, no stack trace shown to the caller.

Eval: (not applicable in Phase 0).

Update docs: Mark P0-5 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- systemsdesign.md — D7 (image resolution).
- techstack.md — Image Preprocessing.
- requirements.md — FR-1 (formats), FR-16 (unreadable returns a result, not an error — the layer above maps decode-failure to this), NFR-4 (no persistence), NFR-1 (latency budget).

### Common gotchas

1. **Do NOT downscale below the cap (D7).** The smallest, highest-stakes text on the label is the government warning. Shrinking the image to "improve latency" silently breaks the warning check. The provider already caps oversize internally; the only legitimate resize is "long edge > cap → long edge = cap".
2. **The provider caps oversized images internally** — there is no win from sending >1568px. Cap; do not exceed.
3. **`sharp` orientation: call `.rotate()` with NO arguments** to apply EXIF orientation. Calling `.rotate(90)` rotates an additional 90 degrees on top of EXIF — a real footgun.
4. **No temp files.** `sharp` does not write to disk unless you call `.toFile()`. Never call it. NFR-4 forbids persistence; logs and traces must not include the bytes either.

### Definition of Done

Code complete when:
- [ ] `preprocessImage(bytes, mime)` exported and behaves per acceptance criteria.
- [ ] EXIF orientation applied; oversize capped; in-spec passthrough.
- [ ] No disk I/O anywhere in the function.
- [ ] Invalid image throws clean `"Image could not be decoded"`.
- [ ] `pnpm lint` and `pnpm build` succeed; unit tests pass when Vitest is wired (P0-7).
- [ ] Preprocess time per face is well under a second on the test fixtures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/image-prep`, pushed, merged to main.

### Expected output

Every face image that reaches the provider adapter has been EXIF-normalised and capped at the provider's usable resolution, in memory, with no persistence. The warning text stays legible because in-spec images are passed through unchanged. The cap is config-overridable, so the in-boundary provider swap (P6-1) is a config change.

### Dependencies to install

```
pnpm add sharp
```
