"""TTB Form 5100.31 mimic — assembles a single-page PDF that looks like the
real "Application for and Certification/Exemption of Label/Bottle Approval"
form, with our synthetic application fields filled in and the AI-generated
label embedded at the AFFIX section.

Layout follows the real form (OMB No. 1512-0092):
  - Header strip:    OMB No., DEPARTMENT OF THE TREASURY, full title, TTB ID
  - PART I:          18 numbered application fields in a grid
  - PART II:         Applicant's Certification + date + signature + print name
  - PART III:        TTB Certificate + date issued + TTB signature
  - AFFIX section:   label image with image-type + dimensions caption

A diagonal "SYNTHETIC TEST CASE" watermark sits behind everything so the
document can't be mistaken for a real COLA.
"""

import os
from typing import Optional

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

PAGE_W, PAGE_H = LETTER
MARGIN = 0.4 * inch  # tighter than my first draft, matches the real form's density


def render_case_pdf(out_path: str, case: dict, label_image_path: Optional[str]) -> None:
    """Write a single-page TTB-mimic PDF for one defect case."""
    c = canvas.Canvas(out_path, pagesize=LETTER)

    _draw_watermark(c, case["case_id"])
    y = PAGE_H - MARGIN
    y = _draw_header(c, y, case)
    y = _draw_part_one(c, y, case)
    y = _draw_part_two(c, y, case)
    y = _draw_part_three(c, y, case)
    _draw_affix_section(c, y, label_image_path)
    _draw_form_footer(c)

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Watermark
# ---------------------------------------------------------------------------

def _draw_watermark(c: canvas.Canvas, case_id: str) -> None:
    """Diagonal SYNTHETIC TEST CASE behind all content."""
    c.saveState()
    c.setFillColorRGB(0.85, 0.85, 0.85)
    c.setFont("Helvetica-Bold", 60)
    c.translate(PAGE_W / 2, PAGE_H / 2)
    c.rotate(35)
    c.drawCentredString(0, 0, "SYNTHETIC TEST CASE")
    c.setFont("Helvetica", 18)
    c.drawCentredString(0, -50, case_id)
    c.restoreState()


# ---------------------------------------------------------------------------
# Header strip
# ---------------------------------------------------------------------------

def _draw_header(c: canvas.Canvas, y: float, case: dict) -> float:
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN, y, "OMB No. 1512-0092  (01/31/2009)")
    c.drawRightString(PAGE_W - MARGIN, y, "FOR TTB USE ONLY")
    y -= 11

    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(PAGE_W / 2, y, "DEPARTMENT OF THE TREASURY")
    y -= 11
    c.drawCentredString(PAGE_W / 2, y, "ALCOHOL AND TOBACCO TAX AND TRADE BUREAU")
    y -= 14

    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W / 2, y, "APPLICATION FOR AND")
    y -= 13
    c.drawCentredString(PAGE_W / 2, y, "CERTIFICATION/EXEMPTION OF LABEL/BOTTLE")
    y -= 13
    c.drawCentredString(PAGE_W / 2, y, "APPROVAL")
    y -= 11
    c.setFont("Helvetica-Oblique", 7)
    c.drawCentredString(
        PAGE_W / 2, y,
        "(See Instructions and Paperwork Reduction Act Notice on Back)"
    )
    y -= 14

    # TTB ID box (right side)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(PAGE_W - MARGIN - 1.5 * inch, y + 28, "TTB ID")
    c.setLineWidth(0.6)
    c.rect(PAGE_W - MARGIN - 1.5 * inch, y + 8, 1.5 * inch, 18)
    c.setFont("Helvetica", 9)
    c.drawString(PAGE_W - MARGIN - 1.5 * inch + 6, y + 14, case["case_id"])
    return y - 6


# ---------------------------------------------------------------------------
# Part I
# ---------------------------------------------------------------------------

def _draw_part_one(c: canvas.Canvas, y: float, case: dict) -> float:
    y = _section_header(c, y, "PART I - APPLICATION")

    inner_w = PAGE_W - 2 * MARGIN
    col_w = inner_w / 4.0

    # Row 1: fields 2-4 + Part of field 1 (REP. ID checkbox)
    row1_top = y
    row1_h = 36
    _field_box(c, MARGIN, y - row1_h, col_w, row1_h,
               "1. REP. ID. NO. (If any)", "")
    _field_box(c, MARGIN + col_w, y - row1_h, col_w, row1_h,
               "2. PLANT REGISTRY/BASIC PERMIT/BREWER'S NO. (Required)",
               "N/A (synthetic)")
    _field_box(c, MARGIN + 2 * col_w, y - row1_h, col_w, row1_h,
               "3. SERIAL NUMBER (Required)", "TEST-" + case["case_id"][:8].upper())
    _field_box(c, MARGIN + 3 * col_w, y - row1_h, col_w, row1_h,
               "4. TYPE OF PRODUCT (Required)",
               _type_of_product(case.get("class_type", "")))
    y -= row1_h

    # Row 2: field 5 BRAND (half) + field 6 FANCIFUL (half)
    row2_h = 32
    _field_box(c, MARGIN, y - row2_h, 2 * col_w, row2_h,
               "5. BRAND NAME (Required)", case.get("brand_name") or "")
    _field_box(c, MARGIN + 2 * col_w, y - row2_h, 2 * col_w, row2_h,
               "6. FANCIFUL NAME (If any)", case.get("fanciful_name") or "")
    y -= row2_h

    # Row 3: field 7 applicant (full width)
    row3_h = 50
    _field_box(c, MARGIN, y - row3_h, inner_w, row3_h,
               "7. NAME AND ADDRESS OF APPLICANT AS SHOWN ON PLANT REGISTRY, "
               "BASIC PERMIT OR BREWER'S NOTICE (Required)",
               "SYNTHETIC TEST APPLICANT\n"
               "(generated by cola-assembler)\n"
               "Origin: %s" % (case.get("origin") or ""))
    y -= row3_h

    # Row 4: fields 8 + 9 + 10
    row4_h = 28
    _field_box(c, MARGIN, y - row4_h, 2 * col_w, row4_h,
               "8. EMAIL ADDRESS", "synthetic@example.test")
    _field_box(c, MARGIN + 2 * col_w, y - row4_h, col_w, row4_h,
               "9. FORMULA/SOP NO. (If any)", "")
    _field_box(c, MARGIN + 3 * col_w, y - row4_h, col_w, row4_h,
               "10. LAB. NO./DATE (If any)", "")
    y -= row4_h

    # Row 5: fields 11, 12, 13, 14
    row5_h = 30
    _field_box(c, MARGIN, y - row5_h, col_w, row5_h,
               "11. NET CONTENTS", case.get("net_contents") or "")
    _field_box(c, MARGIN + col_w, y - row5_h, col_w, row5_h,
               "12. ALCOHOL CONTENT", case.get("abv") or "")
    _field_box(c, MARGIN + 2 * col_w, y - row5_h, col_w, row5_h,
               "13. WINE APPELLATION (If on label)", "")
    _field_box(c, MARGIN + 3 * col_w, y - row5_h, col_w, row5_h,
               "14. WINE VINTAGE DATE (If on label)", "")
    y -= row5_h

    # Row 6: fields 15, 16, and 17 spanning the right half (type of application)
    row6_h = 56
    _field_box(c, MARGIN, y - row6_h, col_w, row6_h,
               "15. PHONE NUMBER", "(555) 555-0100")
    _field_box(c, MARGIN + col_w, y - row6_h, col_w, row6_h,
               "16. FAX NUMBER", "")
    _field_box(c, MARGIN + 2 * col_w, y - row6_h, 2 * col_w, row6_h,
               "17. TYPE OF APPLICATION (Check applicable box(es))",
               "[X] a. CERTIFICATE OF LABEL APPROVAL\n"
               "[ ] b. CERTIFICATE OF EXEMPTION FROM LABEL APPROVAL\n"
               "[ ] c. DISTINCTIVE LIQUOR BOTTLE APPROVAL\n"
               "[ ] d. RESUBMISSION AFTER REJECTION")
    y -= row6_h

    # Row 7: field 18 (full width)
    row7_h = 32
    _field_box(c, MARGIN, y - row7_h, inner_w, row7_h,
               "18. SHOW ANY WORDING APPEARING ON CONTAINER MATERIALS OTHER "
               "THAN LABELS AFFIXED BELOW",
               case.get("net_contents") or "")
    y -= row7_h
    return y - 4


def _type_of_product(class_type: str) -> str:
    """Render the field 4 checkbox column based on class/type."""
    t = (class_type or "").upper()
    wine = "WINE" in t or "TABLE" in t or "PINOT" in t or "CHARDONNAY" in t
    malt = "BEER" in t or "ALE" in t or "LAGER" in t or "MALT" in t or "IPA" in t
    spirit = not (wine or malt)
    return (
        ("[X]" if wine else "[ ]") + " WINE\n"
        + ("[X]" if spirit else "[ ]") + " DISTILLED SPIRITS\n"
        + ("[X]" if malt else "[ ]") + " MALT BEVERAGE"
    )


# ---------------------------------------------------------------------------
# Part II
# ---------------------------------------------------------------------------

def _draw_part_two(c: canvas.Canvas, y: float, case: dict) -> float:
    y = _section_header(c, y, "PART II - APPLICANT'S CERTIFICATION")

    inner_w = PAGE_W - 2 * MARGIN

    legalese = (
        "Under the penalties of perjury, I declare; that all statements appearing "
        "on this application are true and correct to the best of my knowledge "
        "and belief; and, that the representations on the labels attached to this "
        "form, including supplemental documents, truly and correctly represent "
        "the content of the containers to which these labels will be applied."
    )
    c.setFont("Helvetica", 6.5)
    y = _draw_wrapped(c, MARGIN, y, inner_w, legalese, line_h=8)

    y -= 4
    col_w = inner_w / 3.0
    row_h = 26
    _field_box(c, MARGIN, y - row_h, col_w, row_h,
               "19. DATE OF APPLICATION", "synthetic")
    _field_box(c, MARGIN + col_w, y - row_h, col_w, row_h,
               "20. SIGNATURE OF APPLICANT", "(synthetic / e-filed)")
    _field_box(c, MARGIN + 2 * col_w, y - row_h, col_w, row_h,
               "21. PRINT NAME OF APPLICANT", "SYNTHETIC TEST APPLICANT")
    return y - row_h - 4


# ---------------------------------------------------------------------------
# Part III
# ---------------------------------------------------------------------------

def _draw_part_three(c: canvas.Canvas, y: float, case: dict) -> float:
    y = _section_header(c, y, "PART III - TTB CERTIFICATE")

    inner_w = PAGE_W - 2 * MARGIN
    legalese = (
        "This certificate is issued subject to applicable laws, regulations and "
        "conditions as set forth in the instructions portion of this form."
    )
    c.setFont("Helvetica", 6.5)
    y = _draw_wrapped(c, MARGIN, y, inner_w, legalese, line_h=8)

    y -= 4
    row_h = 24
    half = inner_w / 2.0
    _field_box(c, MARGIN, y - row_h, half, row_h,
               "22. DATE ISSUED", "PENDING REVIEW")
    _field_box(c, MARGIN + half, y - row_h, half, row_h,
               "23. AUTHORIZED SIGNATURE, TTB", "(pending)")
    y -= row_h

    # Class/Type description box on the right (mimics the FOR TTB USE ONLY block)
    qb_h = 26
    _field_box(c, MARGIN, y - qb_h, half, qb_h,
               "STATUS", "PENDING REVIEW (synthetic)")
    _field_box(c, MARGIN + half, y - qb_h, half, qb_h,
               "CLASS/TYPE DESCRIPTION", case.get("class_type") or "")
    return y - qb_h - 6


# ---------------------------------------------------------------------------
# AFFIX section + label
# ---------------------------------------------------------------------------

def _draw_affix_section(c: canvas.Canvas, y: float, label_image_path: Optional[str]) -> None:
    inner_w = PAGE_W - 2 * MARGIN
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN, y, "AFFIX COMPLETE SET OF LABELS BELOW")
    y -= 12
    c.setFont("Helvetica-Oblique", 7)
    c.drawString(MARGIN, y, "Image Type: Brand (front) — synthetic for test set")
    y -= 10

    available_h = y - MARGIN
    if available_h < 1.5 * inch:
        return  # no room

    if label_image_path and os.path.exists(label_image_path):
        try:
            reader = ImageReader(label_image_path)
            iw, ih = reader.getSize()
            scale = min(inner_w / iw, available_h / ih)
            draw_w = iw * scale
            draw_h = ih * scale
            x = MARGIN + (inner_w - draw_w) / 2
            y_img = y - draw_h
            c.drawImage(reader, x, y_img, width=draw_w, height=draw_h,
                        preserveAspectRatio=True, mask="auto")
            return
        except Exception:
            pass

    # Placeholder if image missing.
    c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.setDash(4, 3)
    c.rect(MARGIN, MARGIN, inner_w, available_h)
    c.setDash()
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.setFont("Helvetica-Oblique", 10)
    c.drawCentredString(PAGE_W / 2, MARGIN + available_h / 2,
                        "[ label image missing ]")
    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0, 0, 0)


# ---------------------------------------------------------------------------
# Form footer
# ---------------------------------------------------------------------------

def _draw_form_footer(c: canvas.Canvas) -> None:
    c.setFont("Helvetica", 6)
    c.drawString(MARGIN, 0.2 * inch,
                 "TTB F 5100.31 (6/2006) — synthetic test set, "
                 "not a real form. Generated by cola-assembler.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section_header(c: canvas.Canvas, y: float, title: str) -> float:
    c.setFillColorRGB(0.85, 0.85, 0.85)
    c.rect(MARGIN, y - 12, PAGE_W - 2 * MARGIN, 12, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(MARGIN + 4, y - 9, title)
    return y - 14


def _field_box(c: canvas.Canvas, x: float, y: float, w: float, h: float,
               label: str, value: str) -> None:
    c.setLineWidth(0.4)
    c.rect(x, y, w, h)
    # Label (small, top-left of the box)
    c.setFont("Helvetica-Bold", 6)
    label_lines = _wrap_text(c, label, w - 6, font="Helvetica-Bold", size=6)
    lyy = y + h - 7
    for ln in label_lines[:2]:
        c.drawString(x + 3, lyy, ln)
        lyy -= 7
    # Value (larger, below the label)
    c.setFont("Helvetica", 8)
    vyy = lyy - 2
    for ln in str(value or "").split("\n"):
        for piece in _wrap_text(c, ln, w - 6, font="Helvetica", size=8):
            if vyy < y + 2:
                break
            c.drawString(x + 3, vyy, piece)
            vyy -= 9


def _wrap_text(c: canvas.Canvas, text: str, max_w: float,
               font: str = "Helvetica", size: int = 8) -> list:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _draw_wrapped(c: canvas.Canvas, x: float, y: float, max_w: float,
                  text: str, line_h: int = 9) -> float:
    """Draw paragraph wrapped to max_w. Returns the new y position."""
    cur_font = "Helvetica"
    cur_size = 6.5
    lines = _wrap_text(c, text, max_w, font=cur_font, size=cur_size)
    for ln in lines:
        c.drawString(x, y - line_h + 2, ln)
        y -= line_h
    return y
