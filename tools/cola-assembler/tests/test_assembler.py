"""Smoke tests for the cola-assembler — confirms PDFs render and aren't empty."""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lib import form_layout


CASE = {
    "case_id": "test_001",
    "brand_name": "TEST BRAND",
    "fanciful_name": "Test Fanciful",
    "class_type": "TEST TYPE",
    "origin": "Nowhere",
    "abv": "42%",
    "net_contents": "750 ML",
    "warning_present": "yes",
    "expected_result": "match",
    "defect_type": "none",
    "expected_field": "",
    "notes": "test",
}


def test_render_produces_pdf_file():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "test.pdf")
        form_layout.render_case_pdf(out, CASE, label_image_path=None)
        assert os.path.exists(out)
        assert os.path.getsize(out) > 1000  # non-empty


def test_render_starts_with_pdf_magic():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "test.pdf")
        form_layout.render_case_pdf(out, CASE, label_image_path=None)
        with open(out, "rb") as f:
            head = f.read(5)
        assert head == b"%PDF-"


def test_render_handles_missing_optional_fields():
    minimal = {
        "case_id": "min_001",
        "brand_name": "",
        "class_type": "",
        "origin": "",
        "abv": "",
        "net_contents": "",
        "warning_present": "no",
        "expected_result": "review",
        "defect_type": "blurry_image",
        "expected_field": "",
        "notes": "",
    }
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "min.pdf")
        form_layout.render_case_pdf(out, minimal, label_image_path=None)
        assert os.path.exists(out)
        assert os.path.getsize(out) > 1000
