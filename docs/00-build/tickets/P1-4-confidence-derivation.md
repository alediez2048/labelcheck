# P1-4 — Confidence derivation

Compute confidence per field in code from the match margin and the model's per-region legibility flag — never the model's self-reported overall confidence. A near-miss lands low-confidence regardless of what the model claims.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-4: Confidence derivation.

Current state: (at start)
- [list with checks: extraction service, matching engine producing per-field verdict + margin + reason, config store]

What's NOT done yet:
- [list with crosses: triage classifier, multi-face merge, result API, review UI, timeout/degrade, acceptance tests, latency bench]

TICKET-P1-4 Goal:
Sit between the matching engine and the triage classifier and emit a numeric, code-derived confidence per field. The inputs are the match margin (string-distance distance-from-threshold for fuzzy fields, or a binary signal for exact-match fields) and the per-region legibility flag from the model. The model's overall self-reported confidence is logged but NEVER drives the confidence used by triage (D5). A near-miss returns a low-confidence result even if the model claimed high confidence.

Check the matching engine output and the extraction response shape before starting. Don't touch the matching rules — this layer derives a scalar.
Follow the architecture and decisions in @systemsdesign.md (D5 confidence in code) and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-4 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 2h
- Dependencies: P1-3 (matching engine)
- Branch: feat/confidence

### Acceptance criteria

- [ ] Confidence is computed per field in code from the match margin plus the model's per-region legibility flag (D5, FR-5).
- [ ] The model's self-reported overall confidence is never used as the input to triage. If captured, it is logged only (D5).
- [ ] A near-miss (a fuzzy field that just passed the threshold) produces a low-confidence value, regardless of what the model claimed.
- [ ] An exact-match pass on a field returns high confidence; an exact mismatch returns high confidence in the mismatch (so triage routes it to the mismatch lane, not the review lane).
- [ ] An unreadable region (legibility=low from the model) drags the field's confidence down, even if the rule technically passed.
- [ ] The threshold that splits "confident" from "uncertain" lives in `config/tolerances.json` (FR-25).
- [ ] Unit tests cover the near-miss case explicitly (validates D5).

### Implementation details

- Create `lib/matching/confidence.ts` exporting `deriveConfidence(fieldVerdict, legibilitySignal): number` plus helpers.
- The formula is intentionally simple and inspectable: for fuzzy fields, normalize the match margin to [0, 1] using the configured threshold as the pivot; for exact-match fields, base confidence is 1 for clear pass/fail and 0.5 for not_found; then multiply by a legibility factor (1.0 for legible, 0.5 for legible_but_marginal, ~0.2 for low_legibility).
- The exact constants live in `config/tolerances.json` so they can be tuned without a code change.
- Apply this to every field verdict produced by P1-3 before they hand off to the triage classifier (P1-5).
- For the government warning, the bold-uncertain case from P1-3 already returned low_confidence; this layer turns that into a numeric value below the "confident" threshold so triage routes correctly.
- Keep the model's self-reported confidence in the trace logs (per observability.md "What We Instrument") but do NOT pass it into `deriveConfidence`. The contract is one-way: model signals in, code scalar out.

### Key constraints

1. Confidence is code-derived, never taken from the model's overall self-reported number (D5). This is one of the "decisions that look wrong but are deliberate" — a future maintainer may try to "simplify" by using the model's number; do not (D5; Decisions That Look Wrong But Are Deliberate).
2. The "confident" vs "uncertain" threshold lives in `config/tolerances.json` (FR-25).
3. The model's per-region legibility flag IS valid input — it is a signal, not a verdict. Bold-uncertain (from P1-3) is also valid input.
4. TypeScript strict mode, no any.
5. The function is pure: same inputs always produce the same output. This makes confidence calibration measurable in P5-2.

### Files to modify

- `lib/matching/match.ts` (at start — paste real content from P1-3) — extend the per-field result to carry the derived confidence scalar.
- `config/tolerances.json` (at start — paste real content from P0-4 / P1-3) — add the legibility-factor constants and the confidence-threshold split.
- `types/domain.ts` (at start — paste real content from prior tickets) — extend the FieldVerdict (or wrap in a new FieldResult) to include `confidence: number`.

### Files to create

1. `lib/matching/confidence.ts` — the pure `deriveConfidence` function plus helpers.
2. `lib/matching/__tests__/confidence.test.ts` — unit tests for the near-miss case, the legibility-drag case, and the exact-match cases.

### Config / schema / store updates

- `config/tolerances.json` — add `legibilityFactors` (legible / marginal / low) and `confidentThreshold` (a single number, e.g. 0.7).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Unit tests:
- [ ] A fuzzy field that just barely passes the distance threshold returns a confidence below `confidentThreshold` (the near-miss case — validates D5).
- [ ] A fuzzy field that comfortably passes returns a confidence well above `confidentThreshold`.
- [ ] An exact mismatch returns high confidence in the mismatch (so triage sends it to the mismatch lane, not review).
- [ ] An exact pass on a legible region returns high confidence.
- [ ] An exact pass on a `low_legibility` region drops below `confidentThreshold`.
- [ ] The model's self-reported overall confidence, if passed in, has zero effect on the output.

Manual:
- [ ] Run a sample where the brand is "Stone's Throw" vs label "Stonse Throw" (a single-character flip) — confirm the near-miss lands below the confident threshold.

Eval: run the partial golden set; assert that near-miss fixtures land in the review lane downstream (after P1-5). Full AC assertions land in P1-10.

Update docs: mark P1-4 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D5 (confidence source), Decisions That Look Wrong But Are Deliberate (the "model self-reported confidence is poorly calibrated" warning), Decision Logic.
- @requirements.md — FR-5; AC-1, AC-6.
- @observability.md — Confidence calibration (this is the metric that validates this ticket later in P5-2).

### Common gotchas

1. Confidence is code-derived from match margin plus the model legibility flag — NEVER the model's self-reported number (D5). The model's confidence is poorly calibrated; using it is exactly how a confident misread auto-clears. This is the most-likely-to-be-"fixed"-incorrectly decision in the system.
2. A near-miss on a fuzzy field MUST land below the confident threshold. This is what protects against the false-negative scenario in observability.md.
3. The "confident" vs "uncertain" threshold is config, not code (FR-25). A compliance reviewer can tune it without a code change.
4. Keep `deriveConfidence` a pure function — no I/O, no clock. P5-2's calibration curve will replay this against historical extractions.

### Definition of Done

Code complete when:
- [ ] Every per-field verdict from the matching engine carries a numeric, code-derived confidence.
- [ ] The near-miss case lands below the confident threshold in unit tests.
- [ ] The model's self-reported overall confidence is logged but not used to drive triage.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/confidence, pushed, merged to main.

### Expected output

After this ticket, each FieldResult carries `{ verdict, reason, margin, confidence }`. The confidence is a deterministic function of the match margin and the model's legibility signal, derived in code, ready for the triage classifier in P1-5 to compare against the configured threshold.

### Dependencies to install

```
(none — uses existing config and matching libs)
```
