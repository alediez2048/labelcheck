# cola-generator

Generates faulty COLA test cases — label + application + known answer — for the LabelCheck verification eval harness. Companion to `cola-fetcher` (which pulls the real approved cases).

## What it produces

- `../../data/sample-colas/fail/images/{case_id}.png` — synthetic label PNG with the planted defect
- `../../data/sample-colas/fail/manifest.csv` — one row per case: application fields + `expected_result` + `defect_type` + `expected_field`

These cases feed:
- **P5-2 Offline eval harness** — the "red" half of the golden set (planted defects the verifier should catch)
- **P5-4 Model bake-off** — variety of label styles for testing candidate models
- The dashboard demo — drag-and-drop a fail case into the upload UI; the verifier should route it to the correct lane

## Setup

```bash
cd tools/cola-generator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Optional — only if you'll use AI providers:
pip install openai           # for --provider openai
pip install google-genai     # for --provider gemini
```

## Run

```bash
# Default: 10 balanced cases across all 9 defect types, deterministic Pillow
python generate_cases.py

# Larger batch
python generate_cases.py --count 50

# Focus on data-mismatch defects only
python generate_cases.py --defects abv_mismatch,brand_mismatch,net_contents_mismatch --count 20

# AI-generated realistic labels (warning defects still use Pillow for text precision)
python generate_cases.py --provider openai --count 20

# Plan + cost estimate, generate nothing
python generate_cases.py --provider openai --count 50 --dry-run
```

## Defect types

See [`defect_catalog.md`](defect_catalog.md) for the full table. Summary:

| Defect | Lane | Generation path |
|---|---|---|
| `none` | match | Pillow (or AI for realism) — control case |
| `case_variant` | match | Pillow — false-positive guard |
| `abv_mismatch` | mismatch | Pillow — alter application ABV |
| `net_contents_mismatch` | mismatch | Pillow — alter application net contents |
| `brand_mismatch` | mismatch | Pillow — alter application brand |
| `warning_not_caps` | mismatch | **Pillow always** — title-case heading |
| `warning_missing` | mismatch | **Pillow always** — no warning on label |
| `warning_wording_altered` | mismatch | **Pillow always** — drop required phrase |
| `blurry_image` | review | Pillow + blur post-process |

Warning defects use Pillow even when `--provider openai|gemini` is set, because the warning check is exact text and AI text rendering is imprecise. This matches the GFA reference brief's recommendation.

## Three generation paths

1. **Pillow synthetic label.** Default. Deterministic, exact ground truth, zero cost, runs offline.
2. **AI image generation (OpenAI or Gemini).** For visual realism and bake-off variety. Ground truth derived by reading back the actual rendered output with a vision model — never from the prompt.
3. **Pillow + blur post-process.** For the `blurry_image` / review-lane case.

The AI path principle (from the GFA brief): **"Derive ground truth from what the label actually shows, not from the prompt."** After generation, we transcribe the label with a vision model, and either accept the transcription as the label-side truth (data-mismatch path) or verify the planted flaw is present (warning path; falls back to composite-overlay if not).

## Provider model IDs (verify before use)

| Provider | Image generation | Vision read-back |
|---|---|---|
| `openai` | `gpt-image-1` | `gpt-4o` |
| `gemini` | `imagen-3.0-generate-002` | `gemini-2.0-flash` |
| `mock` | (canned) | (canned) — for offline testing of the AI code path |
| `deterministic` | Pillow only | n/a |

Image-generation models change frequently. If you hit a "model not found" error, check the vendor's live docs and update the ID in `lib/providers.py`.

## API keys

Environment only — never committed:

- `OPENAI_API_KEY` — for `--provider openai`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` — for `--provider gemini`

If neither is set, the AI providers raise at startup and you should run with `--provider deterministic` (or the default) instead.

## Resumable

Re-running skips any `case_id` already in the manifest. To regenerate a case, delete its row from `manifest.csv` and its PNG from `images/`, then re-run.

## Tests

```bash
pytest tests/
```

Covers:
- Manifest schema validity (columns, expected_result values, mismatch must have expected_field)
- The alter-one-field invariant (data-mismatch defects differ from label in exactly one field)
- Warning text mutators (caps / title / altered / missing produce correct strings)
- Verification logic (`verify_flaw_present` correctly distinguishes planted vs unplanted flaws)
- Renderer smoke test (Pillow path produces valid images of the expected size)

## Files

```
tools/cola-generator/
├── generate_cases.py    main CLI
├── defect_catalog.md    the 9 defect types + canonical warning text
├── requirements.txt
├── README.md            (this file)
├── lib/
│   ├── warning.py       canonical 27 CFR 16.21 text + mutators + flaw verifier
│   ├── manifest.py      CSV helpers (ensure / append / validate)
│   ├── sample_data.py   pool of label specs (brands, types, origins, ABVs)
│   ├── renderer.py      Pillow deterministic renderer + composite overlay fallback
│   ├── degrade.py       blur + downscale for the review-lane case
│   └── providers.py     Mock / OpenAI / Gemini provider adapters
└── tests/
    ├── test_manifest.py
    ├── test_alter_field.py
    ├── test_warning_verify.py
    └── test_renderer.py
```
