# sample-colas/fail

Manufactured defect cases — the "red bucket". Each case is a label image + an application + a known answer the verifier should reach.

Paired with `../pdfs/` (real approved COLAs from TTB — the "green bucket"). Together they make the golden set.

## Contents

- `images/` — synthetic label PNGs with planted defects. **Gitignored** — regenerate from the tool.
- `manifest.csv` — one row per case with application fields + `expected_result` + `defect_type` + `expected_field`. **Tracked** so collaborators see what was generated.

## How this directory gets populated

```bash
cd tools/cola-generator
source .venv/bin/activate
python generate_cases.py
```

See `tools/cola-generator/README.md` for full instructions and defect catalog.

## Manifest columns

| Column | Meaning |
|---|---|
| `case_id` | Synthetic ID (also the file name stem) |
| `file_name` | PNG in `images/` |
| `brand_name` | The **application** brand (may deliberately differ from the label) |
| `fanciful_name` | Fanciful name if any |
| `class_type` | Class/type designation, e.g. `RYE WHISKEY` |
| `origin` | Origin / state |
| `net_contents` | The **application** net contents (may differ from the label) |
| `abv` | The **application** alcohol content (may differ from the label) |
| `warning_present` | `yes` / `no` — is the warning on the label |
| `expected_result` | `match` / `mismatch` / `review` — the answer the verifier should reach |
| `defect_type` | One of the 9 types in `defect_catalog.md` |
| `expected_field` | Which field should be flagged (blank for match / review) |
| `notes` | Original vs altered value, generation path used |

## How the harness uses this

P5-2 (offline eval harness) runs each fail case through the verifier and compares the verdict to `expected_result` + `expected_field`. The headline metric is the **false-negative rate**: how many of these planted defects slip through as a `match`. P5-5 (CI eval gate) fails the build if any prompt/model/threshold change worsens that rate.

## Pass + fail = golden set

The complete eval golden set is the union of:

- `../pdfs/` + `../manifest.csv` — real approved COLAs (`expected_result=match`, 80+ cases pulled by `cola-fetcher`)
- `images/` + `manifest.csv` — synthesized defects (this directory)

The harness loads both, so make sure each case has a unique identifier — pass uses TTB IDs, fail uses synthetic `case_id`s prefixed with the defect type (e.g. `abv_mismatch_001`).
