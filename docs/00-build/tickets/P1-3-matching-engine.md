# P1-3 — Matching engine

Build the per-field matching engine: brand and class/type fuzzy with case and punctuation tolerance, ABV stated-equals-stated, net contents unit-normalized exact, producer fuzzy, country of origin exact, and the government warning exact (presence + verbatim + ALL-CAPS strict, bold best-effort). All thresholds and the canonical warning text come from configuration; the model never decides a match.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-3: Matching engine.

Current state: (at start)
- [list with checks the Phase 0 + P1-1 + P1-2 output: provider adapter, config store with warning.json and tolerances.json, image preprocess, the validated Application input, and the extraction service returning per-face transcribed text plus warning flags]

What's NOT done yet:
- [list with crosses: confidence derivation, triage classifier, multi-face merge, result API, review UI, timeout/degrade, acceptance tests, latency bench]

TICKET-P1-3 Goal:
Build the correctness core. For every field on every face produce a per-field verdict (match, mismatch, not_found, low_confidence) using the right rule for that field — fuzzy for brand and class/type, normalized-exact for ABV and net contents, fuzzy for producer, exact for country of origin, and the government warning checked strictly for presence + verbatim text + ALL-CAPS heading with bold flagged best-effort. Thresholds and canonical text come from config (FR-25). The model has produced the transcription; the code makes every decision (D4).

Check config/warning.json, config/tolerances.json, and the extraction service contract before starting. Don't touch the provider adapter or extraction service.
Follow the architecture and decisions in @systemsdesign.md (D4 code decides, D6 bold best-effort) and the rules in @CONTEXT.md (Verdict, Government Warning).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-3 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 4h
- Dependencies: P0-4 (config store), P1-2 (extraction service)
- Branch: feat/matching

### Acceptance criteria

- [ ] Brand name and class/type match using a fuzzy comparison that tolerates case, punctuation, and spacing differences ("STONE'S THROW" equals "Stone's Throw") and flags genuine differences (FR-8, AC-5).
- [ ] Alcohol content matches as stated-equals-stated (normalized for "%", "ABV", etc.) — TTB tolerance tables explicitly NOT implemented for the prototype (FR-9, A19).
- [ ] Net contents normalizes units and formatting before comparison ("750 mL" equals "750ML") (FR-10).
- [ ] Bottler/producer matches fuzzy, tolerating address formatting variation (FR-7, flowchart §4).
- [ ] Country of origin matches exact, only checked when required by beverage type (flowchart §4).
- [ ] Government warning is verified strictly: presence on at least one face, verbatim wording vs canonical config text, and "GOVERNMENT WARNING:" rendered in ALL CAPS. Bold is checked best-effort: if not confidently bold, mark the warning as low_confidence so triage can route it for human review (FR-11, FR-12, D6, flowchart §3).
- [ ] All thresholds and the canonical warning text are read from config/tolerances.json and config/warning.json — never hard-coded (FR-25).
- [ ] Each field emits a typed Verdict (match | mismatch | not_found | low_confidence) plus a short reason string and the match margin used (so P1-4 can derive confidence).
- [ ] Per-field unit tests cover the green and red cases used by the acceptance tests in P1-10.

### Implementation details

- Create the matching folder under `lib/matching/` with one file per field kind, all dispatching from a `lib/matching/match.ts` orchestrator that walks the extraction result and the form against `config/fields-by-type.json`.
- For fuzzy fields (brand, class/type, producer) use a small string-distance library — `fastest-levenshtein` is the techstack choice. Normalize case, punctuation, and whitespace before measuring, then check the distance against the configured threshold.
- For ABV: normalize the extracted string (strip "%", "ABV", trim, parse as number) then compare exactly (FR-9). Document in code that real TTB tolerances are deferred (A19).
- For net contents: parse to (value, unit), normalize the unit (mL, ml, ML → ml; L → l; etc.), then exact-compare both value and unit.
- For country of origin: only check when the beverage type's field schema marks it required (e.g. imports). Exact compare with case folding.
- For the government warning: this is the heart of the matching engine.
  - Presence: check across all faces — found if any face's warning region carries text (D12).
  - Verbatim: load the canonical text from `config/warning.json`. Compare the extracted warning text strictly (whitespace-normalized, but otherwise byte-for-byte) (FR-11).
  - ALL-CAPS strict: confirm "GOVERNMENT WARNING:" appears in all capitals in the extracted text (FR-11, FR-12).
  - Bold: use the extraction service's `bold` flag. If `confidently_bold`, pass that sub-check. If `not_sure`, mark the overall warning verdict as low_confidence so triage sends it to the review lane (D6, flowchart §3). Never auto-pass or auto-fail on an uncertain bold read.
- Each per-field matcher returns: `{ verdict, reason, margin, sourceFace? }`. `margin` is the numeric distance-from-threshold (or 1.0 for exact-match passes, 0 for exact-match failures, etc.) — P1-4 will turn this into code-derived confidence.
- Multi-face merge is its own ticket (P1-6) — for now, this engine can take a single-face view; the merge wraps it.

### Key constraints

1. Model reads, code decides (D4, D5). The model has handed over transcribed text and structural flags. From here on, every match decision is code in this engine.
2. Bold is best-effort (D6). Uncertain bold flags the warning low-confidence — it must not auto-pass or auto-fail.
3. Rules in config (FR-25). All thresholds, the canonical warning text, and the per-beverage-type required-field list live in `config/`. Editing them does not require code changes.
4. p95 under 5s end-to-end (NFR-1). Matching is local computation in milliseconds; this is not a latency-critical path, but do not introduce heavy work (e.g. building a model in-memory per call).
5. TypeScript strict mode, no any.
6. WCAG AA awareness: the reason strings produced here surface in the per-field UI breakdown later. Write them so they read clearly as text (NFR-2, AC-9).
7. The Application is the unit (D13); the matcher works against the form and one-or-more faces, not a single label.

### Files to modify

- `config/warning.json` (at start — paste real content from P0-4) — confirm the canonical warning text is in place (A18). If still a placeholder, leave a TODO and proceed; the matching code reads it regardless.
- `config/tolerances.json` (at start — paste real content from P0-4) — confirm per-field thresholds exist for the fuzzy fields; add any missing keys.
- `config/fields-by-type.json` (at start — paste real content from P0-4) — consume to know which fields are required by beverage type.
- `types/domain.ts` (at start — paste real content from prior tickets) — extend with the FieldVerdict type if needed.

### Files to create

1. `lib/matching/match.ts` — the orchestrator that walks the extraction result and dispatches per field.
2. `lib/matching/brand.ts` — fuzzy match for brand name and class/type.
3. `lib/matching/abv.ts` — stated-equals-stated for alcohol content.
4. `lib/matching/netContents.ts` — unit normalization plus exact match.
5. `lib/matching/producer.ts` — fuzzy match for bottler/producer.
6. `lib/matching/origin.ts` — exact match for country of origin (conditional).
7. `lib/matching/warning.ts` — the government-warning rule (presence + verbatim + caps strict + bold best-effort).
8. `lib/matching/normalize.ts` — shared case/punctuation/whitespace normalizers.
9. `lib/matching/__tests__/*.test.ts` — unit tests per field, including the AC-3, AC-4, AC-5 cases.

### Config / schema / store updates

- `config/warning.json` — canonical warning text (FR-25, A18).
- `config/tolerances.json` — per-field fuzzy thresholds (e.g. brand_max_distance, producer_max_distance).
- `config/fields-by-type.json` — drives which fields are required (and therefore checked) per beverage type.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Unit tests:
- [ ] AC-5: brand fuzzy match — "STONE'S THROW" vs "Stone's Throw" → match.
- [ ] AC-3: warning with "Government Warning:" in title case → mismatch (caps strict).
- [ ] AC-4: missing warning on every face → mismatch (not_found).
- [ ] AC-2: ABV form 40% vs label 45% → mismatch.
- [ ] Verbatim drift: a single-word substitution in the warning → mismatch.
- [ ] Bold uncertain: warning text and caps both pass but bold flag is not_sure → warning verdict is low_confidence.
- [ ] Net contents "750 mL" vs "750ML" → match.

Manual:
- [ ] Run a sample with a known mismatch from P1-1's fixtures through the extraction service + matching engine; confirm the right field flags.

Eval: a partial dry run of the AC-1 to AC-5 assertions will be possible here; the full golden-set harness lands in P1-10.

Update docs: mark P1-3 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D4, D5, D6, Component Breakdown: Matching engine, Decision Logic.
- @techstack.md — Matching Logic (fastest-levenshtein), Configuration.
- @requirements.md — FR-7 to FR-12, FR-15, FR-25; AC-2 to AC-5.
- @flowchart.md — section 3 (warning sub-check), section 4 (per-field rules table).
- @CONTEXT.md — Verdict, Government Warning, Field.

### Common gotchas

1. The warning's caps rule is strict; the bold rule is best-effort. An unconfirmed bold downgrades the warning to low_confidence and routes to review — it does NOT auto-fail or auto-pass (D6).
2. ABV is stated-equals-stated for the prototype (FR-9, A19). Do not implement TTB's real tolerance tables; document the simplification in code.
3. Net contents needs unit normalization BEFORE the equality check; "750 mL" and "750ML" must match (FR-10). A case-only fold misses the space.
4. Brand and class/type fuzzy matching must tolerate case + punctuation + spacing differences without burying the threshold in code (FR-8, FR-25). Pull the distance threshold from `config/tolerances.json`.
5. The canonical warning text in `config/warning.json` may still be a placeholder (A18). The matcher reads whatever is there; if the placeholder is obviously fake, the AC-3 / AC-4 tests should use a fixed test config, not the production one.

### Definition of Done

Code complete when:
- [ ] Each field has its own matcher with a typed Verdict output.
- [ ] All thresholds and canonical text come from `config/`.
- [ ] Unit tests cover AC-2, AC-3, AC-4, AC-5, plus the bold-uncertain case.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/matching, pushed, merged to main.

### Expected output

The matching engine produces a typed per-field verdict and reason for every required field on every face, against the form. The output is consumed by the confidence derivation (P1-4) and the multi-face merge (P1-6) before triage (P1-5) rolls it into a lane.

### Dependencies to install

```
pnpm add fastest-levenshtein
```
