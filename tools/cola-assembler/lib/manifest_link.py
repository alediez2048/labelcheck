"""Read the fail manifest, pair each row with its image, and locate output paths."""

import csv
import os
from typing import Iterator


def read_manifest(manifest_path: str) -> Iterator[dict]:
    """Yield each row of fail/manifest.csv as a dict."""
    if not os.path.exists(manifest_path):
        return
    with open(manifest_path, newline="") as f:
        for row in csv.DictReader(f):
            if row.get("case_id"):
                yield row


def label_image_path(images_dir: str, case_id: str) -> str:
    """Return the expected PNG path for a case (existence not checked here)."""
    return os.path.join(images_dir, "%s.png" % case_id)


def pdf_output_path(pdfs_dir: str, case_id: str) -> str:
    """Return the output PDF path for a case."""
    return os.path.join(pdfs_dir, "%s.pdf" % case_id)


def existing_pdfs(pdfs_dir: str) -> set:
    """Return the set of case_ids that already have a PDF."""
    if not os.path.isdir(pdfs_dir):
        return set()
    return {
        os.path.splitext(name)[0]
        for name in os.listdir(pdfs_dir)
        if name.lower().endswith(".pdf")
    }
