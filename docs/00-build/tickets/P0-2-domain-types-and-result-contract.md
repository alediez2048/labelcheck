# P0-2 — Domain types and result contract

Define the TypeScript types for Application, LabelFace, Field, Verdict, Lane, Disposition, and the verification result — the single shared contract used by the API, the UI, and every later service. The names and enums come straight from CONTEXT.md; types only, no logic.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-2: Domain types and result contract.

Current state: (at start)
- [Paste P0-1's actual output: scaffolded Next.js App Router + TS strict + Tailwind + ESLint + Prettier, pnpm scripts work, repo on `main`.]

What's NOT done yet:
- [P0-2] Domain types (Application, LabelFace, Field, Verdict, Lane, Disposition, VerificationResult) not defined.
- [P0-3..P0-7] Provider adapter, config store, image preproc, access gate, CI all depend on these types.
- [P1+] Extraction service, matching engine, triage classifier, result API, review UI all consume the result contract from this ticket.

TICKET-P0-2 Goal:
Create `types/domain.ts` (or split modules) exporting the canonical domain types. Get the names exactly right per CONTEXT.md and the enums exactly right per CONTEXT.md / schema.md. One `VerificationResult` type that the API returns and the UI renders — same shape on both sides, no drift. No logic, no runtime values beyond enum literal unions or const objects.

Check @CONTEXT.md before defining each type. Don't invent terms.
Follow the architecture and decisions in @systemsdesign.md (D4, D5, D12, D13, D14, D16) and the glossary in @CONTEXT.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-2 Scope

- Phase: Phase 0 — Foundations
- Time budget: 1.5h
- Dependencies: P0-1
- Branch: `feat/types`

### Acceptance criteria

- [ ] One shared `VerificationResult` type lives in `types/domain.ts`, exported, ready to be imported by the API route handler (P1-7) and the review UI (P1-8).
- [ ] Enum-like unions match CONTEXT.md exactly: `Lane = "match" | "mismatch" | "review"`; `Verdict = "match" | "mismatch" | "not_found" | "low_confidence"`; `Disposition = "approve" | "return_for_correction"`; `BeverageType = "wine" | "distilled_spirits" | "malt_beverage"` (FR-3); `FaceKind = "front" | "back" | "neck"` (D12).
- [ ] Per-field result carries: field name, form value, extracted value (string | null), verdict, code-derived confidence (number 0–1), short reason string, source face (FaceKind | null) — per D4, D5, D12, FR-14, FR-15.
- [ ] `VerificationResult` carries: lane, overall confidence, per-field breakdown array, flags array, extraction-failure marker (FR-26b), and a recommendation slot for "Return — unreadable image" (FR-26b).
- [ ] Disposition payload type includes the structured `return_reason` summary shape (FR-26a): list of failed fields with system read + form value + optional agent note.
- [ ] No runtime values, no logic, no `any` (TypeScript strict; PRD §6).
- [ ] All types compile under `pnpm build`.

### Implementation details

1. Create `types/domain.ts` (or, if it grows, split into `types/application.ts`, `types/verification.ts`, `types/disposition.ts` and re-export from `types/index.ts`).
2. Define `Application`: `{ id: string; beverageType: BeverageType; form: FormFields; faces: LabelFace[]; correctionCycle?: number; parentApplicationId?: string | null }` — D13 unit-of-verification.
3. Define `FormFields`: required-by-beverage-type fields per FR-2 (`brandName`, `classType`, `alcoholContent`, `netContents`, `producerName`, `producerAddress`, `countryOfOrigin?`). Keep field names matching the glossary; mark optional fields explicitly.
4. Define `LabelFace`: `{ kind: FaceKind; imageRef: string }` — the image is held by reference only (a transient blob handle), never inlined in this type, because NFR-4 forbids persistence.
5. Define `FieldName` union (the verifiable fields, including `government_warning`) and `FieldResult` (form value, extracted value, verdict, confidence, reason, sourceFace).
6. Define `Verdict`, `Lane`, `Disposition`, `FaceKind`, `BeverageType` as string-literal unions.
7. Define `WarningFlags` (presence: boolean, allCaps: boolean, boldConfident: "yes" | "no" | "uncertain", legibility: "good" | "low") — D6 bold is best-effort, surfaces as "uncertain" → review.
8. Define `VerificationResult`: `{ applicationId, lane, overallConfidence, fields: FieldResult[], warning: WarningFlags, flags: string[], extractionFailed: boolean, recommendation?: "return_unreadable_image" }` — FR-14, FR-15, FR-16, FR-26b.
9. Define `ReturnReasonSummary` (FR-26a): `{ failedFields: Array<{ field: FieldName; formValue: string; extractedValue: string | null; reason: string }>; agentNote?: string }`.
10. Define `DispositionRecord`: `{ applicationId, disposition: Disposition; returnReason?: ReturnReasonSummary; decidedAt: string; decidedBy: string }` — whole-application only (FR-26).
11. Define `Role`: `"agent" | "admin"` — D16.
12. Add JSDoc comments on every exported type pointing to the FR/D/AC that drives it. A future agent reading the file alone should know why each field exists.
13. Run `pnpm build` and `pnpm lint` to confirm types compile with strict mode.

### Key constraints

1. Names follow CONTEXT.md exactly — Application (not Label/Filing), Lane (not Status/Bucket), Verdict (not Result), Disposition (not Outcome), Bulk confirm (not "approve all").
2. Disposition is whole-application only — no per-face, no per-field disposition fields (FR-26). The type must make per-face dispositions unrepresentable.
3. Confidence is a number derived in code (D5), not a model-self-reported value. Type it as `number` 0–1; do not add a separate "modelConfidence" field on the public contract.
4. The model returns text only (D4) — the per-field type carries an `extractedValue: string | null`, never a "modelVerdict".
5. TypeScript strict, no `any`, no `unknown` on the public contract.
6. No persistence (NFR-4) — `LabelFace.imageRef` is a transient in-memory handle, not a URL to durable storage.
7. The result type lives in `types/` so both the API (`app/api/verify`) and the UI components can import it — single source of truth (NFR-6).

### Files to modify

- `tsconfig.json` (at start — paste real file content from prior ticket) — verify `paths` alias `@/types/*` resolves; add if missing.

### Files to create

1. `types/domain.ts` — single-file export of all domain types (preferred for Phase 0; split later if it grows).
2. `types/index.ts` — re-export barrel, so importers write `import { VerificationResult } from "@/types"`.

### Config / schema / store updates

_(not applicable — types only; P0-4 brings the config store)_

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] Import `VerificationResult` from `@/types` in a throwaway file; confirm autocomplete shows the field union.
- [ ] Try to construct a `DispositionRecord` with `disposition: "per_face"` — confirm the compiler rejects it.
- [ ] Try to assign `lane: "approved"` — confirm the compiler rejects it (Lane is the AI triage call, not a disposition).
- [ ] Verify every exported type has a JSDoc comment citing its FR/D/AC.

Eval: (not applicable in Phase 0).

Update docs: Mark P0-2 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- CONTEXT.md — every entity name, every enum.
- systemsdesign.md — D4 (extraction contract), D5 (confidence source), D6 (warning bold), D12 (multi-face), D13 (unit of verification), D14 (multi-face call), D16 (roles).
- requirements.md — FR-2, FR-3, FR-13, FR-14, FR-15, FR-16, FR-26, FR-26a, FR-26b.

### Common gotchas

1. Do not include a `modelConfidence` or `modelVerdict` field on the public result — confidence is code-derived (D5), the model renders no verdicts (D4). Adding those fields makes the prototype look like it lets the model judge, which is the exact anti-pattern called out in "Decisions That Look Wrong But Are Deliberate".
2. The Lane enum is the AI's triage call (`match | mismatch | review`), not the agent's decision. Disposition (`approve | return_for_correction`) is the human decision. Mixing them — e.g. adding `"approved"` to Lane — collapses the distinction the whole product depends on (CONTEXT.md: Lane vs Disposition).
3. The Government Warning is a field with extra structural flags (caps, bold, legibility, presence) — not a separate top-level concept. Model it as a `FieldName: "government_warning"` plus a `WarningFlags` sub-shape on the result (D6, FR-11).
4. Do not type `imageRef` as a `Buffer` or a `Uint8Array`. The image bytes live in the request lifecycle (P0-5 handles them); the type contract carries only a transient handle so nothing in P1+ accidentally persists or logs the image (NFR-4).

### Definition of Done

Code complete when:
- [ ] All types in the Acceptance section exported from `@/types`.
- [ ] JSDoc on every exported type points to its FR/D/AC.
- [ ] Impossible states (per-face disposition, model-supplied verdict) are unrepresentable in the type system.
- [ ] `pnpm build` and `pnpm lint` succeed.
- [ ] No `any`, no `unknown` on the public contract.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/types`, pushed, merged to main.

### Expected output

The shared domain vocabulary is in `@/types`. Any later module that imports `VerificationResult`, `Application`, or `DispositionRecord` gets the same compiler-enforced contract. The result shape the API returns is identical to the shape the UI renders. CONTEXT.md is encoded in the type system.

### Dependencies to install

_(none — types only)_

### Why

P0-2 is the only chance to lock the wire contract before any service depends on it — every later ticket (extraction, matching, triage, API, UI) reads these types, so a name change later forces a sweep. We put every shared type into a single `types/domain.ts` (with `types/index.ts` as a barrel) because at Phase 0 there's no reason to fragment — readers should be able to skim the whole contract in one place; we'll split when the file's complexity earns the split, not preemptively. Names follow CONTEXT.md verbatim (Lane, Verdict, Disposition, FaceKind, BeverageType, Role) because the glossary **is** the contract. The naming-convention split is deliberate: TypeScript field names are camelCase (project style), but wire-format identifiers (`FieldName` literals, enum values like `distilled_spirits`) stay snake_case to match `schema.md` — so the matching engine's lookup keys, the audit-trail `field_result` row values, and the future COLAs Online integration all speak the same identifier vocabulary; the boundary is the wire layer, not the type system. The hardest call was modeling Disposition: we made it whole-application only by **structure** (no per-face or per-field discriminator on `DispositionRecord`), so partial approvals are unrepresentable rather than convention-enforced. Same goes for the Lane vs Disposition split — Lane lives on `VerificationResult` (the AI's call), Disposition lives on `DispositionRecord` (the human's call), the two unions don't overlap; adding "approve" to Lane (the anti-pattern in CONTEXT.md) would require a knowing edit to the source of truth, not accidental drift. `extractedValue` is `string | null` (the model returns text or nothing per D4), never a verdict object, so the matching engine can't be fooled into treating the model as a judge. `confidence` is `number` — the code-derived signal from D5, not the model's self-reported number; we considered exposing both but kept the contract narrow because every field that could host the model's number is a future bug waiting to happen. `LabelFace.imageRef` is `string` (a transient in-memory handle), never `Buffer` or `Uint8Array`, so the type system makes it harder to accidentally inline image bytes into a serialized response or a log line — which would silently violate NFR-4. Trade-off accepted: `returnReason` on `DispositionRecord` is optional rather than discriminated; a stricter `{ disposition: "approve" } | { disposition: "return_for_correction"; returnReason: ReturnReasonSummary }` would prevent forgetting it, but adds type-narrowing noise at every consumer, and the disposition write path (P1-8) will validate with Zod anyway. JSDoc on every exported type cites its FR/D/AC so a future agent reading the file alone can reconstruct the rationale; leaving it only in the design docs invites drift the next time the schema evolves.
