# P1-6 — Multi-face merge

Merge per-face per-field results so that a field is considered satisfied if it is found on ANY face, and the government warning is checked across ALL faces. Track which face supplied each satisfied field so the review UI can point the agent at the right artwork.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-6: Multi-face merge.

Current state: (at start)
- [list with checks: extraction service returning text per face, matching engine per field per face, confidence derivation, triage classifier]

What's NOT done yet:
- [list with crosses: result API, review UI, timeout/degrade, acceptance tests, latency bench]

TICKET-P1-6 Goal:
A single application carries one form plus one or more label faces (front, back, neck). A field appearing on any face satisfies the form's requirement for it (D12), and the government warning is checked across all faces because it usually sits on the back. Merge per-face matching results into a single per-field result for the application, tracking which face supplied the satisfying read so the review UI can point at the right artwork. A front-only upload must NOT false-flag the warning (D12).

Check the per-face FieldResult shape coming out of P1-3 / P1-4 before starting.
Follow the architecture and decisions in @systemsdesign.md (D12 multi-face, D13 unit of verification) and the rules in @CONTEXT.md (Label face, Application).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-6 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 1.5h
- Dependencies: P1-2 (extraction service), P1-3 (matching engine)
- Branch: feat/multiface

### Acceptance criteria

- [ ] A field found on any face is considered satisfied at the application level (D12).
- [ ] The government warning is verified across all faces — a back-only warning is still a pass; a missing warning on every face is a fail (D12, flowchart §3).
- [ ] Each merged FieldResult tracks `sourceFace: 'front' | 'back' | 'neck'` (or 'multiple' for the warning) so the review UI can call out which face the read came from (FR-15).
- [ ] A front-only upload (no back face) does NOT false-flag the warning if it's clearly not on the supplied face — instead, the warning is `not_found` and the triage classifier handles routing (this is the correct behaviour: missing warning is a real mismatch).
- [ ] When the same field is read on multiple faces, the best (highest-confidence) read wins; ties are broken deterministically (e.g. front > back > neck).
- [ ] Per-face confidence is preserved in the trace so observability can still see what each face returned.
- [ ] Unit tests cover: single face, two faces (front+back) with the warning on the back, three faces (front+back+neck) with the brand on the neck, front-only with no warning.

### Implementation details

- Create `lib/matching/merge.ts` exporting `mergeFaces(perFaceResults: PerFaceResults): FieldResult[]`.
- The input is the per-face matching output from P1-3 (already passed through P1-4 for confidence). For each form field:
  - Collect the per-face verdicts.
  - If any face's verdict is `match`, the merged verdict is `match` with the highest-confidence face's read as the canonical extracted value, and `sourceFace` set to that face.
  - If no face has a match but at least one has a `mismatch` read, the merged verdict is `mismatch` with the highest-confidence mismatched face as the source.
  - If every face is `not_found`, the merged verdict is `not_found`.
  - If the only signal is `low_confidence`, the merged verdict is `low_confidence`.
- The government warning is the special case: it must be checked across all faces, in this order:
  - If any face has a confident verbatim-plus-caps pass, the warning passes (sourceFace = that face).
  - If any face has the warning with altered wording or wrong caps, it's a `mismatch` (sourceFace = that face — the agent's attention goes to the broken read).
  - If NO face has the warning, it's `not_found` (sourceFace = 'none' or null). This is a genuine mismatch — a missing warning is a real defect (flowchart §3).
  - Bold-uncertain on any face that otherwise passed → `low_confidence` (review lane) (D6).
- Set `sourceFace` carefully: it should point to the face the agent should look at to verify the read.

### Key constraints

1. A field found on ANY face satisfies the form (D12). Do not require every face to carry every field — front labels often lack the warning, that's normal.
2. The government warning is checked across all faces (D12, flowchart §3). A front-only upload with no warning is a genuine `not_found`, not a "we couldn't check it".
3. Track `sourceFace` per merged field so the review UI can point at the right image (FR-15).
4. TypeScript strict mode, no any.
5. The Application is the unit (D13). The merge produces application-level FieldResults, ready for the triage classifier (P1-5).

### Files to modify

- `lib/matching/match.ts` (at start — paste real content from P1-3 + P1-4) — wire so the orchestrator returns per-face results, ready to be merged.
- `types/domain.ts` (at start — paste real content from prior tickets) — extend the FieldResult with `sourceFace`.

### Files to create

1. `lib/matching/merge.ts` — the `mergeFaces` function.
2. `lib/matching/__tests__/merge.test.ts` — unit tests for the multi-face cases.

### Config / schema / store updates

- None.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Unit tests:
- [ ] Single face (front only) with no warning → warning verdict is `not_found`, the rest of the fields are read from front.
- [ ] Two faces: brand and ABV on front, warning on back → all fields satisfied, warning's sourceFace is 'back'.
- [ ] Three faces: brand on neck, ABV on front, warning on back → each field's sourceFace is correctly tagged.
- [ ] Front-only upload where the warning happens to be on the front → warning passes with sourceFace='front'.
- [ ] Warning altered wording on the back face (no other face has the warning) → mismatch with sourceFace='back'.
- [ ] Same field on multiple faces with different confidence → the highest-confidence read wins.

Manual:
- [ ] Load a two-face sample fixture (front + back) and confirm the merged result names the right face for each field.

Eval: full assertions in P1-10.

Update docs: mark P1-6 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D12 (multi-face), D13 (unit of verification), D14 (single call per app), Decision Logic.
- @flowchart.md — section 3 (warning sub-check), section 6 (Cross-Cutting Rules: Multi-face).
- @requirements.md — FR-1, FR-15.
- @CONTEXT.md — Application, Label face.

### Common gotchas

1. A field is satisfied if found on ANY face — do not require every face to carry every field. A front label usually has the brand and ABV but not the warning; that's correct, not a defect (D12).
2. The warning is checked across ALL faces, but a missing warning on every face IS a real mismatch — front-only uploads that genuinely lack the warning correctly fail (D12; flowchart §3).
3. `sourceFace` matters for the review UI in P1-8 — the agent needs to know which face to look at when a field flags (FR-15). Set it to the highest-confidence read for match cases, and to the broken read for mismatch cases.
4. For the merge tie-breaker on `match`, prefer the higher confidence; for ties of equal confidence, pick a deterministic order (front > back > neck) so test results are stable.

### Definition of Done

Code complete when:
- [ ] `mergeFaces` produces application-level FieldResults from per-face inputs.
- [ ] The warning rule "satisfied if on any face, missing if on every face" is exercised by unit tests.
- [ ] Each merged FieldResult carries `sourceFace`.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/multiface, pushed, merged to main.

### Expected output

The pipeline now goes: input → extraction (one call, all faces) → matching (per face per field) → confidence → merge (per face per field → per field) → triage. The result is a single Lane plus a list of application-level FieldResults, each tagged with the face it came from.

### Dependencies to install

```
(none — pure code over existing types)
```

---

## Outcome — done 2026-06-15

**Branch:** `feat/multiface`
**Status:** Done — 94 tests pass (82 prior + 12 new), lint + build clean.

**What landed:**
- `lib/matching/merge.ts` — `mergeFaces(perFaceResults): FieldResult[]`. Groups by field, picks best per priority tiers `match > mismatch > low_confidence > not_found`; within tier highest confidence wins; on equal confidence deterministic `front > back > neck`.
- `lib/matching/match.ts` — orchestrator refactored. `readingsFor` replaces `findExtracted` (first-face-wins). Per-face matcher calls produce per-face `FieldResult`s; `mergeFaces` collapses to one per field. The warning bypasses the generic merge — `matchWarning` already does cross-face by construction (D12).
- `lib/matching/__tests__/merge.test.ts` — 12 tests: 6 direct unit tests on `mergeFaces` priority order + tie-breaks, 6 integration tests through `matchApplication` covering single-face, front+back, front+back+neck, front-only-with-warning, altered-warning-on-back, equal-confidence tie-break.

**Deviation:** ticket text described "warning verdict is `not_found`" for a front-only no-warning upload; the actual (preserved) behaviour is `verdict: "mismatch"` with reason "not present". This matches the existing AC-4 tests in `classify.test.ts` and `match.test.ts` and aligns with the agency's risk posture — a missing warning is a real, regulatory-grade defect, not an "I couldn't check it" case. The ticket's own parenthetical agrees; the verdict-name slip is the inconsistency.

### Why

P1-6 is the layer that makes the **Application** — not a single face — the unit of verification (D13). Real labels distribute information across faces by design: the front carries the brand identity, the back carries the regulated text (warning, address, lot codes), the neck (when present) often repeats the brand or the bottle number. Treating each face independently and then unioning gives the right semantics — a field is satisfied if **any** face carries it — without forcing every face to carry every field, which would false-flag normal labels as defective (D12).

The merge priority order — match > mismatch > low_confidence > not_found — is intentionally NOT "majority wins" or "average". Majority would hide a defect on a single face behind two clean faces. Averaging would smear strong and weak signals together. The priority order picks the **most informative** read available: a clean match is the strongest possible signal; a confident mismatch is a real defect; low_confidence routes to review; not_found is the absence of signal and only wins when nothing else is available. This is the same conservative posture as the P1-5 triage classifier — merge and classifier reinforce each other.

The **highest-confidence-within-tier** tie-break makes the multi-face merge picky in the right direction: when the same field shows up on multiple faces, we keep the cleaner read. The confidence number is the code-derived signal from P1-4 — for fuzzy fields it's the similarity margin, for exact fields it's binary 1.0. A face with a slightly off transcription loses to a face with a clean one, and that propagates into the public result so the review UI in P1-8 points the agent at the face that's actually worth looking at (FR-15). Without this, "first-face-wins" would arbitrarily lock in whichever face happens to be uploaded first.

The **deterministic face-order tie-break (front > back > neck)** sounds cosmetic but it's load-bearing for two reasons. Test fixtures: equal-confidence cases would be flaky if the merge picked whichever face it encountered first in iteration order — the fixed rule means `pnpm test` is reproducible byte-for-byte. Review UX: when two faces both pass cleanly, the agent usually wants to look at the front first — it carries the brand identity and is the canonical "what does this product call itself" face. Routing the merged `sourceFace` to front in ties matches the agent's mental model.

The **warning bypasses `mergeFaces`** because `matchWarning` already does cross-face logic by construction: it walks all faces looking for presence, picks the one with the warning text, then runs the strict verbatim + caps + bold checks against that face. Routing the warning back through the generic merge would either double-count or, worse, produce per-face per-face warning FieldResults that don't make sense ("warning not found on the front face" as a separate signal from "warning found on the back face"). The cleaner design is: warning has its own merge; everything else uses the generic one.

A **front-only upload with no warning** correctly produces `government_warning: mismatch` reason "not present", and the triage classifier routes it to the mismatch lane. A future "I uploaded the wrong face" UX (P1-9's degraded-extraction path is the closest analogue) could add a "warning not checked" disposition, but that's a different feature — for now the right behaviour is to surface the absence of the warning as a real defect because the system can't distinguish "user forgot to upload the back" from "the bottle ships without a back warning". The agency's risk posture says: **flag it, let a human disambiguate**.
