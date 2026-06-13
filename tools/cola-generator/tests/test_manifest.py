"""Schema validity tests for the fail manifest."""

import csv
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lib import manifest


def test_ensure_creates_header():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "m.csv")
        manifest.ensure(path)
        assert os.path.exists(path)
        with open(path) as f:
            header = next(csv.reader(f))
        assert header == manifest.COLS


def test_ensure_is_idempotent():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "m.csv")
        manifest.ensure(path)
        manifest.append(path, _row("abv_mismatch_001", "mismatch", "abv"))
        manifest.ensure(path)  # should NOT overwrite
        with open(path) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["case_id"] == "abv_mismatch_001"


def test_existing_case_ids():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "m.csv")
        manifest.ensure(path)
        manifest.append(path, _row("c1", "match"))
        manifest.append(path, _row("c2", "match"))
        assert manifest.existing_case_ids(path) == {"c1", "c2"}


def test_validate_schema_ok():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "m.csv")
        manifest.ensure(path)
        manifest.append(path, _row("control_01", "match"))
        manifest.append(path, _row("abv_001", "mismatch", "abv"))
        manifest.append(path, _row("blur_01", "review"))
        ok, problems = manifest.validate_schema(path)
        assert ok, problems


def test_validate_schema_catches_mismatch_without_field():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "m.csv")
        manifest.ensure(path)
        # mismatch row with empty expected_field is invalid.
        manifest.append(path, _row("bad", "mismatch", expected_field=""))
        ok, problems = manifest.validate_schema(path)
        assert not ok
        assert any("expected_field" in p for p in problems)


def test_validate_schema_catches_bad_result():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "m.csv")
        manifest.ensure(path)
        manifest.append(path, _row("x", "bogus"))
        ok, problems = manifest.validate_schema(path)
        assert not ok
        assert any("expected_result" in p for p in problems)


def _row(case_id: str, expected_result: str, expected_field: str = "") -> dict:
    return {
        "case_id": case_id,
        "file_name": "%s.png" % case_id,
        "brand_name": "TEST",
        "class_type": "TEST TYPE",
        "origin": "Nowhere",
        "abv": "40%",
        "net_contents": "750 ML",
        "warning_present": "yes",
        "expected_result": expected_result,
        "defect_type": "none",
        "expected_field": expected_field,
        "notes": "test",
    }
