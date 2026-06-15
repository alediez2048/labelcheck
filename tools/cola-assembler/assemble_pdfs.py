#!/usr/bin/env python3
"""
assemble_pdfs.py — assemble faulty COLA test cases into single-page PDFs.

Reads each row of data/sample-colas/fail/manifest.csv, locates the matching
label PNG in fail/images/, and produces a PDF at fail/pdfs/{case_id}.pdf that
mimics TTB's "Printable Version" layout (form fields on top, label image
below). A SYNTHETIC TEST CASE stamp at the top makes it unambiguous the PDF
is generated, not a real COLA.

Output PDFs are structurally similar enough to the real pulled COLAs in
fail/../pdfs/ that the LabelCheck dashboard's upload flow can accept both
buckets identically.

SETUP
    pip install -r requirements.txt

RUN
    python assemble_pdfs.py                # build all cases not yet built
    python assemble_pdfs.py --case-id abv_mismatch_001
    python assemble_pdfs.py --force        # rebuild every case, overwriting

OUTPUT
    PDFs → ../../data/sample-colas/fail/pdfs/{case_id}.pdf
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import form_layout, manifest_link  # noqa: E402

DATA_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "data", "sample-colas", "fail"))
MANIFEST_PATH = os.path.join(DATA_ROOT, "manifest.csv")
IMAGES_DIR = os.path.join(DATA_ROOT, "images")
PDFS_DIR = os.path.join(DATA_ROOT, "pdfs")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Assemble faulty COLA test-case PDFs from manifest rows + label PNGs.",
    )
    ap.add_argument("--case-id", default=None,
                    help="Only build this specific case_id (default: build all)")
    ap.add_argument("--force", action="store_true",
                    help="Rebuild PDFs even if they already exist")
    args = ap.parse_args()

    os.makedirs(PDFS_DIR, exist_ok=True)

    if not os.path.exists(MANIFEST_PATH):
        print("ERROR: manifest not found: %s" % MANIFEST_PATH)
        print("Run cola-generator first to create it.")
        return 2

    print("Manifest: %s" % MANIFEST_PATH)
    print("Images:   %s" % IMAGES_DIR)
    print("Output:   %s" % PDFS_DIR)

    done = set() if args.force else manifest_link.existing_pdfs(PDFS_DIR)
    if done and not args.force:
        print("Resuming: %d PDFs already exist, will skip" % len(done))

    built = 0
    skipped = 0
    missing_images = 0

    for row in manifest_link.read_manifest(MANIFEST_PATH):
        cid = row["case_id"]
        if args.case_id and cid != args.case_id:
            continue
        if cid in done:
            skipped += 1
            continue

        img = manifest_link.label_image_path(IMAGES_DIR, cid)
        if not os.path.exists(img):
            print("  !! %s: label image missing (%s)" % (cid, img))
            missing_images += 1
            # Still generate the PDF — the placeholder will be drawn.

        out = manifest_link.pdf_output_path(PDFS_DIR, cid)
        try:
            form_layout.render_case_pdf(out, row, img if os.path.exists(img) else None)
            built += 1
            print("  [%d] %s  (%s)" % (built, cid, row.get("defect_type", "?")))
        except Exception as e:
            print("  !! %s failed: %s" % (cid, e))

    print("\nDone. %d PDFs built, %d skipped, %d missing-image fallbacks." %
          (built, skipped, missing_images))
    print("Output: %s" % PDFS_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
