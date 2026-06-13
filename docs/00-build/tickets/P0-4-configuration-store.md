# P0-4 — Configuration store

Stand up the data-file configuration store: the canonical government warning text, the per-field match tolerances, and the per-beverage-type field requirements. These are data that a compliance reviewer can edit without touching application code (FR-25). The verbatim warning text (assumption A18) is a clearly marked placeholder until the regulatory wording is pinned.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-4: Configuration store.

Current state: (at start)
- [Paste P0-1 + P0-2 + P0-3 actual output: Next.js + TS strict + Tailwind scaffold, `types/domain.ts`, provider adapter interface + mock at `lib/provider/`.]

What's NOT done yet:
- [P0-4] Config files (warning, tolerances, fields-by-type) not created.
- [P0-5..P0-7] Image preproc, access gate, CI still pending.
- [P1-3] Matching engine consumes these configs — warning text for FR-11, tolerances for FR-8/9/10, fields-by-type for FR-3.
- [P6-2] Production replaces these files with the versioned `rule_config` table (schema.md), same editing surface.

TICKET-P0-4 Goal:
Create three JSON config files under `config/` (or `config/*/`) and a `lib/config/` loader that reads them, validates with Zod, and exposes typed accessors. The values must be editable without code changes. Leave `config/warning.json` with a CLEARLY MARKED placeholder for the verbatim regulatory text (assumption A18); leave `config/tolerances.json` defaulting alcohol content and net contents to stated-equals-stated (FR-9, A19); set fuzzy thresholds for brand and class/type per FR-8.

Check `config/` is empty before creating. Don't overwrite existing code.
Follow @requirements.md FR-25 (config-driven), FR-8/9/10/11/12, FR-3. Reference @assumptions.md A18 (warning text), A10 (beverage-type scope), A19 (ABV tolerance).
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-4 Scope

- Phase: Phase 0 — Foundations
- Time budget: 2h
- Dependencies: P0-2
- Branch: `feat/config`

### Acceptance criteria

- [ ] `config/warning.json` exists with the canonical warning text slot, a `version` field, and a CLEARLY MARKED `__TODO_VERBATIM_TEXT_A18__` placeholder until A18 is resolved.
- [ ] `config/tolerances.json` exists with per-field tolerance settings: brand and class/type as fuzzy with a documented similarity threshold (FR-8); alcohol content and net contents as stated-equals-stated (FR-9, FR-10, A19).
- [ ] `config/fields-by-type.json` exists with the required-fields list keyed by `BeverageType` (`wine | distilled_spirits | malt_beverage`). Distilled spirits has the fullest coverage (A10).
- [ ] `lib/config/index.ts` loads each file once at module init, validates with Zod, and exposes typed accessors: `getWarningConfig()`, `getTolerances()`, `getRequiredFields(beverageType)`.
- [ ] Editing a JSON file and restarting the dev server takes effect — no code change required.
- [ ] Invalid JSON or a schema-violating value throws a clear startup error citing the file and the field (not a stack trace).
- [ ] `pnpm lint` and `pnpm build` succeed.

### Implementation details

1. Create `config/warning.json`:
   ```json
   {
     "version": "0.0.1-placeholder",
     "canonicalText": "__TODO_VERBATIM_TEXT_A18__ (replace once assumption A18 is resolved; see requirements FR-11)",
     "headingText": "GOVERNMENT WARNING:",
     "headingCapsRequired": true,
     "headingBoldRequired": true,
     "headingBoldEnforcement": "best_effort"
   }
   ```
   The `headingBoldEnforcement: "best_effort"` value encodes D6 — bold cannot make a regulatory decision on its own.
2. Create `config/tolerances.json`:
   ```json
   {
     "brandName": { "rule": "fuzzy", "minSimilarity": 0.92, "normalize": ["case", "punctuation", "whitespace"] },
     "classType": { "rule": "fuzzy", "minSimilarity": 0.92, "normalize": ["case", "punctuation", "whitespace"] },
     "alcoholContent": { "rule": "stated_equals_stated", "normalize": ["unit", "whitespace"], "note": "A19: real TTB ABV tolerance tables not implemented in prototype" },
     "netContents": { "rule": "stated_equals_stated", "normalize": ["unit", "whitespace", "case"] },
     "producerName": { "rule": "fuzzy", "minSimilarity": 0.90, "normalize": ["case", "punctuation", "whitespace"] },
     "producerAddress": { "rule": "fuzzy", "minSimilarity": 0.85, "normalize": ["case", "punctuation", "whitespace"] },
     "countryOfOrigin": { "rule": "exact", "normalize": ["case", "whitespace"] }
   }
   ```
3. Create `config/fields-by-type.json`:
   ```json
   {
     "distilled_spirits": ["brandName", "classType", "alcoholContent", "netContents", "producerName", "producerAddress", "government_warning"],
     "wine": ["brandName", "classType", "alcoholContent", "netContents", "producerName", "producerAddress", "countryOfOrigin", "government_warning"],
     "malt_beverage": ["brandName", "classType", "alcoholContent", "netContents", "producerName", "producerAddress", "government_warning"]
   }
   ```
   Per A10, distilled spirits is the demo path; the others are present so adding their checks is a config edit, not a code change.
4. Create `lib/config/schema.ts` — Zod schemas for each config file. Reuse `FieldName`, `BeverageType` from `@/types`. Reject unknown keys (`z.object({...}).strict()`).
5. Create `lib/config/index.ts`:
   - Read each file with `fs.readFileSync` at module init (synchronous is fine — these are tiny, read once).
   - Validate with Zod; on failure throw `new Error(\`Invalid \${file}: \${zodIssueSummary}\`)`.
   - Export `getWarningConfig()`, `getTolerances()`, `getRequiredFields(beverageType)`.
   - Memoise (read once per process).
6. Add `lib/config/__tests__/load.test.ts` skeleton: import the loaders, assert the placeholder text is present (to fail loudly when A18 is resolved and the placeholder is forgotten elsewhere).
7. Add a top-level note in `config/README.md`: "These files are the regulatory configuration. Editing them must not require a developer (FR-25). The verbatim government warning text in `warning.json` is the gating regulatory item (assumption A18) — replace the placeholder before any production use."

### Key constraints

1. **FR-25: rules in config.** The matching engine (P1-3) imports these via `lib/config`; it does not have a hardcoded warning string or a hardcoded similarity threshold.
2. **A18 placeholder is loud.** The warning text uses the literal sentinel `__TODO_VERBATIM_TEXT_A18__` so a `grep` or a Zod refinement can detect "this is still the placeholder" before production.
3. **A19: ABV is stated-equals-stated.** Do not encode TTB tolerance tables. The note in `tolerances.json` documents the simplification.
4. **D6: bold is best-effort.** `headingBoldEnforcement: "best_effort"` — the matching engine treats `"uncertain"` from the model as "route to review", not "fail".
5. **A10: distilled spirits is the prototype demo path.** Other beverage types are listed but their per-field checks may be a future ticket; the config carries them so adding is a config edit.
6. **NFR-6: maintainability.** Config and code separated; the matching engine never reads JSON directly.
7. **No `any`, TypeScript strict.**
8. **NFR-4: no persistence.** Config is read-only at runtime; this ticket does not introduce a write path.

### Files to modify

- `lib/provider/index.ts` (at start — paste real file content from prior ticket) — optionally consume `getRequiredFields(beverageType)` when building the `fieldSchema` for the mock, so the provider seam and the config seam meet correctly. If left for P1-2, leave a `// TODO(P1-2): use getRequiredFields` comment.

### Files to create

1. `config/warning.json` — canonical text slot, heading rules, A18 placeholder.
2. `config/tolerances.json` — per-field rule and threshold table.
3. `config/fields-by-type.json` — required fields keyed by beverage type.
4. `config/README.md` — what these files are, who edits them, FR-25 / A18 note.
5. `lib/config/schema.ts` — Zod schemas for the three files.
6. `lib/config/index.ts` — typed loaders + memoised accessors.
7. `lib/config/__tests__/load.test.ts` — load + placeholder-present assertion.

### Config / schema / store updates

- `config/warning.json` (NEW) — canonical warning text + heading rules.
- `config/tolerances.json` (NEW) — per-field rules + similarity thresholds.
- `config/fields-by-type.json` (NEW) — required-field lists by beverage type.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] Edit `config/tolerances.json` to set `brandName.minSimilarity` to `0.50`, restart `pnpm dev`, observe the value flows through (a future P1-3 test will assert this; for now, a temporary `console.log(getTolerances())` in a debug route is enough).
- [ ] Corrupt `config/warning.json` (delete a comma) — restart — confirm startup throws a clear, file-named error, not a stack trace.
- [ ] `grep -r __TODO_VERBATIM_TEXT_A18__` returns exactly the placeholder occurrence(s) — the agent should NOT silently replace it during this ticket.
- [ ] Run `getRequiredFields("wine")` and confirm `countryOfOrigin` is in the returned list; `getRequiredFields("distilled_spirits")` does not include it.

Eval: (not applicable in Phase 0).

Update docs: Mark P0-4 done in TICKETS.md; add a DEV-LOG entry. Note in DEV-LOG that A18 is still open.

### Reference

- requirements.md — FR-3 (per-type fields), FR-8 (fuzzy brand/class), FR-9 (ABV exact, simplified per A19), FR-10 (net contents normalize), FR-11 (warning verbatim), FR-12 (warning defects), FR-25 (config-driven).
- systemsdesign.md — D6 (warning bold best-effort), Configuration store; Production Evolution Path (config → rule_config table at P6-2).
- techstack.md — Configuration; Matching Logic (consumer of these files).
- assumptions.md — A10 (beverage scope), A18 (verbatim warning text, gating), A19 (ABV tolerance simplification).

### Common gotchas

1. **The warning verbatim text (A18) is the gating regulatory item.** Leave the `__TODO_VERBATIM_TEXT_A18__` placeholder. Do NOT invent or paraphrase the warning text — that is a regulatory hazard. The placeholder is the correct artefact for now; a separate, very small ticket replaces it once A18 is resolved.
2. **ABV defaults to stated-equals-stated (FR-9, A19).** Do not encode TTB tolerance tables — those are explicitly out of scope and would silently disagree with the agency's real rule set.
3. **Bold enforcement is "best_effort" (D6).** The config must not say `"strict"` for bold. The matching engine routes uncertain bold to review, never auto-fails on bold alone.
4. **Strict Zod (`.strict()`) on every config schema.** An unknown key in `warning.json` like `"caps": true` instead of `"headingCapsRequired": true` would silently be ignored — and the warning check would silently weaken. Reject unknown keys loudly.

### Definition of Done

Code complete when:
- [ ] Three JSON config files exist under `config/` with the documented shape.
- [ ] `lib/config/index.ts` loads, validates with Zod, memoises, and exposes typed accessors.
- [ ] Invalid config produces a clear startup error citing file + field.
- [ ] The A18 placeholder is present and intentionally not replaced.
- [ ] `pnpm lint` and `pnpm build` succeed.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated (DEV-LOG notes A18 still open).
- [ ] Committed to `feat/config`, pushed, merged to main.

### Expected output

A compliance reviewer can edit `config/tolerances.json` or `config/fields-by-type.json` and have the change take effect on restart, without touching code. The canonical warning text has a single home (`config/warning.json`) with a loud placeholder until A18 is resolved. The matching engine (P1-3) imports its rules from `lib/config`, never hardcodes them.

### Dependencies to install

_(zod was installed in P0-3; no new deps for this ticket)_
