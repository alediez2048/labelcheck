# P1-1 — Application input and sample loader

Build the application input surface: a multi-face image upload plus a beverage-type-aware form with zod validation, alongside a sample-application picker that loads canned fixtures so the demo and the acceptance test set run from the same data path.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-1: Application input and sample loader.

Current state: (at start)
- [list what is DONE so far, with checks, including the Phase 0 output: the Next.js + TypeScript scaffold, domain types in types/domain.ts, the mock vision provider adapter at lib/provider/mock.ts, config files under config/, image preprocessing at lib/image/preprocess.ts, the access-gate middleware, and the CI/Vitest harness]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: the input UI, sample fixtures, beverage-type-aware field schemas, extraction service, matching, triage, result API, review UI, timeout/degrade, acceptance tests, and the latency bench]

TICKET-P1-1 Goal:
Deliver the first screen of the prototype: capture an application (one or more label face images plus the form fields keyed by beverage type) and offer a "Load sample" path that hydrates the same form from preloaded fixtures. Validate everything at the boundary with zod so bad input never reaches the extraction service. The fixtures double as the Phase 1 acceptance test corpus.

Check types/domain.ts, config/fields-by-type.json, and lib/image/preprocess.ts before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (decisions D9 form input, D12 multi-face, D13 unit of verification) and the rules in @CONTEXT.md (Application, Form, Label face).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-1 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 3h
- Dependencies: P0-2 (domain types)
- Branch: feat/app-input

### Acceptance criteria

- [ ] Multi-face upload accepts front, back, and neck images in one application (FR-1, D12).
- [ ] Form fields render and validate by beverage type, driven by config/fields-by-type.json (FR-2, FR-3, FR-25).
- [ ] A sample-application picker loads a fixture (form + label image references) into the form (D9; AC demo).
- [ ] All input — file types, file sizes, required fields per beverage type — is validated with zod at the API boundary (techstack Input Validation).
- [ ] The submission shape matches the Application contract from types/domain.ts (CONTEXT.md: Application).
- [ ] The image upload runs through lib/image/preprocess.ts (orientation normalize, cap at the provider's max usable resolution) before being handed off (D7).
- [ ] Accessible: large click targets, keyboard reachable, color + icon + text on validation errors (NFR-2).

### Implementation details

- Build the input page at app/verify/page.tsx (or equivalent App Router location). One obvious primary action: "Verify" (FR-21).
- Add a beverage-type selector (wine, distilled spirits, malt beverage) that drives which form fields render. Read field requirements from config/fields-by-type.json (FR-3, FR-25). For the prototype, distilled spirits is the primary path (A10).
- Build the form: brand name, class/type designation, alcohol content, net contents, bottler/producer name and address, country of origin (when imports). The form does not OCR the application; it accepts typed values (FR-2; A2).
- Build the multi-face uploader: accept JPEG and PNG. Allow naming each face front, back, or neck. Support one-or-more, not exactly one (FR-1, D12).
- Wire the uploader through lib/image/preprocess.ts so faces are orientation-normalized and capped at the provider's max usable resolution (around 1568px long edge for Claude) before handoff. Nothing persists to disk (NFR-4, D7).
- Define a zod schema at lib/validation/application.ts that mirrors the Application domain type. Validate beverage-type-conditional required fields. Return clean error messages, not raw zod issues, to the UI (techstack Input Validation; systemsdesign Error Handling).
- Build a sample loader: fixtures/samples.ts exports a small set of preloaded applications (form values + paths to bundled fixture images under fixtures/images/). At least one green pair (form matches label) and one obvious mismatch. A picker on the input page hydrates the form from a sample (D9).
- The fixtures are also the seed for the Phase 1 acceptance test set (P1-10), so structure them so tests can import them directly.

### Key constraints

1. Model reads, code decides (D4, D5) — no model calls here yet; this ticket is pure input capture.
2. p95 under 5s end-to-end (NFR-1) — preprocessing must run in memory, no disk writes.
3. WCAG 2.1 AA — color plus icon plus text on errors, never color alone (NFR-2, AC-9).
4. TypeScript strict mode, no any (techstack).
5. Rules in config: per-beverage-type required fields live in config/fields-by-type.json, not in code (FR-25).
6. The Application is the unit of verification (D13). Do not let the UI treat each face as its own submission.
7. No applicant PII written to disk; images live in memory through the request lifecycle (NFR-4).

### Files to modify

- `types/domain.ts` (at start — paste real content from P0-2) — extend if the Application or LabelFace types need a fileName or role (front/back/neck) field.
- `config/fields-by-type.json` (at start — paste real content from P0-4) — confirm the per-beverage-type required fields cover the FR-2 list.
- `lib/image/preprocess.ts` (at start — paste real content from P0-5) — consume but do not modify.

### Files to create

1. `app/verify/page.tsx` — the input page (form + uploader + sample picker + primary "Verify" action).
2. `app/verify/InputForm.tsx` — the beverage-type-driven form component.
3. `app/verify/FaceUploader.tsx` — the multi-face image uploader (front/back/neck).
4. `app/verify/SamplePicker.tsx` — the sample-application loader UI.
5. `lib/validation/application.ts` — the zod schema for the Application submission.
6. `fixtures/samples.ts` — the preloaded sample applications (form + image refs).
7. `fixtures/images/` — bundled sample label images (a green pair and at least one red case).

### Config / schema / store updates

- Confirm `config/fields-by-type.json` carries the per-beverage-type required-field lists used by the zod schema. Edit there, not in code (FR-25).
- No new persistent state stores. Input lives in client state and the request body only (NFR-4).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Manual:
- [ ] Load a sample from the picker; confirm the form hydrates and the bundled face images render as previews.
- [ ] Switch beverage type; confirm the required-field set updates.
- [ ] Upload a face shot taken in portrait orientation; confirm preprocessing returns it upright.
- [ ] Submit with a missing required field; confirm a clean error message (no zod stack trace) and that the error uses color + icon + text (NFR-2, AC-9).
- [ ] Try uploading a non-image file; confirm rejection at the boundary.
- [ ] Keyboard-only run-through of the form to the "Verify" button.

Eval: not applicable at this ticket (no matching or triage yet).

Update docs: mark P1-1 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D9 (form input), D12 (multi-face), D13 (unit of verification), D7 (image resolution), Data Flow: Single-Application Verification.
- @techstack.md — Input Validation (zod), Image Preprocessing (sharp).
- @requirements.md — FR-1, FR-2, FR-3, FR-21, FR-25; NFR-2, NFR-4.
- @CONTEXT.md — Application, Form, Label face.

### Common gotchas

1. The unit is the Application, not the label face. Front, back, and neck must travel together in one submission, not as three separate verifications (D13).
2. Do not downscale images for "speed". Cap at the provider's max usable resolution and no smaller — the government-warning text is the smallest highest-stakes content on the label and shrinking it breaks the warning check (D7).
3. Beverage-type-conditional required fields must come from `config/fields-by-type.json`, not hard-coded in the zod schema. Burying rules in code violates FR-25.
4. Error display must satisfy AC-9 (color plus icon plus text) — a red border alone is not enough; pair it with an icon and a textual message.

### Definition of Done

Code complete when:
- [ ] The input page renders a beverage-type-aware form and a multi-face uploader.
- [ ] The sample picker hydrates the form from at least two fixtures (one green, one red).
- [ ] Submitting with valid input produces a well-formed Application object that conforms to the zod schema.
- [ ] Submitting with invalid input shows clean, accessible error messages.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Manual checks above ticked.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/app-input, pushed, merged to main.

### Expected output

The app boots to a single-page input flow where an agent can either pick a preloaded sample or manually fill the form and upload one to three face images, then press a clearly visible Verify button. The submission is a validated Application object ready for the extraction service in P1-2. Nothing is written to disk.

### Dependencies to install

```
pnpm add zod
```

_(zod was already installed in P0-3; no new deps for this ticket.)_

### Why

P1-1 is the first agent-facing screen, and the design constraints all pull in the same direction: one obvious primary action (FR-21), color + icon + text validation (NFR-2, AC-9), beverage-type-driven required fields (FR-3, FR-25), and a strict client/server contract that maps cleanly onto the `Application` type from P0-2. We resolved the client/server seam by making `app/verify/page.tsx` a **server component** that loads the field config once via `getRequiredFields(beverageType)` and passes the result as a prop; `InputForm.tsx` is the client component that owns the form state. That means the per-beverage-type required-field list is sourced from `config/fields-by-type.json` (FR-25) without smuggling `fs` reads into the client bundle. Trade-off accepted: the field config is captured at render time, so editing the JSON without a dev-server restart doesn't update an open browser tab — fine for a prototype where edits go through a restart anyway, and the alternative (an API endpoint that returns the config) is more code for no demo gain.

We deliberately stopped before building the API route. The Verify button **validates** the submission shape and shows a "Submission preview" panel with the validated `Application` JSON, rather than POSTing to `/api/verify` (which lands in P1-7). Two reasons: (1) there's no extraction service to call yet (P1-2), so a fake POST that just sets state would be more code than the preview without any extra demonstration; (2) the preview makes the contract visible to a stakeholder watching the demo — they see exactly what shape the verification API will receive, before the API even exists, which is a good intermediate milestone.

The fixtures are committed under `public/fixtures/images/` so the bundled demo and the offline acceptance tests (P1-10) read the same data. We considered generating them at build time and rejected it: a broken `cola-generator` run would break the demo, and three AI-synthesised PNGs (each <1MB, no applicant PII, NFR-4 allows synthetic) cost nothing to track. **Sample IDs deliberately match the mock provider's fixture keys** in `lib/provider/mock.ts` so a chosen sample produces a canned extraction in P1-2 without re-keying — the demo flow and the matching engine speak the same vocabulary by accident-prevention rather than convention. The same `fixtures/samples.ts` module is imported by both the picker and the P1-10 acceptance tests, so the demo path and the test path **cannot** drift.

Two code-style choices: `RawLabelFaceSchema` uses `z.instanceof(Buffer)` because the verify API will receive raw bytes through FormData (P1-7), and zod's `Buffer` check is the cheapest way to assert the shape without invoking sharp inside validation — that's the matching engine's preprocessing pass, not the validation step. `validateApplication` returns a discriminated `{ ok: true } | { ok: false, fieldErrors, formErrors }` union rather than throwing, because every consumer (the API handler, the tests, future hot paths) wants to handle invalid input as data, not as an exception. The `fieldErrors` map is keyed by camelCase form-field name (not zod's `form.brandName` path) so the UI binds errors to specific inputs without parsing zod issue strings — that was the explicit "no raw zod paths leak through" assertion in the test suite.

Multi-face handling is wired but the prototype samples are single-face. We didn't fake multi-face fixtures because the matching engine's multi-face merge (P1-6 — "a field is satisfied if found on any face, warning checked across faces") is the meaningful test of that capability; putting it through a contrived demo before the merge code exists adds noise without information. The uploader supports up to three faces with a kind selector (front/back/neck), so a stakeholder can hit Choose Files, add a back face, and watch the form accept multiple — sufficient demonstration that the seam works.
