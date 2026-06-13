"""Tests for the alter-one-field invariant.

For every data-mismatch defect, the resulting application must differ from the
label in EXACTLY ONE field, and expected_field must name that field.
"""

import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import generate_cases
from lib import sample_data

LABEL_KEYS = {"brand_name", "fanciful_name", "class_type", "origin", "abv", "net_contents"}


def _label_as_app(spec: dict) -> dict:
    return {
        "brand_name": spec["brand"],
        "fanciful_name": spec["fanciful"],
        "class_type": spec["class_type"],
        "origin": spec["origin"],
        "abv": spec["abv"],
        "net_contents": spec["net_contents"],
    }


def _count_differences(app: dict, label_as_app: dict) -> int:
    return sum(1 for k in LABEL_KEYS if app.get(k, "") != label_as_app.get(k, ""))


def test_abv_mismatch_alters_only_abv():
    rng = random.Random(1)
    spec = sample_data.pick_spec(rng)
    app, field = generate_cases._application_fields(spec, "abv_mismatch")
    assert field == "abv"
    assert app["abv"] != spec["abv"]
    assert _count_differences(app, _label_as_app(spec)) == 1


def test_net_contents_mismatch_alters_only_net_contents():
    rng = random.Random(2)
    spec = sample_data.pick_spec(rng)
    app, field = generate_cases._application_fields(spec, "net_contents_mismatch")
    assert field == "net_contents"
    assert app["net_contents"] != spec["net_contents"]
    assert _count_differences(app, _label_as_app(spec)) == 1


def test_brand_mismatch_alters_only_brand():
    rng = random.Random(3)
    spec = sample_data.pick_spec(rng)
    app, field = generate_cases._application_fields(spec, "brand_mismatch")
    assert field == "brand_name"
    assert app["brand_name"] != spec["brand"]
    assert _count_differences(app, _label_as_app(spec)) == 1


def test_case_variant_is_a_match_not_a_mismatch():
    rng = random.Random(4)
    spec = sample_data.pick_spec(rng)
    app, field = generate_cases._application_fields(spec, "case_variant")
    assert field == ""  # no expected_field — should still match
    # Differs only in casing of brand_name.
    assert app["brand_name"].lower() == spec["brand"].lower()
    assert generate_cases._expected_result("case_variant") == "match"


def test_none_control_has_zero_differences():
    rng = random.Random(5)
    spec = sample_data.pick_spec(rng)
    app, field = generate_cases._application_fields(spec, "none")
    assert field == ""
    assert _count_differences(app, _label_as_app(spec)) == 0


def test_warning_defects_set_expected_field_to_government_warning():
    rng = random.Random(6)
    spec = sample_data.pick_spec(rng)
    for defect in ("warning_not_caps", "warning_missing", "warning_wording_altered"):
        _, field = generate_cases._application_fields(spec, defect)
        assert field == "government_warning", "defect=%s" % defect
