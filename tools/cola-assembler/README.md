# cola-assembler

Glues each faulty test case (manifest row + label PNG) from `cola-generator` into a single-page PDF that mimics TTB's "Printable Version" layout. The result lands in `data/sample-colas/fail/pdfs/{case_id}.pdf` — structurally similar to the real PDFs in `data/sample-colas/pdfs/` so the dashboard upload flow can accept both buckets identically.

## What it produces

A PDF per case containing:
- TTB-mimic header
- A red "SYNTHETIC TEST CASE — NOT A REAL COLA" stamp at the top with the `case_id` (required for honesty — these are not real applications)
- Application data section with the form fields from the manifest row (the deliberately-altered values for mismatch cases)
- The label PNG embedded full-width

If a label image is missing, the PDF still renders with a clearly-marked placeholder box.

## Setup

```bash
cd tools/cola-assembler
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# Build every case in fail/manifest.csv that doesn't already have a PDF
python assemble_pdfs.py

# Build a specific case
python assemble_pdfs.py --case-id abv_mismatch_001

# Rebuild every case, overwriting existing PDFs
python assemble_pdfs.py --force
```

## Workflow

```bash
# 1. cola-generator creates labels + manifest rows
cd ../cola-generator
source .venv/bin/activate
python generate_cases.py --provider gemini --count 50

# 2. cola-assembler glues each row + label into a PDF
cd ../cola-assembler
source .venv/bin/activate
python assemble_pdfs.py
```

## Files

```
tools/cola-assembler/
├── assemble_pdfs.py          main CLI
├── lib/
│   ├── form_layout.py        TTB-mimic page template via reportlab
│   └── manifest_link.py      manifest + image-path helpers
├── requirements.txt          reportlab + Pillow + pytest
├── README.md
└── tests/
    └── test_assembler.py     smoke test that PDFs render and contain key fields
```

## Tests

```bash
pytest tests/
```

Smoke-tests that the assembler produces a non-empty valid PDF given a manifest row.
