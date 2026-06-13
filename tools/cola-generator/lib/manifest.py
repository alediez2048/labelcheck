"""Manifest CSV helpers — read existing, append new, idempotent resume."""

import csv
import os

COLS = [
    "case_id",
    "file_name",
    "brand_name",
    "fanciful_name",
    "class_type",
    "origin",
    "net_contents",
    "abv",
    "warning_present",
    "expected_result",
    "defect_type",
    "expected_field",
    "notes",
]


def ensure(path: str) -> None:
    """Create the manifest file with header if it doesn't exist."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            csv.DictWriter(f, fieldnames=COLS).writeheader()


def existing_case_ids(path: str) -> set:
    """Return case_ids already in the manifest, for resume."""
    done = set()
    if not os.path.exists(path):
        return done
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            cid = (row.get("case_id") or "").strip()
            if cid:
                done.add(cid)
    return done


def append(path: str, row: dict) -> None:
    """Append a fully-populated row. Missing keys are written as empty strings."""
    out = {col: row.get(col, "") for col in COLS}
    with open(path, "a", newline="") as f:
        csv.DictWriter(f, fieldnames=COLS).writerow(out)


def validate_schema(path: str) -> tuple:
    """Return (ok, problems) — used by tests to confirm the manifest is well-formed."""
    problems = []
    if not os.path.exists(path):
        return False, ["manifest does not exist: %s" % path]
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        if header != COLS:
            problems.append("header mismatch: got %r, want %r" % (header, COLS))
        for i, row in enumerate(reader, start=2):
            if not row.get("case_id"):
                problems.append("row %d: missing case_id" % i)
            if row.get("expected_result") not in ("match", "mismatch", "review"):
                problems.append("row %d: bad expected_result %r" % (i, row.get("expected_result")))
            if row.get("expected_result") == "mismatch" and not row.get("expected_field"):
                problems.append("row %d: mismatch with no expected_field" % i)
    return len(problems) == 0, problems
