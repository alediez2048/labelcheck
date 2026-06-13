"""Canonical 27 CFR 16.21 government warning text + the defect mutators.

Single source of truth: the verbatim warning string. The verifier checks the
label-side warning against this exact text (presence, wording, ALL CAPS).
The mutators here produce the planted flaws for the warning-defect cases.
"""

CANONICAL_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should "
    "not drink alcoholic beverages during pregnancy because of the risk of "
    "birth defects. (2) Consumption of alcoholic beverages impairs your "
    "ability to drive a car or operate machinery, and may cause health "
    "problems."
)


def mutate(mode: str) -> str:
    """Return the warning string with the requested defect baked in.

    mode:
      'caps'    - canonical, no defect
      'title'   - heading rendered in title case (warning_not_caps)
      'altered' - drop the required phrase 'during pregnancy' (warning_wording_altered)
      'missing' - empty string (warning_missing)
    """
    if mode == "missing":
        return ""
    if mode == "caps":
        return CANONICAL_WARNING
    if mode == "title":
        return CANONICAL_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:")
    if mode == "altered":
        return CANONICAL_WARNING.replace("during pregnancy ", "")
    raise ValueError("unknown warning mode: %r" % mode)


def verify_flaw_present(transcribed_warning: str, mode: str) -> bool:
    """Confirm the planted flaw is actually present in the AI-rendered output.

    Used by the AI path: after generation, the vision model transcribes the
    label, and this function confirms the flaw landed. If not, the caller
    falls back to a deterministic composite overlay.
    """
    t = transcribed_warning or ""
    if mode == "caps":
        return "GOVERNMENT WARNING:" in t
    if mode == "missing":
        # No warning text on the label at all (loose check tolerant of OCR noise).
        return "GOVERNMENT WARNING" not in t.upper()
    if mode == "title":
        # Title case heading present, ALL CAPS heading absent.
        return "Government Warning:" in t and "GOVERNMENT WARNING:" not in t
    if mode == "altered":
        # Heading present, required phrase 'during pregnancy' absent.
        return "GOVERNMENT WARNING:" in t.upper() and "during pregnancy" not in t.lower()
    raise ValueError("unknown warning mode: %r" % mode)
