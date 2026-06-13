# P3-2 — Imperfect-image robustness

Handle mildly imperfect photos (angle, glare, uneven lighting) without losing the warning check: when a face's warning region returns low confidence on the first pass, perform a targeted high-resolution re-read of just that cropped region. Severely degraded inputs are not force-processed; they land in the low-confidence "needs a better image" lane through the existing FR-16 path — not as errors.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P3-2: Imperfect-image robustness.

Current state: (at start)
- [list what is DONE so far, with checks, including Phase 0, Phase 1 (extraction at full usable resolution per D7, per-face warning structural flags + legibility signal from the model, triage classifier that surfaces warning failures and routes unreadable inputs to the low-confidence lane per FR-16), Phase 2 (queue, routing, roles), and P3-1 batch intake]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: targeted high-res re-read of the warning region on low-confidence (this ticket), error-handling pass, performance hardening]

TICKET-P3-2 Goal:
Tighten the system's behaviour on the kind of imperfect images agents will realistically receive: mild angle, glare, uneven lighting (FR-6, A13). The first pass is unchanged — one model call per application, all faces at full usable resolution (D7, D14). When the warning region on a face comes back with low confidence (per the model's per-region legibility signal from D4), perform a targeted re-read of just that cropped region at high resolution and merge the result. Severely degraded inputs still flow through the existing FR-16 "needs a better image" path; this ticket does not turn unreadable into an error.

Check lib/image/preprocess.ts, the extraction service, the matching engine's warning check, and the triage classifier before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (D4 extraction contract with structural + legibility flags, D7 full-resolution + targeted re-read of low-confidence warning region, D13 unit of verification, Error Handling and Degraded Cases, Meeting the Latency Budget).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P3-1: batch endpoints, orchestrator, in-memory store, batch UI; plus the Phase 1 extraction pipeline and the FR-16 unreadable path.)_

### TICKET-P3-2 Scope

- Phase: Phase 3 — Batch, imperfect images, hardening
- Time budget: 3h
- Dependencies: P1-2 (extraction service)
- Branch: feat/image-robust

### Acceptance criteria

- [ ] Mildly skewed, glared, or unevenly lit photos read end to end on the first pass when the model's per-region legibility flag is acceptable (FR-6; A13).
- [ ] When the warning region returns low confidence (per-region legibility flag below threshold or no warning text recovered from a face the model says it scanned), the system performs a targeted high-resolution re-read of just the cropped warning region (D7).
- [ ] The re-read is kept off the synchronous critical path where possible (it adds one extra model call only on the failing slice, not the whole image) (systemsdesign Meeting the Latency Budget).
- [ ] Merged result uses the re-read's transcription if it is more legible; otherwise it keeps the first pass's result. The matching engine then re-runs the warning check on the merged transcription (D6, D7).
- [ ] Severely degraded inputs (no text recovered from any face, model declines, or the re-read also fails) flow through the existing FR-16 path: a "needs a better image" result in the low-confidence lane, with the explicit "Return — unreadable image" recommendation surfaced (FR-16, FR-26b). Not an error.
- [ ] Single-application p95 holds under 5 seconds for the first-pass case; the re-read case is allowed to exceed when triggered, but the result is still a structured low-confidence result, not a hang or error (D10; NFR-1).
- [ ] The re-read trigger is logged for observability so we can later measure how often it fires and how often it rescues the warning check.

### Implementation details

- The first model call is unchanged: one call per application, all faces at full usable resolution (D14, D7). The extraction prompt already requests the per-region legibility signal (D4) — confirm that signal is plumbed through to the matching engine and the triage classifier.
- Add `lib/image/cropWarningRegion.ts` using `sharp`: given an image buffer and a region hint from the model (bounding box on the face for the warning), return a cropped buffer at the original (pre-crop) resolution. If the model did not return a usable region hint, fall back to the bottom portion of the back face as a heuristic crop (the warning usually lives on the back; D12). Document the fallback heuristic in code.
- Add `lib/extraction/rereadWarning.ts`: takes a cropped warning region buffer, calls the provider adapter with a tight prompt that asks only for the warning's verbatim text plus the all-caps and bold-best-effort flags (D4, D6). Returns a `WarningRereadResult` with the new transcription, the new legibility flag, and the source face id.
- In `lib/extraction/service.ts`, after the first pass, inspect per-face warning legibility. If any face that the first pass identified as the warning's source returns low legibility (configurable threshold via `config/tolerances.json`), trigger `rereadWarning` for that face. Only one re-read per application (the warning is one field, even if checked across faces — D12) to bound latency and cost.
- Merge: if the re-read returns a higher-legibility transcription, replace the first-pass warning transcription for that face in the merged extraction result. The matching engine's warning check (D6) then runs on the merged text.
- The triage classifier's behaviour is unchanged: if the merged result still produces a warning failure (missing, altered, or styling failure), the application lands in the mismatch lane (D6, FR-13). If the merged result is still low confidence, it lands in the low-confidence lane and surfaces the FR-26b "Return — unreadable image" recommendation when extraction failure (not just low match confidence) is the cause.
- Distinguish in code (and in the result payload) between "low match confidence" (matching engine signal, may land in review lane) and "extraction failure" (per FR-26b, recommendation is to return for a better image). Do not collapse them.
- Severely degraded inputs (the re-read also returns nothing readable, or the model declines outright) are not an error and not a retry storm. They flow through the existing FR-16 needs-a-better-image path with the FR-26b recommendation. No stack traces.

### Key constraints

1. D7 says full resolution always for the first pass; do not downscale to "save latency". The targeted re-read is the cure for a low-confidence warning region, not pre-emptive downscaling.
2. Model reads, code decides (D4, D5) — the legibility flag is one input to the code's decision about whether to re-read; the model does not decide to re-read.
3. Severe degradation (unreadable) returns the low-confidence "needs a better image" lane via FR-16, with the FR-26b recommendation. Not an error. Not a hang. Not a retry loop (D10).
4. The re-read adds at most one extra model call per application, on the warning region only. It is not a multi-pass chain on every field (Meeting the Latency Budget).
5. p95 under 5s for the first-pass case (NFR-1). The re-read trigger is allowed to exceed; degrade is graceful, not silent.
6. TypeScript strict mode, no `any` (techstack).
7. The Application is the unit (D13); the re-read still operates within the one-application call envelope plus at most one targeted follow-up.

### Files to modify

- `lib/image/preprocess.ts` (at start — paste real content from P0-5) — extend if needed to expose the pre-preprocess full-resolution buffer for cropping (the crop must operate on the resolution sent to the model, not on a smaller copy).
- `lib/extraction/service.ts` (at start — paste real content from P1-2) — add the post-first-pass legibility check and the targeted re-read trigger; merge the re-read transcription back into the extraction result.
- `lib/provider/types.ts` and `lib/provider/mock.ts` (at start — paste real content from P0-3) — extend the mock adapter to support a re-read mode (a tight prompt over a cropped region returning higher-legibility text), so tests cover the re-read path without a live key.
- `config/tolerances.json` (at start — paste real content from P0-4) — add a `warningLegibilityRereadThreshold` knob.
- `app/verify/ReviewResult.tsx` (or equivalent — paste real content from P1-8) — surface the FR-26b "Return — unreadable image" recommendation when the merged extraction still indicates extraction failure on the warning.

### Files to create

1. `lib/image/cropWarningRegion.ts` — crop the warning region from a face buffer (region hint from model, with a back-face bottom heuristic fallback).
2. `lib/extraction/rereadWarning.ts` — targeted high-resolution re-read of a cropped warning region.
3. `tests/extraction/reread.test.ts` — unit tests for the re-read trigger logic and merge.

### Config / schema / store updates

- Add `warningLegibilityRereadThreshold` to `config/tolerances.json` (FR-25). Default tuned so a low-confidence warning region triggers the re-read; do not bury it in code.
- No persistent state; the re-read happens in the request lifecycle (NFR-4).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add Vitest tests for:
- `lib/extraction/service.ts` — given a mock first-pass result with a low-legibility warning region on the back face, assert the re-read is triggered exactly once and the merged result uses the re-read transcription.
- A first-pass result with acceptable legibility does not trigger a re-read.
- A re-read that also returns no readable text leaves the merged result as "extraction failure on warning", which the triage classifier routes to the low-confidence lane with the FR-26b recommendation.
- Crop-region heuristic: when the model returns no region hint, the back-face bottom portion is cropped.

Manual:
- [ ] Feed a deliberately mildly-skewed photo of a real back-label-with-warning fixture; confirm the first pass reads it; confirm no re-read fires.
- [ ] Feed a mildly glared photo where the warning's per-region legibility comes back low; confirm the re-read fires (visible in logs), the merged transcription is used, and the warning check passes (or fails correctly if the wording is genuinely off).
- [ ] Feed a severely degraded image (blurred, dark, or non-label); confirm it lands in the low-confidence lane with the FR-26b "Return — unreadable image" recommendation surfaced — not an error page.
- [ ] Measure end-to-end latency on the first-pass case (no re-read): confirm p95 under 5s on representative inputs (NFR-1).
- [ ] Measure end-to-end latency on the re-read case: confirm the result is still structured and within a reasonable degraded envelope (not infinite, not a hang).

Eval: re-run the Phase 1 golden set; confirm no regressions on the warning-check accuracy and the false-negative rate. Add at least one new fixture: a mildly degraded image with a correct warning that the first pass struggles on and the re-read rescues.

Update docs: mark P3-2 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D4 (extraction contract, structural + legibility flags), D6 (warning bold detection), D7 (image resolution: full-res first pass + targeted re-read), D13/D14 (Application is the unit, one call carries all faces), Error Handling and Degraded Cases, Meeting the Latency Budget.
- @techstack.md — Image Preprocessing (sharp), Vision Model (mock adapter for tests).
- @requirements.md — FR-6, FR-11, FR-16, FR-26b; NFR-1; AC-3, AC-4, AC-6.
- @assumptions.md — A13 (imperfect images are supported, mild only; severe falls back to needs-a-better-image), A14 (bold is best-effort).
- @CONTEXT.md — Label face, Government Warning.

### Common gotchas

1. D7 says full resolution always for the first pass. Do not downscale for "speed". The fix for a low-confidence warning region is a targeted high-resolution re-read of that crop, not pre-emptive downscaling of the whole image.
2. Severe degradation (unreadable) is a normal outcome, not an error (Error Handling). It returns the low-confidence lane via FR-16, with the FR-26b "Return — unreadable image" recommendation. Do not throw, do not retry-loop, do not surface a stack trace.
3. The re-read is bounded: at most one per application, targeting the warning region only. Do not generalize this into a "re-read any low-confidence field" pass — that turns into a multi-pass chain and breaks the latency budget (Meeting the Latency Budget).
4. The legibility flag comes from the model's per-region signal (D4), but the decision to re-read lives in code (D5). The model produces signals; the code applies the rule. Do not ask the model "should we re-read?".

### Definition of Done

Code complete when:
- [ ] The extraction service triggers a targeted warning-region re-read when the first-pass legibility is below threshold.
- [ ] The merged extraction result uses the re-read's transcription when it is more legible.
- [ ] The matching engine runs the existing warning check on the merged transcription.
- [ ] Severely degraded inputs return the FR-16 low-confidence result with the FR-26b recommendation, not an error.
- [ ] First-pass p95 holds under 5 seconds; re-read case degrades gracefully without hanging.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass (including the new re-read tests).
- [ ] Manual checks above ticked.
- [ ] Phase 1 golden set re-runs without regression; new degraded fixture added.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/image-robust, pushed, merged to main.

### Expected output

Mild photographic imperfections no longer cost the warning check: a borderline-legible warning region triggers a single targeted high-resolution re-read of just that crop, and the merged transcription feeds the existing warning rules. Truly unreadable images still land cleanly in the low-confidence lane with the explicit "Return — unreadable image" recommendation, not a stack trace.

### Dependencies to install

No new dependencies. `sharp` (already in P0-5) covers the crop. The provider adapter from P0-3 is reused for the targeted re-read call.
