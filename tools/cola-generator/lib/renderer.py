"""Deterministic Pillow label renderer.

Draws a label exactly to spec, with the warning text placed verbatim or with a
planted defect. Used as the default generation path and as the fallback when AI
image generation can't be trusted for text precision (warning defects).
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from .warning import mutate

LABEL_W, LABEL_H = 1000, 1400


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render(spec: dict, warning_mode: str = "caps", blur: bool = False) -> Image.Image:
    """Render a label PNG from spec.

    spec keys: brand, fanciful, class_type, origin, abv, net_contents
    warning_mode: 'caps' | 'title' | 'altered' | 'missing'
    blur: if True, blur + downscale + upscale to simulate a phone photo
    """
    img = Image.new("RGB", (LABEL_W, LABEL_H), (244, 240, 230))
    d = ImageDraw.Draw(img)
    margin = 70
    d.rectangle([30, 30, LABEL_W - 30, LABEL_H - 30], outline=(60, 60, 60), width=4)

    f_brand = _load_font(86, bold=True)
    f_type = _load_font(40)
    f_small = _load_font(34)
    f_warn = _load_font(30, bold=True)
    f_warn_body = _load_font(28)

    y = 150
    # Brand (centered)
    bw = d.textlength(spec["brand"], font=f_brand)
    d.text(((LABEL_W - bw) / 2, y), spec["brand"], font=f_brand, fill=(30, 40, 35))
    y += 130
    if spec.get("fanciful"):
        fw = d.textlength(spec["fanciful"], font=f_type)
        d.text(((LABEL_W - fw) / 2, y), spec["fanciful"], font=f_type, fill=(70, 70, 70))
        y += 60
    tw = d.textlength(spec["class_type"], font=f_type)
    d.text(((LABEL_W - tw) / 2, y), spec["class_type"], font=f_type, fill=(70, 70, 70))
    y += 90
    d.line([margin, y, LABEL_W - margin, y], fill=(120, 120, 120), width=2)
    y += 50

    # ABV + net contents (label-side values)
    d.text((margin, y), "%s ALC/VOL" % spec["abv"], font=f_small, fill=(30, 30, 30))
    net = spec["net_contents"]
    nw = d.textlength(net, font=f_small)
    d.text((LABEL_W - margin - nw, y), net, font=f_small, fill=(30, 30, 30))
    y += 70
    d.text((margin, y), "PRODUCT OF %s" % spec["origin"].upper(), font=f_small, fill=(30, 30, 30))

    # Government warning block (or omitted, depending on warning_mode)
    warning_text = mutate(warning_mode)
    if warning_text:
        wy = LABEL_H - 360
        head, rest = warning_text.split(":", 1)
        d.text((margin, wy), head + ":", font=f_warn, fill=(0, 0, 0))
        wy += 42
        for ln in _wrap(d, rest.strip(), f_warn_body, LABEL_W - 2 * margin):
            d.text((margin, wy), ln, font=f_warn_body, fill=(0, 0, 0))
            wy += 36

    if blur:
        img = img.resize((LABEL_W // 3, LABEL_H // 3)).resize((LABEL_W, LABEL_H))
        img = img.filter(ImageFilter.GaussianBlur(2.2))

    return img


def composite_warning_overlay(base: Image.Image, warning_mode: str) -> Image.Image:
    """Overlay a deterministic warning block onto an AI-generated label.

    Used as the guaranteed-flaw fallback when the AI's text rendering can't be
    trusted: the warning is drawn with Pillow on top of whatever the AI produced.
    """
    img = base.copy()
    d = ImageDraw.Draw(img)
    margin = 70
    W, H = img.size
    f_warn = _load_font(30, bold=True)
    f_body = _load_font(28)

    warning_text = mutate(warning_mode)
    if not warning_text:
        return img  # missing — nothing to draw

    # White rectangle behind the warning so it's legible against any background.
    block_h = 280
    d.rectangle([margin - 10, H - block_h - 10, W - margin + 10, H - 30],
                fill=(255, 255, 255), outline=(0, 0, 0), width=2)

    wy = H - block_h
    head, rest = warning_text.split(":", 1)
    d.text((margin, wy), head + ":", font=f_warn, fill=(0, 0, 0))
    wy += 42
    for ln in _wrap(d, rest.strip(), f_body, W - 2 * margin):
        d.text((margin, wy), ln, font=f_body, fill=(0, 0, 0))
        wy += 36
    return img
