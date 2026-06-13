# sample-colas

Real COLA applications downloaded from TTB's Public COLA Registry, used as sample/golden-set data for LabelCheck.

## Contents

- `pdfs/` — one PDF per COLA, named `{ttb_id}.pdf`. **Gitignored** — large binary files; regenerate with the fetcher rather than commit.
- `manifest.csv` — one row per COLA with the typed application fields and the source URL. **Tracked** — so collaborators see exactly what was pulled, in what range, with what expected results.

## How this directory gets populated

```bash
cd tools/cola-fetcher
source .venv/bin/activate
python pull_colas.py
```

See `tools/cola-fetcher/README.md` for full instructions.

## How this data is used downstream

- **`P1-1` Application input and sample loader** — picks a few representative COLAs as preloaded fixtures so demos work without typing a form
- **`P5-2` Offline eval harness** — the "green pairs" half of the golden set (real approved COLAs that the system should classify as a match)
- **`P5-4` Model bake-off** — the bake-off runs against real TTB labels, not public OCR benchmarks (techstack Model Selection)

The "red cases" half of the golden set — synthesized defects (ABV mismatch, title-case warning, missing warning) — is generated separately, derived from these greens by perturbing a field (assumptions A24–A26, observability.md).

## Notes

- The PDFs are public data. No login required to access TTB's Public COLA Registry.
- `expected_result` defaults to `match` in the manifest because these are *approved* COLAs (TTB has verified them). The synthetic defect set carries the `mismatch` cases.
- If a row in the manifest is wrong (e.g. brand name didn't parse cleanly), correct it in the CSV; the fetcher won't overwrite an existing row on re-run.
