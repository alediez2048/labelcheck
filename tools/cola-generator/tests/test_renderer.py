"""Smoke test for the Pillow renderer — confirms it produces a valid image."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from PIL import Image

from lib import renderer


SPEC = {
    "brand": "TEST BRAND",
    "fanciful": "Test Fanciful",
    "class_type": "TEST TYPE",
    "origin": "California",
    "abv": "42%",
    "net_contents": "750 ML",
}


def test_render_returns_pil_image_at_expected_size():
    img = renderer.render(SPEC, warning_mode="caps")
    assert isinstance(img, Image.Image)
    assert img.size == (renderer.LABEL_W, renderer.LABEL_H)


def test_render_with_blur_returns_pil_image():
    img = renderer.render(SPEC, warning_mode="caps", blur=True)
    assert isinstance(img, Image.Image)
    assert img.size == (renderer.LABEL_W, renderer.LABEL_H)


def test_render_with_missing_warning_does_not_crash():
    img = renderer.render(SPEC, warning_mode="missing")
    assert isinstance(img, Image.Image)


def test_composite_overlay_returns_image():
    base = renderer.render(SPEC, warning_mode="missing")
    overlaid = renderer.composite_warning_overlay(base, "caps")
    assert isinstance(overlaid, Image.Image)
    assert overlaid.size == base.size
