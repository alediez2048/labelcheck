# cola-fetcher

A one-off Python tool that bootstraps sample data for LabelCheck by downloading approved COLAs from TTB's Public COLA Registry as PDFs.

## What it produces

- `../../data/sample-colas/pdfs/{ttbid}.pdf` — one printable-version PDF per COLA (label artwork + typed application fields)
- `../../data/sample-colas/manifest.csv` — one row per COLA: TTB ID, brand, class/type, origin, status, source URL

These PDFs power Phase 1's sample loader (`P1-1`), the golden-set evals (`P5-2`), and the model bake-off (`P5-4`).

## Setup (one time)

```bash
cd tools/cola-fetcher
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## Run

```bash
# Default: 100 approved COLAs from 01/01/2025 to 12/31/2025
python pull_colas.py

# Custom range and count
python pull_colas.py --from 01/01/2025 --to 06/30/2025 --count 50

# Only keep records with status APPROVED
python pull_colas.py --approved-only

# If the search form layout changes and the script can't find the date fields,
# run discover first to print the form's actual input names:
python pull_colas.py --discover
```

## How it works

1. Opens TTB's Basic Search (`publicSearchColasBasic.do`)
2. Fills the date range, submits
3. Collects TTB IDs from result links (paginates with "Next")
4. For each ID, opens the detail page, clicks "Printable Version", waits for the label image to render, then `page.pdf()` saves the printable view (artwork included)
5. Appends a manifest row per record; skips IDs already in the manifest on re-run

## Why a browser instead of a plain HTTP scrape

The label artwork only renders on the printable HTML page; it isn't a separately-fetched asset that `curl` can grab in isolation. Headless Chromium loads the page exactly like a browser (image included) and prints it to PDF in one step. This is equivalent to Chrome's "Print → Save as PDF" — strictly better than right-clicking, which would save the HTML without the embedded image.

## Politeness

- Public data, no login required. The script identifies itself with a custom User-Agent string.
- Default `--delay 2.5` between records. Raise it if you're pulling a large batch.
- Re-runs skip already-saved IDs, so you can stop and resume.
- `--headed` is for debugging the search flow only; PDF generation requires headless Chromium and will fail in headed mode.

## Known fragilities (and the fix)

- **Search form selectors.** The script assumes the date range is the first two text inputs on the form. If TTB changes the form layout, `run_search` will fail. Recovery: run `--discover` to print the real input names, then lock them in.
- **"Printable Version" link** is matched by text via `get_by_role("link", name=/Printable/i)`. If TTB renames it, the same fix applies.
- **Detail URL** (`DETAIL_URL` constant) assumes the `action=publicDisplaySearchBasic&ttbid=...` pattern. Verified working at time of writing; may change.

## Manifest schema

| Column | Source |
|---|---|
| `ttb_id` | result link query param |
| `file_name` | `{ttb_id}.pdf` |
| `brand_name`, `fanciful_name`, `class_type`, `origin` | scraped from detail page text |
| `net_contents`, `abv`, `warning_present` | left blank (extract from the PDF later — these aren't always on the detail page; the printable view has them) |
| `expected_result` | seeded to `match` (these are approved COLAs, so the verification should pass) |
| `defect_type` | seeded to `none` |
| `source_url` | the detail-page URL the script visited |
| `notes` | status string from the detail page |

`expected_result` and `defect_type` are the eval-set fields: a synthetic defect-injection pass (P5-2) will produce a separate set with `expected_result=mismatch` and a specific `defect_type` (ABV mismatch, title-case warning, etc.).
