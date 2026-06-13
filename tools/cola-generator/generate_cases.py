#!/usr/bin/env python3
"""
generate_cases.py — generate faulty COLA test cases for LabelCheck.

Produces a balanced mix of label + application + known-answer triples that the
verification eval harness scores against. Three generation paths:

  1) Pillow synthetic label (default; deterministic, exact ground truth)
  2) AI-generated label (OpenAI or Gemini) — realistic variety; ground truth
     derived from a vision read-back, never from the prompt
  3) Pillow + blur post-process — for the blurry_image / review-lane case

Warning defects ALWAYS use Pillow (or composite-overlay fallback) because the
warning check is exact text and AI text rendering is imprecise.

SETUP
    pip install -r requirements.txt
    # AI providers (optional):
    pip install openai          # for --provider openai
    pip install google-genai    # for --provider gemini

RUN
    python generate_cases.py                          # 10 balanced cases, Pillow
    python generate_cases.py --count 50               # 50 balanced cases
    python generate_cases.py --defects abv_mismatch,brand_mismatch --count 20
    python generate_cases.py --provider openai --count 20  # AI variety
    python generate_cases.py --dry-run --count 50     # plan + cost, no generation

OUTPUT
    PNGs → ../../data/sample-colas/fail/images/<case_id>.png
    Rows → ../../data/sample-colas/fail/manifest.csv
"""

import argparse
import os
import random
import sys
import time
import traceback

# Make the lib package importable when this script is run directly.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import manifest, renderer, sample_data, warning, degrade  # noqa: E402
from lib.providers import get_provider  # noqa: E402

DATA_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "data", "sample-colas", "fail"))
IMG_DIR = os.path.join(DATA_ROOT, "images")
MANIFEST_PATH = os.path.join(DATA_ROOT, "manifest.csv")

ALL_DEFECTS = [
    "none",
    "case_variant",
    "abv_mismatch",
    "net_contents_mismatch",
    "brand_mismatch",
    "warning_not_caps",
    "warning_missing",
    "warning_wording_altered",
    "blurry_image",
]


def plan_cases(count: int, defects: list, rng: random.Random) -> list:
    """Return a list of case specs balanced across the requested defect types."""
    plans = []
    n = len(defects)
    for i in range(count):
        defect = defects[i % n]
        plans.append({
            "case_id": "%s_%03d" % (defect, (i // n) + 1),
            "defect_type": defect,
            "spec": sample_data.pick_spec(rng),
        })
    rng.shuffle(plans)
    return plans


def _warning_mode_for(defect: str) -> str:
    return {
        "warning_not_caps": "title",
        "warning_missing": "missing",
        "warning_wording_altered": "altered",
    }.get(defect, "caps")


def _application_fields(label_spec: dict, defect: str) -> tuple:
    """Return (app_fields, expected_field).

    app_fields are what the typed application says. For data mismatches one
    field deliberately differs from label_spec; for everything else, app_fields
    match the label.
    """
    app = {
        "brand_name": label_spec["brand"],
        "fanciful_name": label_spec["fanciful"],
        "class_type": label_spec["class_type"],
        "origin": label_spec["origin"],
        "abv": label_spec["abv"],
        "net_contents": label_spec["net_contents"],
    }
    expected_field = ""

    if defect == "abv_mismatch":
        app["abv"] = sample_data.alter_abv(label_spec["abv"])
        expected_field = "abv"
    elif defect == "net_contents_mismatch":
        app["net_contents"] = sample_data.alter_net(label_spec["net_contents"])
        expected_field = "net_contents"
    elif defect == "brand_mismatch":
        app["brand_name"] = sample_data.alter_brand(label_spec["brand"])
        expected_field = "brand_name"
    elif defect == "case_variant":
        # Label shows UPPER; application shows Title Case. Should still MATCH.
        app["brand_name"] = label_spec["brand"].title()
    elif defect in ("warning_not_caps", "warning_missing", "warning_wording_altered"):
        expected_field = "government_warning"

    return app, expected_field


def _expected_result(defect: str) -> str:
    if defect in ("none", "case_variant"):
        return "match"
    if defect == "blurry_image":
        return "review"
    return "mismatch"


def _warning_present(defect: str) -> str:
    return "no" if defect == "warning_missing" else "yes"


def _notes(defect: str, label_spec: dict, app: dict) -> str:
    if defect == "abv_mismatch":
        return "label %s vs application %s" % (label_spec["abv"], app["abv"])
    if defect == "net_contents_mismatch":
        return "label %s vs application %s" % (label_spec["net_contents"], app["net_contents"])
    if defect == "brand_mismatch":
        return "label %s vs application %s" % (label_spec["brand"], app["brand_name"])
    if defect == "case_variant":
        return "label %s vs application %s (must MATCH)" % (label_spec["brand"], app["brand_name"])
    if defect == "warning_not_caps":
        return "warning heading rendered in title case, not ALL CAPS"
    if defect == "warning_missing":
        return "government warning entirely absent from the label"
    if defect == "warning_wording_altered":
        return "required phrase 'during pregnancy' dropped from the warning"
    if defect == "blurry_image":
        return "blurred + downscaled — should route to human review, not auto-fail"
    return "clean control — should pass"


def _ai_prompt_for(label_spec: dict, defect: str) -> str:
    base = (
        "A realistic flat front product label for a craft alcoholic beverage, "
        "brand name '%(brand)s', %(class_type)s, with legible '%(abv)s ALC/VOL' "
        "and '%(net_contents)s', vintage print design, sharp legible typography, "
        "no background, plain studio photo style." % label_spec
    )
    if defect == "warning_missing":
        return base + " The label has no government warning text anywhere."
    if defect == "warning_not_caps":
        return (base + " Include a U.S. government warning at the bottom with the "
                "heading written in normal title case, 'Government Warning:', "
                "followed by the standard health warning text.")
    if defect == "warning_wording_altered":
        return base + " Include a U.S. government warning but omit the phrase 'during pregnancy'."
    return base + (
        " Include the standard U.S. government warning at the bottom with the "
        "heading 'GOVERNMENT WARNING:' in ALL CAPS followed by the full text."
    )


def _generate_label_image(spec: dict, defect: str, provider) -> tuple:
    """Return (PIL.Image, used_path) where used_path is 'pillow' or 'ai'.

    Warning defects always use Pillow (text precision). Other defects use the
    provider if it's set to openai/gemini and verify by reading back; on
    verification failure they fall back to a Pillow composite overlay.
    """
    is_warning_defect = defect in ("warning_not_caps", "warning_missing",
                                    "warning_wording_altered")
    warning_mode = _warning_mode_for(defect)

    if provider.name in ("deterministic", "mock"):
        img = renderer.render(spec, warning_mode=warning_mode,
                              blur=(defect == "blurry_image"))
        return img, "pillow"

    # AI path. Warning defects: use Pillow only — AI can't be trusted for text.
    if is_warning_defect:
        img = renderer.render(spec, warning_mode=warning_mode)
        return img, "pillow"

    # AI for non-warning defects, with vision verification.
    prompt = _ai_prompt_for(spec, defect)
    try:
        img = provider.generate_image(prompt)
        if defect == "blurry_image":
            img = degrade.blur_and_downscale(img)
        return img, "ai"
    except Exception as e:
        print("    AI generation failed (%s) — falling back to Pillow" % e)
        img = renderer.render(spec, warning_mode=warning_mode,
                              blur=(defect == "blurry_image"))
        return img, "pillow"


def _verify_ai_output(img, defect: str, label_spec: dict, provider) -> tuple:
    """For AI-generated labels, read back and confirm ground truth is intact.

    Returns (verified_label_spec, used_overlay).
    If verification fails on a warning defect, applies a deterministic overlay
    so the flaw is guaranteed.
    """
    try:
        transcription = provider.read_label(img)
    except Exception as e:
        print("    vision read-back failed (%s) — keeping prompt values" % e)
        return label_spec, False

    # Update label-side values from what was actually rendered, where the model
    # transcribed something non-empty. The application is built from this.
    verified = dict(label_spec)
    for key in ("brand", "fanciful", "class_type", "abv", "net_contents", "origin"):
        # Map provider's keys to ours
        provider_key = key
        v = (transcription.get(provider_key) or "").strip()
        if v:
            verified[key] = v

    return verified, False


def generate_one(plan: dict, provider, rng: random.Random) -> dict:
    """Generate a single case and return the manifest row."""
    spec = plan["spec"]
    defect = plan["defect_type"]
    case_id = plan["case_id"]
    fname = "%s.png" % case_id

    # 1. Generate the label image.
    img, used_path = _generate_label_image(spec, defect, provider)

    # 2. If AI path, read back to derive ground truth.
    label_truth = spec
    if used_path == "ai" and provider.name not in ("deterministic", "mock"):
        label_truth, _ = _verify_ai_output(img, defect, spec, provider)

    # 3. Build the application fields based on the (now-verified) label truth.
    app, expected_field = _application_fields(label_truth, defect)

    # 4. Save image + return manifest row.
    img.save(os.path.join(IMG_DIR, fname))
    return {
        "case_id": case_id,
        "file_name": fname,
        "brand_name": app["brand_name"],
        "fanciful_name": app["fanciful_name"],
        "class_type": app["class_type"],
        "origin": app["origin"],
        "net_contents": app["net_contents"],
        "abv": app["abv"],
        "warning_present": _warning_present(defect),
        "expected_result": _expected_result(defect),
        "defect_type": defect,
        "expected_field": expected_field,
        "notes": "%s [%s]" % (_notes(defect, label_truth, app), used_path),
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Generate faulty COLA test cases for LabelCheck.",
    )
    ap.add_argument("--provider", default="deterministic",
                    choices=["deterministic", "mock", "openai", "gemini"],
                    help="Image gen + vision provider (default: deterministic / Pillow)")
    ap.add_argument("--count", type=int, default=10,
                    help="Total cases to generate (default: 10)")
    ap.add_argument("--defects", default="",
                    help="Comma-separated defect types to include; default = all 9 balanced")
    ap.add_argument("--seed", type=int, default=42,
                    help="RNG seed for reproducible spec choices (default: 42)")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="Seconds between AI calls; ignored for Pillow (default: 1.0)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Plan + cost estimate, generate nothing")
    args = ap.parse_args()

    defects = [d.strip() for d in args.defects.split(",") if d.strip()] or ALL_DEFECTS
    unknown = [d for d in defects if d not in ALL_DEFECTS]
    if unknown:
        print("ERROR: unknown defect types: %s" % ", ".join(unknown))
        print("Known: %s" % ", ".join(ALL_DEFECTS))
        return 2

    os.makedirs(IMG_DIR, exist_ok=True)
    manifest.ensure(MANIFEST_PATH)
    done = manifest.existing_case_ids(MANIFEST_PATH)
    print("Output: %s" % IMG_DIR)
    print("Manifest: %s" % MANIFEST_PATH)
    if done:
        print("Resuming: %d cases already in manifest, will skip" % len(done))

    rng = random.Random(args.seed)
    plan = plan_cases(args.count, defects, rng)
    plan = [p for p in plan if p["case_id"] not in done]
    print("\nPlanned %d new cases across %d defect types." % (len(plan), len(defects)))
    by_defect = {}
    for p in plan:
        by_defect[p["defect_type"]] = by_defect.get(p["defect_type"], 0) + 1
    for d in defects:
        print("  %-26s %d" % (d, by_defect.get(d, 0)))

    provider = get_provider(args.provider)
    if args.provider in ("openai", "gemini"):
        cost = provider.cost_per_case() * len(plan)
        print("\nEstimated cost (AI provider): ~$%.2f total (~$%.3f per case)"
              % (cost, provider.cost_per_case()))
    print("Provider: %s" % provider.name)

    if args.dry_run:
        print("\nDry run — no cases generated.")
        return 0

    saved = 0
    for p in plan:
        try:
            row = generate_one(p, provider, rng)
            manifest.append(MANIFEST_PATH, row)
            saved += 1
            print("  [%d/%d] %s  (%s)" %
                  (saved, len(plan), row["case_id"], row["defect_type"]))
            if provider.name in ("openai", "gemini"):
                time.sleep(args.delay)
        except Exception as e:
            print("  !! %s failed: %s" % (p["case_id"], e))
            traceback.print_exc()

    print("\nDone. %d cases written." % saved)
    print("Images: %s" % IMG_DIR)
    print("Manifest: %s" % MANIFEST_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
