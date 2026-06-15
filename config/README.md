# `config/`

The regulatory configuration store (FR-25). **Editing these files must not require a developer.**

A compliance reviewer should be able to open any of these JSON files, change a value, restart the app, and have the change take effect — no TypeScript, no rebuild step, no PR review for a threshold tweak. The matching engine (P1-3) imports these via `lib/config/`; it never hardcodes a warning string or a similarity threshold.

## Files

| File | What it controls | Driven by |
|---|---|---|
| `warning.json` | The canonical government-warning text and the heading rules (CAPS strict, bold best-effort) | FR-11, FR-12, D6 |
| `tolerances.json` | Per-field matching rules (fuzzy / exact / stated-equals-stated) and similarity thresholds | FR-8, FR-9, FR-10 |
| `fields-by-type.json` | Required-field lists keyed by beverage type (wine / distilled_spirits / malt_beverage) | FR-3, A10 |

## The verbatim warning text — A18 placeholder

`warning.json` currently carries the literal sentinel `__TODO_VERBATIM_TEXT_A18__` in `canonicalText`. This is the **gating regulatory item** (assumption A18). It is intentional: the agent that ran P0-4 was instructed **not** to paraphrase or invent the warning text because doing so silently is a regulatory hazard.

Replace the placeholder only when the verbatim 27 CFR § 16.21 wording has been confirmed by a TTB stakeholder. A separate tiny ticket is the right home for that change. Until then, `grep -r __TODO_VERBATIM_TEXT_A18__` should return exactly the occurrence in `warning.json`.

## ABV is stated-equals-stated (A19)

`alcoholContent` is intentionally **stated-equals-stated**, not a TTB tolerance-table comparison. Real TTB rules allow a small percentage drift; we deliberately do not encode those tables in the prototype. If we encoded the wrong tolerance, the verifier would silently disagree with the agency's rules without anyone noticing. The note inside `tolerances.json` records the simplification.

## Production migration

In production these JSON files are replaced by the versioned `rule_config` table in `schema.md`. The **editing surface stays the same** — the compliance reviewer still edits a field, hits save, and the change takes effect. Only the persistence layer changes.
