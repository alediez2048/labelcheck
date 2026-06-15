# P1-5 — Triage classifier

Roll per-field verdicts and code-derived confidences into exactly one lane (high-confidence match, clear mismatch, or low-confidence / ambiguous), using the priority order from the Decision Logic section — warning failures and confident mismatches always surface as the mismatch lane and are never hidden behind an otherwise-clean result.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-5: Triage classifier.

Current state: (at start)
- [list with checks: extraction service, matching engine, confidence derivation (per-field FieldResult with verdict + confidence)]

What's NOT done yet:
- [list with crosses: multi-face merge, result API, review UI, timeout/degrade, acceptance tests, latency bench]

TICKET-P1-5 Goal:
Operationalize the three-lane review model. Take the list of per-field results (each with a verdict and a code-derived confidence) and emit a single Lane for the whole application, with the priority order spelled out: any confident mismatch OR any warning failure → mismatch lane; otherwise any not-found, low-confidence, or near-miss → review lane; otherwise (every field a confident match) → match lane. The logic is explicit, inspectable, and unit-tested — not emergent.

Check the FieldResult shape from P1-4 and the Decision Logic section of @systemsdesign.md before starting.
Follow the architecture and decisions in @systemsdesign.md (Decision Logic, D11 review-model default) and the rules in @CONTEXT.md (Lane, Verdict).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-5 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 2h
- Dependencies: P1-3 (matching engine), P1-4 (confidence)
- Branch: feat/triage

### Acceptance criteria

- [ ] Three lanes implemented: match, mismatch, review (CONTEXT.md: Lane; FR-13).
- [ ] Priority order enforced: a confident mismatch OR a warning failure → mismatch lane (systemsdesign Decision Logic).
- [ ] Otherwise, a not_found, low_confidence, or near-miss field → review lane.
- [ ] Otherwise (every field a confident match) → match lane.
- [ ] The threshold that separates "confident" from "uncertain" comes from `config/tolerances.json` (FR-25).
- [ ] Unreadable image → review lane with the explicit recommendation surfaced downstream in P1-7/P1-8 (FR-16, FR-26b).
- [ ] An overall confidence score for the application is included alongside the lane (FR-14).
- [ ] Unit tests cover: AC-1 (clean → match), AC-2 (ABV mismatch → mismatch), AC-3 (warning caps fail → mismatch), AC-4 (missing warning → mismatch), AC-6 (unreadable → review).

### Implementation details

- Create `lib/triage/classify.ts` exporting `classify(fieldResults: FieldResult[], context): TriageResult`.
- The TriageResult contains: `{ lane: 'match' | 'mismatch' | 'review', overallConfidence: number, reasons: string[] }`.
- Implement the priority order explicitly, in this order — do not collapse the branches:
  1. If any field's verdict is `mismatch` AND its confidence >= `confidentThreshold`, return mismatch.
  2. If the government warning's verdict is `mismatch` at any confidence, return mismatch (warning failures always surface here — they are the highest-stakes check).
  3. If the context flags an unreadable image (extraction failed for one or more faces), return review with a "needs a better image" reason (FR-16, FR-26b).
  4. If any field's verdict is `not_found` OR `low_confidence`, OR any field's confidence is below `confidentThreshold` even when matching, return review.
  5. Otherwise, return match.
- Overall confidence: the minimum field confidence (so a single low-confidence field drags the application). Alternative: the average — pick minimum for the conservative posture (D11, constraints Review Model).
- The reasons array carries short, agent-readable strings for each field that triggered the lane (e.g. "Brand near-miss: 'Stone's Throw' vs 'Stonse Throw'", "Government warning missing", "Front face unreadable").
- Pull the configurable threshold from `config/tolerances.json` — do not hard-code the split.

### Key constraints

1. Priority order is rigid: a real problem is NEVER hidden behind an otherwise-clean result (Decision Logic). A confident mismatch or a warning failure always surfaces as mismatch.
2. Warning failures override everything — they are the highest-stakes check (D6, flowchart §3).
3. Conservative default posture: when in doubt, route to review, not match (D11; constraints: Review Model).
4. Confidence is code-derived, not from the model (D5) — already guaranteed by P1-4, but the triage classifier reinforces it by reading `FieldResult.confidence`, not any model-reported number.
5. TypeScript strict mode, no any.
6. Rules in config (FR-25). The confident threshold lives in `config/tolerances.json`.

### Files to modify

- `lib/matching/match.ts` (at start — paste real content from P1-3 + P1-4) — confirm it returns the FieldResult shape that classify consumes; otherwise extend.
- `config/tolerances.json` (at start — paste real content from prior tickets) — confirm `confidentThreshold` is present.
- `types/domain.ts` (at start — paste real content from prior tickets) — extend with the TriageResult and Lane types if not already there.

### Files to create

1. `lib/triage/classify.ts` — the `classify` function plus the priority-order implementation.
2. `lib/triage/__tests__/classify.test.ts` — unit tests for AC-1 to AC-6 against constructed FieldResult fixtures.

### Config / schema / store updates

- `config/tolerances.json` — `confidentThreshold` (numeric, e.g. 0.7) used to split confident from uncertain.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Unit tests:
- [ ] AC-1: every field a confident match → match lane.
- [ ] AC-2: ABV mismatch with high confidence → mismatch lane, with "alcohol content" in the reasons.
- [ ] AC-3: warning caps fail (verdict=mismatch) → mismatch lane (even if no other field flagged).
- [ ] AC-4: warning missing (verdict=not_found on the warning field, but on warning field specifically) → mismatch lane.
- [ ] AC-6: unreadable image context → review lane with "needs a better image" reason.
- [ ] Near-miss (verdict=match but confidence<threshold) → review lane (validates D5 + Decision Logic).
- [ ] Bold-uncertain warning (verdict=low_confidence) → review lane.

Eval: run the partial golden-set fixtures from P1-1 through the full pipeline; assert AC-1 to AC-6 manually here. Full automation lands in P1-10.

Update docs: mark P1-5 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — Decision Logic: How Verdicts Become a Lane, D5, D6, D11.
- @flowchart.md — section 2 (verification and triage logic).
- @requirements.md — FR-13, FR-14, FR-15, FR-16; AC-1 to AC-6.
- @CONTEXT.md — Lane, Verdict, Disposition.

### Common gotchas

1. The priority order is NOT negotiable. Warning failures and confident mismatches always surface as mismatch lane — they are never hidden behind an otherwise-clean result. This is the agency's risk posture in code (Decision Logic).
2. A confident MISMATCH goes to the mismatch lane, not the review lane — even with one bad field surrounded by good ones. The agent's attention goes straight to the problem (FR-15).
3. A near-miss (verdict=match but confidence below threshold) routes to review, not match. This validates D5: a model that confidently misreads a fuzzy field is caught by the code-derived confidence.
4. Unreadable image is a context input, not a field verdict. Wire it through `context.unreadableFaces` (or similar) so the classifier returns review with the explicit "needs a better image" reason (FR-16, FR-26b). The downstream "Return — unreadable image" recommendation belongs to the result API in P1-7.

### Definition of Done

Code complete when:
- [ ] `classify(fieldResults, context)` returns a typed TriageResult with lane, overallConfidence, and reasons.
- [ ] All five branches of the priority order are reachable from unit tests.
- [ ] AC-1 to AC-6 pass at this layer (modulo the not-yet-wired result API and review UI).
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/triage, pushed, merged to main.

### Expected output

The classifier turns a list of FieldResults into one Lane plus an overall confidence and a list of human-readable reasons. The pipeline now goes: input → extraction → matching → confidence → triage. The result is structured and ready for the API layer (P1-7) once the multi-face merge (P1-6) is in.

### Dependencies to install

```
(none — pure code over existing types)
```

### Why

P1-5 operationalises the **review model**. The priority order is the single most important design decision in the whole verifier — anything that "tidies" it (one big switch, a scoring function, a "weighted lane" computation) silently breaks the agency's risk posture, because a clean-looking aggregate can hide a single bad field. The implementation refuses every consolidation temptation: five branches, in order, each explicit, none collapsing into a math expression. A future maintainer staring at this will think "this could be simpler" — and the answer is "yes, but at the cost of the agency's risk posture, which is the whole product."

The **warning surfaces at any confidence** (branch 2, not just branch 1). That's intentional. The warning is the highest-stakes check (FR-11, FR-12) and the matching engine already does the strict work — a warning mismatch verdict is by construction a real, regulatory-grade flag. Routing it to the review lane on a low confidence number would mean the system saw a regulatory failure and then said "I'm not sure, you decide" — which is exactly what we don't want for the highest-stakes field. The confidence number is a tool for handling fuzzy fields and image-quality drag; for warnings, the verdict alone is authoritative.

**Overall confidence = minimum field confidence** (D11 conservative posture). The alternative — averaging — was rejected explicitly: one weak signal averaged with three strong ones produces a confident-looking aggregate that hides exactly the case the review model exists to catch. Minimum makes the weakest link visible. The cost is that one near-miss on a peripheral field (like fanciful_name) drags the application overall — which is fine, because that's also the case where we'd want the agent to look. The function returns `1` for an empty result list (treated as "no signal to drag"), but callers handle the empty case before reaching here in practice.

The **near-miss mismatch** case (branch 4: `verdict=mismatch AND confidence<threshold`) is the subtle one. A fuzzy field that comes in just below its similarity threshold reads as `mismatch` from the matching engine, but the confidence is near 0.5. Routing it to the **mismatch lane** would mean asserting we're confident in the mismatch when we're not. Routing it to the **review lane** is the right call — the agent looks, decides whether it's a real mismatch or a typo. This is the case where the review model's "when in doubt, escalate" stance materialises in code.

**Dependency injection of the threshold** (`confidentThreshold` is an optional input that defaults to the config value) follows the same pattern as P1-3 / P1-4. Tests pass a fixed value; production reads from `config/tolerances.json`. The configurable threshold is what makes the future P5-2 calibration possible — the eval harness can sweep the threshold across the golden set and find the value that balances false-negative rate (the headline safety metric) against false-positive review-lane volume (the headline cost metric). Hardcoding the threshold would mean recompile-and-redeploy for every tuning experiment.

The **unreadable-image context** is wired as a separate input rather than overloaded into the field-results array. The matching engine doesn't know which faces failed extraction — that's information the upstream extraction service (P1-2) and the route handler (P1-7) carry. Passing it as `context.unreadableFaces` keeps the classifier's input model clean and surfaces the FR-26b "needs a better image" recommendation as a distinct reason string. The route handler in P1-7 will turn the unreadable signal into the explicit FR-26b `recommendation` field on the public VerificationResult.

The **reasons array preserves the warning failure first** in mismatch lane outputs. That ordering is what surfaces "Warning missing" above "ABV mismatch" in the agent's UI later. Sorting by field type rather than insertion order would lose the priority signal at exactly the point a stakeholder might overlook it.
