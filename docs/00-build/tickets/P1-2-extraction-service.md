# P1-2 — Extraction service

Wire the extraction service that sends every face of an application through the vision provider adapter in a single call and returns transcribed-text-only fields per face, plus the warning structural flags (presence, all-caps, bold best-effort, legibility).

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-2: Extraction service.

Current state: (at start)
- [list with checks the Phase 0 + P1-1 output: the vision provider adapter interface and mock from P0-3, the preprocessor from P0-5, the config store from P0-4, the input page and Application schema from P1-1]

What's NOT done yet:
- [list with crosses: this extraction service, matching, confidence derivation, triage, multi-face merge, result API, review UI, timeout/degrade, acceptance tests, latency bench]

TICKET-P1-2 Goal:
Build lib/extraction/service.ts as the seam between the validated Application and the model. It takes a preprocessed Application, sends every face through the provider adapter in exactly one call (D14), and returns transcribed text per face plus warning structural flags (presence, ALL-CAPS, bold best-effort, legibility). The model produces only signals; it never renders a verdict (D4). This protects the latency budget and keeps the matching layer testable.

Check lib/provider/types.ts, lib/provider/mock.ts, config/fields-by-type.json, and types/domain.ts before starting. Don't overwrite the provider interface.
Follow the architecture and decisions in @systemsdesign.md (D4 model reads, D14 single call per application, D8 provider strategy) and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-2 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 3h
- Dependencies: P0-3 (provider adapter + mock), P1-1 (Application input)
- Branch: feat/extraction

### Acceptance criteria

- [ ] Exactly one provider call per application, with every label face attached to that single call (D14, NFR-1).
- [ ] The model returns text-only per face: brand, class/type, ABV, net contents, producer name and address, country of origin, and the government warning text and styling signals (FR-4).
- [ ] The warning return carries four structural flags: presence, ALL-CAPS (reliable), bold (best-effort), and a per-region legibility signal (D4, D6).
- [ ] The model renders zero verdicts; the response is purely transcribed signals (D4).
- [ ] Runs against the mock adapter with no API key (techstack Vision Model).
- [ ] Runs against a live adapter when an API key is present (env-configured, D8).
- [ ] Image tokens are kept inside the latency budget — capped at provider max resolution, no smaller (D7).

### Implementation details

- Create `lib/extraction/service.ts` exporting a single function `extract(application: Application): Promise<ExtractionResult>`.
- Define the response shape in `types/domain.ts` (or a new `types/extraction.ts` if cleaner): per-face transcribed fields plus the warning flags. Keep it text-only — no match decisions, no scores from the model (D4).
- The prompt and the JSON schema live in this service. Ask the model for transcribed text per face plus the warning structural flags. Treat the model's own self-reported confidence as a signal we will ignore for lane decisions (D5).
- Compose one call to the provider adapter with all of the application's faces attached. Do not loop over faces (D14). The mock adapter from P0-3 already returns canned per-face extractions; conform the service contract to it.
- Pull the field schema (which fields to ask for) from `config/fields-by-type.json` keyed by the application's beverage type (FR-3, FR-25).
- The provider adapter is the swappable seam (D8). Do not import a vendor SDK from this service; route everything through `lib/provider/*`.
- Document the environment variable for the live provider (e.g. `ANTHROPIC_API_KEY`) in the README. When the variable is unset, the mock adapter runs.
- Do not wire the timeout here — that's P1-9. This ticket assumes the provider adapter behaves.

### Key constraints

1. Model reads, code decides (D4). The model returns transcribed text and structural flags. It does not say "this matches" or "this is good".
2. Confidence used by triage is derived in code, not taken from the model (D5). The model's self-reported number, if returned, is logged but ignored downstream.
3. One model call per application carrying all faces (D14) — multiple sequential calls breaks the 5s budget and the per-application cost model.
4. p95 under 5s end-to-end (NFR-1).
5. TypeScript strict mode, no any. The extraction response is a typed contract.
6. Rules in config: the per-beverage-type field schema is read from config, not hard-coded (FR-25).
7. No PII to disk (NFR-4). The service runs in memory; images and transcribed text live only in the request lifecycle.

### Files to modify

- `lib/provider/types.ts` (at start — paste real content from P0-3) — consume; only extend if the adapter contract is missing a needed field (e.g. legibility flag).
- `lib/provider/mock.ts` (at start — paste real content from P0-3) — extend the canned responses if needed to cover the new contract.
- `types/domain.ts` (at start — paste real content from P0-2 and P1-1) — extend with the ExtractionResult type if not already there.
- `config/fields-by-type.json` (at start — paste real content from P0-4) — consume.

### Files to create

1. `lib/extraction/service.ts` — the extract(application) function.
2. `lib/extraction/prompt.ts` — the prompt template and JSON schema asked of the model (keeps the prompt versionable).
3. `types/extraction.ts` (optional, if you don't extend domain.ts) — the ExtractionResult and per-face transcription shapes.
4. `lib/extraction/__tests__/service.test.ts` — unit tests against the mock adapter covering: single call per application, all faces attached, warning structural flags returned, model verdicts not produced.

### Config / schema / store updates

- The extraction service reads the per-beverage-type field schema from `config/fields-by-type.json`. Do not duplicate the list in code.
- The prompt template lives in `lib/extraction/prompt.ts` so it can be diffed and versioned cleanly (this becomes important for the eval gate in P5-5).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Unit tests (via the mock adapter):
- [ ] A two-face application produces exactly one provider call with both faces attached.
- [ ] The response contains transcribed text per face and the four warning flags.
- [ ] No field in the response carries a "match" or "verdict" label.
- [ ] The field set asked for matches the beverage-type schema from config.

Manual:
- [ ] Run the input flow through to the extraction service; confirm the structured response shape is logged.
- [ ] Toggle the API key off; confirm the mock adapter serves the call.

Eval: not yet — golden-set assertions come in P1-10.

Update docs: mark P1-2 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D4 (extraction contract), D5 (confidence source), D6 (warning bold detection), D7 (image resolution), D8 (provider strategy), D12 (multi-face), D14 (single call per app), Component Breakdown: Extraction service and Vision provider adapter.
- @techstack.md — Vision Model, Model Selection.
- @requirements.md — FR-4, FR-5, FR-6; NFR-1, NFR-3, NFR-4.

### Common gotchas

1. Single call per application, all faces attached (D14). Do NOT loop over faces and make N sequential calls — that breaks the 5s budget and inflates cost.
2. The model returns transcribed text and structural flags only. NEVER ask the model "does this field match the form" — matching is the code's job (D4). A future maintainer may try to simplify by letting the model judge; the grill session explicitly forbids it.
3. Do not use the model's self-reported confidence to drive triage. Log it for analysis, but P1-4 derives confidence in code from match margin plus the model's legibility flag (D5).
4. Bold detection is best-effort, not authoritative (D6). Treat the bold flag as a signal that may be "uncertain" — that uncertainty must propagate, not collapse to a yes/no.

### Definition of Done

Code complete when:
- [ ] `extract(application)` makes one provider call carrying all faces.
- [ ] The response carries transcribed text per face plus the four warning flags.
- [ ] The mock adapter runs the service end-to-end with no API key.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Unit tests assert single-call-per-app and the warning-flag contract.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/extraction, pushed, merged to main.

### Expected output

After this ticket, an application that flows from the P1-1 input UI reaches a `lib/extraction/service.ts` that produces a typed, text-only transcription per face plus warning structural flags, in one provider round trip. Matching, confidence, triage, and the user-visible result are still ahead.

### Dependencies to install

```
pnpm add @anthropic-ai/sdk
```

Document `ANTHROPIC_API_KEY` in the README. Without it, the mock adapter is used.
