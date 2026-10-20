# `config/`

The regulatory configuration store (FR-25). **Editing these files must not require a developer.**

A compliance reviewer should be able to open any of these JSON files, change a value, restart the app, and have the change take effect — no TypeScript, no rebuild step, no PR review for a threshold tweak. The matching engine (P1-3) imports these via `lib/config/`; it never hardcodes a warning string or a similarity threshold.

## Files

| File | What it controls | Driven by |
|---|---|---|
| `warning.json` | The canonical government-warning text and the heading rules (CAPS strict, bold best-effort) | FR-11, FR-12, D6 |
| `tolerances.json` | Per-field matching rules (fuzzy / exact / stated-equals-stated) and similarity thresholds | FR-8, FR-9, FR-10 |
| `fields-by-type.json` | Required-field lists keyed by beverage type (wine / distilled_spirits / malt_beverage) | FR-3, A10 |

## The government warning

`warning.json` carries the verbatim 27 CFR § 16.21 text and the heading rules. `enforcement` picks how strictly it is applied:

- `"strict"` (the default when the key is omitted): the warning must be present, match the canonical text word for word (whitespace normalised), carry an ALL CAPS `GOVERNMENT WARNING:` heading, and be bold. Uncertain bold goes to human review (D6).
- `"presence_only"` (what ships): the warning only has to be on the label. A warning the model did not detect goes to the review lane rather than the mismatch lane.

Presence-only ships because real, approved COLAs vary slightly from the canonical wording and casing, and the model often misses small back-label text, so strict mode put nearly every real application in the mismatch lane. The eval harness and the acceptance tests pin `strict`, so the full check stays measured and tested.

## ABV is stated-equals-stated (A19)

`alcoholContent` is intentionally **stated-equals-stated**, not a TTB tolerance-table comparison. Real TTB rules allow a small percentage drift; we deliberately do not encode those tables in the prototype. If we encoded the wrong tolerance, the verifier would silently disagree with the agency's rules without anyone noticing. The note inside `tolerances.json` records the simplification.

## Production migration

In production these JSON files are replaced by the versioned `rule_config` table in `schema.md`. The **editing surface stays the same** — the compliance reviewer still edits a field, hits save, and the change takes effect. Only the persistence layer changes.
