# Defect catalog — the fail bucket

Every fail case is a label image + an application (the typed fields) + a known answer the eval harness scores against. There are three kinds of defect:

- **Data mismatch:** the label is correct, but one application field disagrees with it (mirrors a data-entry error in the application form).
- **Label-side flaw:** the label itself breaks a rule (the government warning).
- **Bad image:** blurred or low-resolution; should route to the human-review lane.

## Catalog

| `defect_type` | What the label shows | What the application says | `expected_result` | `expected_field` |
|---|---|---|---|---|
| `none` | everything correct | same as label | `match` | (blank) |
| `case_variant` | `STONE'S THROW` | `Stone's Throw` | `match` | (blank) — guards against false positives |
| `abv_mismatch` | `45% ALC/VOL` | `abv = 40%` | `mismatch` | `abv` |
| `net_contents_mismatch` | `750 ML` | `net_contents = 375 ML` | `mismatch` | `net_contents` |
| `brand_mismatch` | `OLD CEDAR` | `brand = OLD CHERRY` | `mismatch` | `brand_name` |
| `warning_not_caps` | `Government Warning:` (title case) | (label-side flaw) | `mismatch` | `government_warning` |
| `warning_missing` | no warning at all | (label-side flaw) | `mismatch` | `government_warning` |
| `warning_wording_altered` | required phrase dropped | (label-side flaw) | `mismatch` | `government_warning` |
| `blurry_image` | clean label, blurred and downscaled | matches label | `review` | (blank) |

This spread exercises:
- All three lanes (`match` / `mismatch` / `review`)
- All per-field checks
- The hardest check (the government warning) in three different failure modes
- A deliberate true-match (`case_variant`) that must **not** be flagged — guards against false positives

## Canonical government warning (27 CFR § 16.21)

The exact text the warning check verifies, and the string the warning-defect mutators start from:

> GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

This is the single source of truth in this tool. Stored in `lib/warning.py` and referenced from `renderer.py` (composite-overlay fallback) and from the warning-flaw verifier.

## Why three paths

Each defect type maps to one of three generation paths:

| Defect types | Path | Why |
|---|---|---|
| `abv_mismatch`, `net_contents_mismatch`, `brand_mismatch`, `case_variant` | **Pillow synthetic label + altered application** | We need to know what the label shows so we can deliberately differ from it. Pillow renders the label-side values exactly; the application field is altered by exactly one. |
| `none` (control) | **Pillow synthetic label, matching application** | Same as above with no alteration. Optionally AI-generated for visual realism in bake-offs (`--provider openai`). |
| `warning_not_caps`, `warning_missing`, `warning_wording_altered` | **Pillow synthetic label with planted flaw** | Warning checks are exact text comparisons (CAPS + verbatim). AI image generators render text imprecisely and can't be trusted for this. Pillow is the right tool. |
| `blurry_image` | **Pillow synthetic label + post-process blur** | Generate a clean label, then blur + downscale + re-upscale to simulate a phone photo. |

When `--provider openai` or `--provider gemini` is set, the `none` and the data-mismatch cases use AI image generation for realistic-looking labels (per the GFA brief: derive ground truth by reading the actual output via vision, not from the prompt). The warning defects **always** fall back to Pillow because text precision is non-negotiable.

## Verification (the AI path)

When AI image generation is used, every case is verified by reading back the actual rendered label with a vision model and confirming:

- **Data mismatch cases:** the altered application field actually differs from what the label reads back. If the model rendered `40%` as `45%`, the case is regenerated.
- **Warning defects:** the planted flaw is actually present in the transcription. If it isn't (e.g., the model rendered ALL CAPS even though the prompt asked for title case), the case falls back to the Pillow composite-overlay so the flaw is guaranteed.

The principle: ground truth comes from what the label **actually shows**, never from what we asked for.
