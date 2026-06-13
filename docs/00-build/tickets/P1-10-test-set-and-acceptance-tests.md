# P1-10 — Test set and acceptance tests

Assemble the golden set (green pairs from the Public COLA Registry plus synthesized red defects), wire it through the Vitest harness, and assert AC-1 through AC-8 automatically. AC-9 (color + icon + text) is asserted by an automated a11y check (axe-core / jest-axe) plus a manual screen-reader pass. AC-10 (no PII to disk) is asserted by static analysis / code review against the no-write-to-storage rule, not by the runtime golden set.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @TICKETS.md, and @observability.md.

I'm working on TICKET-P1-10: Test set and acceptance tests.

Current state: (at start)
- [list with checks: full verification pipeline reachable through /api/verify; review UI; timeout/degrade; fixtures from P1-1]

What's NOT done yet:
- [list with crosses: latency bench (P1-11)]

TICKET-P1-10 Goal:
Make the acceptance criteria executable. Assemble the golden set (green pairs from the Public COLA Registry plus synthesized red defects per assumptions A24 to A26) and assert AC-1 through AC-8 against it via the Vitest harness. AC-9 is asserted by jest-axe and a manual screen-reader pass. AC-10 is verified by static code review against the no-write-to-storage rule, not by the runtime harness. Also include false-negative probes: planted real-mismatch fixtures the tool MUST NOT clear into the match lane (observability.md).

Check the existing fixtures from P1-1, the API contract from P1-7, and the AC list in @requirements.md before starting.
Follow the architecture and decisions in @systemsdesign.md and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-10 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 3h
- Dependencies: P1-3 (matching engine), P1-5 (triage classifier), and transitively P1-2 through P1-9
- Branch: feat/acceptance-tests

### Acceptance criteria

- [ ] A golden set is assembled under `tests/golden/` covering: green pairs from the Public COLA Registry, synthesized red defects (warning title-case, missing warning, ABV mismatch, brand fuzz, unreadable image), and planted false-negative probes (real mismatches dressed to look benign) (A24, A25, A26; observability Golden set).
- [ ] AC-1 — a green pair returns match lane with no field flagged (test asserts this on at least one registry pair).
- [ ] AC-2 — an ABV mismatch returns mismatch lane with alcohol content identified.
- [ ] AC-3 — "Government Warning:" in title case returns mismatch (caps strict).
- [ ] AC-4 — missing warning returns mismatch.
- [ ] AC-5 — "STONE'S THROW" vs "Stone's Throw" returns match (fuzzy tolerance).
- [ ] AC-6 — blank / unreadable / non-label image returns review lane with the "Return — unreadable image" recommendation, not an error.
- [ ] AC-7 — single-application verification on representative inputs completes within the 5s budget (asserted in P1-11; this ticket can include a smoke timing check).
- [ ] AC-8 — a batch of ~300 applications is NOT in scope for Phase 1 — defer to P3-1 (note the test as skipped with a reference in the harness).
- [ ] AC-9 — color + icon + text asserted by jest-axe on the review UI (P1-8) plus a manual screen-reader pass logged here.
- [ ] AC-10 — verified by code review (no fs.write, no localStorage, no database client imports anywhere in the verification path) — record the inspection result in a CHECKS.md or similar artifact, NOT by golden-set runtime assertion.
- [ ] False-negative probes: assert that planted real mismatches do NOT land in the match lane (the safety metric from observability.md).

### Implementation details

- Create `tests/golden/index.ts` exporting the fixture set: each entry is `{ id, application, expectedLane, expectedFlaggedFields?, notes }`.
- Group fixtures by category: `green-pairs/`, `warning-defects/`, `field-mismatches/`, `fuzzy-passes/`, `unreadable-images/`, `false-negative-probes/`.
- Use the registry images already in `fixtures/images/` (from P1-1). Add or synthesize the red cases — for the warning-title-case case, modify a known-good warning by lower-casing the heading; for the missing-warning case, crop or remove the warning region.
- Write `tests/acceptance.test.ts` that loads the golden set and runs each fixture through the verification pipeline (preferably calling the lib modules directly, not the HTTP endpoint, for deterministic speed). Assert lane and flagged fields against the expected.
- Use the mock adapter (no API key required) but ALSO ship a second mode that runs against the live adapter when `ANTHROPIC_API_KEY` is set — gated by an env flag so CI runs offline by default.
- For AC-7: include a quick timing check (extract → match → triage). The full p95 bench is P1-11.
- For AC-8: write a skipped test with a `// TODO: batch lands in P3-1` comment.
- For AC-9: a separate `tests/a11y.test.tsx` runs jest-axe against the rendered review UI for at least three states (match, mismatch, review-unreadable). Document the manual screen-reader pass in a `tests/MANUAL-CHECKS.md`.
- For AC-10: write `tests/static/no-pii-to-disk.test.ts` that grep-scans `app/`, `lib/`, and `middleware.ts` for `fs.write`, `writeFile`, `localStorage`, `indexedDB`, and known DB-client imports, and fails if any are present in the verification path. This is the static check; record the human review in `tests/MANUAL-CHECKS.md`.
- For false-negative probes: add at least three fixtures where the surface looks clean but a key field (warning wording, ABV, brand) is wrong. Assert the lane is NEVER `match`. This is the headline safety metric per observability.md.

### Key constraints

1. AC-1 through AC-8 are golden-set assertions — automated, deterministic, run in CI.
2. AC-9 is BOTH an automated a11y check (axe-core / jest-axe) AND a manual screen-reader pass. Document both.
3. AC-10 is NOT a runtime golden-set assertion — it's verified by static analysis / code review of the no-write-to-storage rule (per the brief: "by static analysis / code review against the no-write-to-storage rule, not via the runtime golden set").
4. False-negative rate is the headline safety metric (observability.md). Plant probes and assert they never land in match.
5. The mock adapter must produce deterministic outputs for the golden set so tests are reliable.
6. p95 under 5s (NFR-1, AC-7) — smoke check here, formal bench in P1-11.
7. TypeScript strict mode, no any.

### Files to modify

- `tests/` (at start — paste real content from P0-7 if any) — the harness scaffold from Phase 0.
- `fixtures/samples.ts` and `fixtures/images/` (at start — paste real content from P1-1) — extend with the new red cases and false-negative probes.
- `lib/provider/mock.ts` (at start — paste real content from P0-3 / P1-2) — extend the canned responses to cover every golden-set fixture deterministically.

### Files to create

1. `tests/golden/index.ts` — the golden set: typed fixture entries with expected lane and expected flagged fields.
2. `tests/golden/green-pairs/`, `tests/golden/warning-defects/`, `tests/golden/field-mismatches/`, `tests/golden/fuzzy-passes/`, `tests/golden/unreadable-images/`, `tests/golden/false-negative-probes/` — the per-category fixtures.
3. `tests/acceptance.test.ts` — the AC-1 to AC-7 + false-negative assertions.
4. `tests/a11y.test.tsx` — jest-axe across the three lane states (AC-9 automated).
5. `tests/static/no-pii-to-disk.test.ts` — the static-analysis check for AC-10.
6. `tests/MANUAL-CHECKS.md` — the manual screen-reader pass log and the AC-10 code-review record.

### Config / schema / store updates

- None. The tests read from existing config and fixtures.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Eval: this IS the eval harness. Running `pnpm test` runs the golden set and asserts AC-1 to AC-7. The false-negative probes assert the lane is never `match` on planted mismatches.

Manual:
- [ ] Screen-reader pass (VoiceOver / NVDA) on the review UI in each of the three lane states. Record in `tests/MANUAL-CHECKS.md` (AC-9 manual).
- [ ] Code review of `app/`, `lib/`, and `middleware.ts` confirming no writes to disk, no localStorage, no DB clients in the verification path. Record in `tests/MANUAL-CHECKS.md` (AC-10).

Update docs: mark P1-10 done in TICKETS.md; add a DEV-LOG entry. Note the AC-8 batch test is deferred to P3-1.

### Reference

- @requirements.md — AC-1 through AC-10; FR-13 to FR-16.
- @observability.md — Offline evaluation (the golden set), the agent-correction feedback loop, false-negative rate as the primary safety metric.
- @systemsdesign.md — Decision Logic.
- assumptions: A24, A25, A26 (golden-set composition).
- @CONTEXT.md — Lane, Verdict.

### Common gotchas

1. AC-1 through AC-8 are assertable by the golden set. AC-9 needs an automated a11y check PLUS a manual screen-reader pass. AC-10 is verified by static analysis / code review against the no-write-to-storage rule, NOT by the runtime harness — do not try to assert "no PII to disk" by running the verification flow.
2. AC-8 (a ~300 batch) is Phase 3 (P3-1). Leave it as a skipped test with a TODO, do not implement batch in Phase 1.
3. False-negative probes are the headline safety metric (observability.md). At minimum three planted-mismatch fixtures must assert lane !== 'match'.
4. The mock adapter must return deterministic responses for every golden-set fixture. If it returns randomized or model-dependent output, the harness drifts and the AC assertions get flaky.

### Definition of Done

Code complete when:
- [ ] Golden set assembled with green pairs, red defects, unreadable images, and false-negative probes.
- [ ] `tests/acceptance.test.ts` asserts AC-1 through AC-7 deterministically against the mock adapter.
- [ ] `tests/a11y.test.tsx` runs jest-axe with zero violations against the three lane states.
- [ ] `tests/static/no-pii-to-disk.test.ts` greps the verification path and fails on any disk-write call.
- [ ] False-negative probes assert lane !== 'match'.
- [ ] `tests/MANUAL-CHECKS.md` records the screen-reader pass and the AC-10 code review.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass with the golden set green.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/acceptance-tests, pushed, merged to main.

### Expected output

`pnpm test` now runs the Phase 1 acceptance criteria. A regression on any of AC-1 to AC-7 fails the build; an a11y regression on the review UI fails the build; a code-level introduction of a disk write or DB client in the verification path fails the build. The golden set is the seed for the Phase 5 eval harness (P5-2).

### Dependencies to install

```
pnpm add -D jest-axe @testing-library/react @testing-library/jest-dom
```

(@testing-library/jest-dom may already be present from P1-8; install if not.)
