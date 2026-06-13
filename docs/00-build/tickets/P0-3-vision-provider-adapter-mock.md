# P0-3 — Vision provider adapter + mock

Define the narrow vision provider interface (image(s) + field schema in, transcribed text per face out) and ship a mock adapter that returns canned, structured extractions for the sample set. This is the single seam to the outside world (D8) and the reason the rest of the system can be developed and tested without a live API key.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-3: Vision provider adapter + mock.

Current state: (at start)
- [Paste P0-1 + P0-2 actual output: Next.js App Router + TS strict + Tailwind scaffold; `types/domain.ts` exporting Application, LabelFace, FieldName, Verdict, Lane, VerificationResult, etc.]

What's NOT done yet:
- [P0-3] Provider interface and mock adapter not built.
- [P0-4..P0-7] Config store, image preproc, access gate, CI still pending.
- [P1-2] Extraction service depends on this adapter.
- [P1-3+] Matching engine, triage, result API, review UI all consume the per-face extraction shape this ticket defines.
- [P5-4] Bake-off and [P6-1] in-boundary model adapter swap behind this same interface.

TICKET-P0-3 Goal:
Define `lib/provider/types.ts` with a single `VisionProvider` interface that takes preprocessed images plus the field schema for the application's beverage type, and returns per-face transcribed text plus the government-warning structural flags. Implement `lib/provider/mock.ts` returning canned, deterministic extractions for the sample applications. Wire provider selection by env (`PROVIDER=mock` is the default; live provider keys are added in P1-2). The model returns TEXT ONLY — no verdicts, no confidence numbers (D4, D5).

Check `lib/provider/` does not exist before creating. Don't overwrite existing code.
Follow @systemsdesign.md D4 (extraction contract), D6 (warning bold best-effort), D8 (single provider, swappable), D14 (one call per application). Follow @techstack.md Vision Model section.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-3 Scope

- Phase: Phase 0 — Foundations
- Time budget: 3h
- Dependencies: P0-2
- Branch: `feat/provider-adapter`

### Acceptance criteria

- [ ] `VisionProvider` interface defined in `lib/provider/types.ts`: one method, `extract(input: ExtractionRequest): Promise<ExtractionResponse>`.
- [ ] `ExtractionRequest` carries: an array of preprocessed face images (kind + bytes + mime), the beverage type, and the field schema (which fields to look for). Matches the "one call per application carrying all faces" contract (D14).
- [ ] `ExtractionResponse` is text-only per face plus warning structural flags. Shape per face: `{ kind: FaceKind; fields: Partial<Record<FieldName, string>>; warning: { presence: boolean; allCaps: boolean; boldConfident: "yes" | "no" | "uncertain"; legibility: "good" | "low" } }`. No verdicts, no overall confidence (D4, D5).
- [ ] `MockVisionProvider` implements the interface and returns deterministic canned data for at least three sample application IDs (one green-match, one alcohol-content mismatch, one warning-caps defect). Hard-coded per `sampleId` lookup on the request.
- [ ] Provider selection by env: `getProvider()` reads `process.env.PROVIDER`; defaults to `"mock"`. Throws a clear error if `PROVIDER=anthropic` is requested but no key is configured (live provider implementation is P1-2; this ticket just leaves the seam).
- [ ] System runs end-to-end with no API key — `PROVIDER=mock` and `pnpm dev` is enough.
- [ ] The mock's response shape is byte-for-byte the same as any future real provider's, so the matching engine (P1-3) is provider-agnostic.

### Implementation details

1. Create `lib/provider/types.ts` exporting:
   - `ExtractionRequest`: `{ applicationId: string; beverageType: BeverageType; faces: Array<{ kind: FaceKind; bytes: Buffer; mime: "image/jpeg" | "image/png" }>; fieldSchema: FieldName[] }`.
   - `ExtractionResponse`: `{ faces: FaceExtraction[] }` where `FaceExtraction` is `{ kind: FaceKind; fields: Partial<Record<FieldName, string>>; warning: WarningFlags }`. Reuse `WarningFlags` from `@/types`.
   - `VisionProvider` interface: `{ readonly name: string; extract(input: ExtractionRequest): Promise<ExtractionResponse> }`.
2. Create `lib/provider/mock.ts`:
   - Export `MockVisionProvider implements VisionProvider`.
   - `name = "mock"`.
   - In-file fixture map keyed by `applicationId` returning a hand-crafted `ExtractionResponse`. Cover at least: `sample-green-001` (everything matches), `sample-abv-mismatch-001` (front face reads "45% ABV" while the form expects 40%), `sample-warning-titlecase-001` (warning present, `allCaps: false`).
   - For an unknown ID, return a neutral "front-face-only" extraction with the warning marked `presence: false, legibility: "good"` so the triage path can be exercised.
   - Make the function synchronous internally, wrap in `Promise.resolve(...)` — deterministic, no latency.
3. Create `lib/provider/index.ts`:
   - Export `getProvider(): VisionProvider`. Read `process.env.PROVIDER`; default `"mock"`. Switch on the value. For `"anthropic"` (or whatever name P1-2 uses), throw `new Error("Live provider not yet implemented (see P1-2)")` — the seam is here, the impl arrives later.
4. Create `lib/provider/README.md` (a short one) noting: "Mock and live adapters must return the same `ExtractionResponse` shape. The model reads text only; verdicts and confidence are computed in code (D4, D5)."
5. Add unit tests at `lib/provider/__tests__/mock.test.ts` (or stage for P0-7 if Vitest isn't installed yet — leave a `.test.ts` skeleton importing the types and asserting the response shape via a typecheck-only assertion).
6. Wire a smoke check: a temporary `app/api/_debug/extract/route.ts` (or a script in `scripts/`) that calls `getProvider().extract(...)` with a known sample ID and `console.log`s the result. Delete or guard behind `NODE_ENV !== "production"` before merging.

### Key constraints

1. **Model reads only, no verdicts (D4).** The interface must not include a `verdict`, `match`, or `confidence` field on the response. If a future agent is tempted to add one — they are doing P1-3's job in the wrong place.
2. **Code computes confidence (D5).** Do not return a model-self-reported confidence number on `ExtractionResponse`. The closest signal is `warning.legibility: "good" | "low"`, which is a categorical legibility flag, not a probability.
3. **Single provider, swappable by config (D8).** One `getProvider()` factory, env-driven. No multi-provider consensus, no runtime fallback.
4. **One call per application, all faces in (D14).** The interface takes a `faces` array; do not design it for one-face-per-call.
5. **No persistence (NFR-4).** `bytes: Buffer` lives only in the request lifecycle. Do not write images to disk anywhere in the mock.
6. **TypeScript strict, no `any`.**
7. **FR-25: rules in config.** The field schema (which fields per beverage type) comes from P0-4's `config/fields-by-type.json`, not hardcoded in the provider. For this ticket the mock can accept any schema and ignore it.

### Files to modify

- `app/page.tsx` (at start — paste real file content from prior ticket) — optionally add a smoke-test button that calls `getProvider().extract(...)` against a stub face. Remove before merge if not needed.

### Files to create

1. `lib/provider/types.ts` — `ExtractionRequest`, `ExtractionResponse`, `VisionProvider` interface.
2. `lib/provider/mock.ts` — `MockVisionProvider`, canned fixtures for ≥3 sample IDs.
3. `lib/provider/index.ts` — `getProvider()` env-driven factory.
4. `lib/provider/README.md` — one-paragraph note: same shape across mock and live; text-only contract; D4/D5.
5. `lib/provider/__tests__/mock.test.ts` — type-level and shape assertion (full Vitest wiring in P0-7).

### Config / schema / store updates

_(not applicable — the field schema P0-4 produces is consumed by this provider, not authored here)_

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] `PROVIDER=mock` (the default) — `getProvider().extract({ applicationId: "sample-green-001", ... })` returns the green-match canned shape.
- [ ] `PROVIDER=anthropic` (with no key) — `getProvider()` throws the documented "not yet implemented" error.
- [ ] The mock response for `sample-abv-mismatch-001` shows front-face `alcohol_content: "45% ABV"`. The mock does NOT mark it as a mismatch — that is the matching engine's job (P1-3).
- [ ] The mock response for `sample-warning-titlecase-001` shows `warning.presence: true, allCaps: false` — the model is reporting the structural flag, not making the verdict.

Eval: (not applicable in Phase 0; the eval harness at P5-2 will exercise this adapter against the golden set).

Update docs: Mark P0-3 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- systemsdesign.md — D4 (extraction contract), D5 (confidence source), D6 (warning bold best-effort), D8 (single provider, swappable), D12 (multi-face merge), D14 (one call per application).
- techstack.md — Vision Model; Model Selection and the In-Boundary Production Path (why this adapter is the seam).
- PRD.md §6 — "the model reads, the code decides".

### Common gotchas

1. **The mock must return text-only — never verdicts (D4).** It is tempting to make the mock return `{ alcoholContent: { matches: false } }` for convenience. Do not. The mock simulates what a real model would return; the matching engine (P1-3) does the comparison.
2. **Same response schema as a real provider.** Whatever shape `MockVisionProvider.extract` returns is the contract every other provider must satisfy. If the mock is sloppy with optional fields, the live adapter in P1-2 and the in-boundary adapter in P6-1 will silently diverge and the matching engine will break.
3. **Do not include a model-overall-confidence number.** Confidence is derived in code (D5). The closest legitimate signal is `warning.legibility: "good" | "low"` — a categorical legibility flag, not a probability.
4. **Bold is best-effort (D6).** `warning.boldConfident` is a three-value flag (`"yes" | "no" | "uncertain"`), not a boolean. P1-5 routes `"uncertain"` to the review lane; a boolean would force a false binary on an unreliable read.

### Definition of Done

Code complete when:
- [ ] `VisionProvider` interface defined, with `extract()` taking faces + beverage type + field schema and returning per-face text + warning flags.
- [ ] `MockVisionProvider` returns deterministic canned data for ≥3 sample applicationIds covering: green match, ABV mismatch, warning-caps defect.
- [ ] `getProvider()` selects provider by env; defaults to mock; throws on unimplemented live providers.
- [ ] System runs end-to-end with no API key (`PROVIDER=mock`).
- [ ] No verdicts, no overall confidence in the response shape.
- [ ] `pnpm build` and `pnpm lint` succeed.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/provider-adapter`, pushed, merged to main.

### Expected output

The system has a single named seam to the outside world. Any later code calls `getProvider().extract(...)` and gets back a per-face transcription plus warning structural flags. Today that runs against canned mock data; in P1-2 it runs against Claude Sonnet 4.6; in P6-1 it runs against Azure OpenAI inside Azure Government — same interface, swappable by config.

### Dependencies to install

```
pnpm add zod
```
_(zod is staged here for use by `ExtractionResponse` runtime validation when P1-2 wires the live provider; the mock does not need it but the seam should be ready)._
