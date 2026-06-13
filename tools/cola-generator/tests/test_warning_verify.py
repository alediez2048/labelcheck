"""Tests for the warning text mutators and the verify_flaw_present check."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lib import warning


def test_canonical_starts_with_required_phrase():
    assert "GOVERNMENT WARNING:" in warning.CANONICAL_WARNING
    assert "during pregnancy" in warning.CANONICAL_WARNING


def test_caps_mode_returns_canonical():
    assert warning.mutate("caps") == warning.CANONICAL_WARNING


def test_title_mode_lowercases_heading_only():
    out = warning.mutate("title")
    assert "Government Warning:" in out
    assert "GOVERNMENT WARNING:" not in out
    # The rest of the warning stays intact.
    assert "during pregnancy" in out
    assert "Surgeon General" in out


def test_altered_mode_drops_required_phrase():
    out = warning.mutate("altered")
    assert "GOVERNMENT WARNING:" in out
    assert "during pregnancy" not in out
    # But the rest is still there.
    assert "Surgeon General" in out


def test_missing_mode_returns_empty():
    assert warning.mutate("missing") == ""


def test_unknown_mode_raises():
    try:
        warning.mutate("nonsense")
    except ValueError:
        return
    raise AssertionError("expected ValueError for unknown mode")


def test_verify_caps_present_in_canonical():
    assert warning.verify_flaw_present(warning.CANONICAL_WARNING, "caps")


def test_verify_title_caps_absent():
    out = warning.mutate("title")
    assert warning.verify_flaw_present(out, "title")


def test_verify_title_fails_when_caps_present():
    # If the AI rendered ALL CAPS even though we asked for title case, the flaw
    # is NOT present and verification should fail (the CLI then composites the
    # overlay).
    assert not warning.verify_flaw_present(warning.CANONICAL_WARNING, "title")


def test_verify_missing_actually_missing():
    assert warning.verify_flaw_present("", "missing")
    assert not warning.verify_flaw_present(warning.CANONICAL_WARNING, "missing")


def test_verify_altered_drops_phrase():
    out = warning.mutate("altered")
    assert warning.verify_flaw_present(out, "altered")
    # If the AI rendered the canonical warning, the flaw is NOT present.
    assert not warning.verify_flaw_present(warning.CANONICAL_WARNING, "altered")
