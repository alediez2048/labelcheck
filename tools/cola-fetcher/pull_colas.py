#!/usr/bin/env python3
"""
pull_colas.py — Download approved COLA "printable version" pages from TTB's
Public COLA Registry as PDFs, and build a manifest of the typed fields.

Purpose: bootstrap sample data for the LabelCheck verification app and the
golden-set evals (observability.md). The PDFs include both the typed
application fields and the label artwork, which is exactly what the
verification flow consumes.

Why a headless browser: the label image only renders on the printable page and
won't save by hand. A headless browser loads the page exactly like a browser
(image included) and prints it to PDF in one step, so the artwork comes along.
This is the same result as Chrome's "Print → Save as PDF" — better than a
right-click "Save As", which would save the HTML without the image.

This script drives the public registry like a human would: it runs a search,
collects TTB IDs from the result links, then for each one opens the detail
page, clicks "Printable Version", and saves the PDF.

------------------------------------------------------------------------------
SETUP (one time)
    cd tools/cola-fetcher
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    playwright install chromium

RUN
    python pull_colas.py
    # or override the defaults:
    python pull_colas.py --from 01/01/2025 --to 06/30/2025 --count 50

FIRST-RUN TIP
    If it can't find the search fields, run discovery to see the real field
    names, then paste them back and we'll lock them in:
        python pull_colas.py --discover

OUTPUT
    PDFs → /Users/jad/Desktop/LabelCheck/data/sample-colas/pdfs/{ttbid}.pdf
    Manifest → /Users/jad/Desktop/LabelCheck/data/sample-colas/manifest.csv

NOTES
    - Public data, no login. Be polite: a delay between records is built in
      (default 2.5s; raise it if you're pulling a large batch).
    - Re-running skips IDs already saved, so you can stop and resume.
    - PDF generation requires headless Chromium. --headed is for debugging
      the search flow only; PDFs will fail in headed mode.
------------------------------------------------------------------------------
"""

import argparse
import csv
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

SEARCH_URL = "https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do"
DETAIL_URL = ("https://www.ttbonline.gov/colasonline/viewColaDetails.do"
              "?action=publicDisplaySearchBasic&ttbid={ttbid}")

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 "
    "labelcheck-sample-fetcher/1.0 (public COLA data; polite scrape)"
)

HERE = os.path.dirname(os.path.abspath(__file__))
# tools/cola-fetcher/ → ../../data/sample-colas/
DATA_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "data", "sample-colas"))
PASS_DIR = os.path.join(DATA_ROOT, "pdfs")
MANIFEST = os.path.join(DATA_ROOT, "manifest.csv")

MANIFEST_COLS = [
    "ttb_id", "file_name", "brand_name", "fanciful_name",
    "class_type", "origin", "net_contents", "abv",
    "warning_present", "expected_result", "defect_type",
    "source_url", "notes",
]

# Labels as they appear on the COLA Detail page → manifest column
FIELD_LABELS = {
    "brand_name": "Brand Name:",
    "fanciful_name": "Fanciful Name:",
    "class_type": "Class/Type Code:",
    "origin": "Origin Code:",
    "status": "Status:",
    "approval_date": "Approval Date:",
}


def existing_ids():
    """TTB IDs already in the manifest, so we can resume without duplicates."""
    done = set()
    if os.path.exists(MANIFEST):
        with open(MANIFEST, newline="") as f:
            for row in csv.DictReader(f):
                if row.get("ttb_id"):
                    done.add(row["ttb_id"].strip())
    return done


def ensure_manifest():
    os.makedirs(PASS_DIR, exist_ok=True)
    if not os.path.exists(MANIFEST):
        with open(MANIFEST, "w", newline="") as f:
            csv.DictWriter(f, fieldnames=MANIFEST_COLS).writeheader()


def append_row(row):
    with open(MANIFEST, "a", newline="") as f:
        csv.DictWriter(f, fieldnames=MANIFEST_COLS).writerow(row)


def scrape_field(text, label):
    """Pull the value that follows a label on the detail page text."""
    # value runs from the label to the next label or a blank line
    pat = re.escape(label) + r"\s*(.*?)\s*(?:\n|$)"
    m = re.search(pat, text)
    return (m.group(1).strip() if m else "")


def discover(page):
    """Print the search form's inputs and any result links, to fix selectors."""
    page.goto(SEARCH_URL, wait_until="domcontentloaded")
    print("\n--- text inputs on the search form ---")
    for el in page.locator("input[type=text], input:not([type])").all():
        print("  name=%r id=%r" % (el.get_attribute("name"), el.get_attribute("id")))
    print("\n--- selects ---")
    for el in page.locator("select").all():
        print("  name=%r id=%r" % (el.get_attribute("name"), el.get_attribute("id")))
    print("\n--- submit/image buttons ---")
    for el in page.locator("input[type=submit], input[type=image], button").all():
        print("  value=%r alt=%r" % (el.get_attribute("value"), el.get_attribute("alt")))
    print("\nPaste the above back to finalize the selectors if needed.")


def run_search(page, date_from, date_to):
    """Fill the basic search (date range) and submit.

    Field IDs are pinned from the TTB form (verified via --discover):
      #datecompletedfrom  → searchCriteria.dateCompletedFrom
      #datecompletedto    → searchCriteria.dateCompletedTo
    Search button: input[value="Search"] (alt="search COLA database")
    Re-run --discover if the form layout changes.
    """
    page.goto(SEARCH_URL, wait_until="domcontentloaded")
    page.locator("#datecompletedfrom").fill(date_from)
    page.locator("#datecompletedto").fill(date_to)
    page.locator('input[value="Search"]').first.click()
    page.wait_for_load_state("domcontentloaded")


NEXT_SELECTORS = [
    # TTB-specific: exact href pattern verified via --discover-results.
    # The Next link is: <a href="publicPageBasicCola.do?action=page&pgfcn=nextset">Next ></a>
    'a[href*="pgfcn=nextset"]',
    # Generic fallbacks if TTB changes the pattern.
    'a:has-text("Next >>")',
    'a:has-text("Next >")',
    'a:has-text("Next")',
    'a:has-text("›")',
    'a:has-text("»")',
    'input[type="image"][alt*="Next" i]',
    'input[type="image"][src*="next" i]',
    'input[type="submit"][value*="Next" i]',
    'a[onclick*="next" i]',
]


def find_next_button(page):
    """Return a locator for the results 'Next' control, or None if not found."""
    for sel in NEXT_SELECTORS:
        loc = page.locator(sel)
        if loc.count() > 0:
            return loc.first
    return None


def parse_result_count(page):
    """Extract 'N of M' from the results header, if present. Returns (shown, total) or None."""
    body = page.inner_text("body")
    # Patterns like "1 - 20 of 1543" or "Records 1 to 20 of 1543"
    m = re.search(r"(\d+)\s*(?:-|to)\s*(\d+)\s*of\s*([\d,]+)", body, re.I)
    if m:
        try:
            return int(m.group(2)), int(m.group(3).replace(",", ""))
        except ValueError:
            return None
    return None


def collect_ids(page, target, verbose=False):
    """Walk result pages, collecting TTB IDs until we have `target` of them."""
    ids, seen = [], set()
    page_num = 1
    while len(ids) < target:
        # TTB IDs live in the viewColaDetails links on each results page.
        html = page.content()
        new_on_page = 0
        for tid in re.findall(r"ttbid=(\d+)", html):
            if tid not in seen:
                seen.add(tid)
                ids.append(tid)
                new_on_page += 1
                if len(ids) >= target:
                    break
        count_info = parse_result_count(page)
        if verbose or page_num == 1:
            if count_info:
                shown, total = count_info
                print("  page %d: %d new IDs (server shows up to %d of %d total)" %
                      (page_num, new_on_page, shown, total))
            else:
                print("  page %d: %d new IDs" % (page_num, new_on_page))
        if len(ids) >= target:
            break
        # Try to advance to the next results page.
        nxt = find_next_button(page)
        if nxt is None:
            print("  no 'Next' button found on page %d — stopping (got %d IDs)" %
                  (page_num, len(ids)))
            print("  if more results were expected, run --discover-results to inspect the page")
            break
        try:
            before_url = page.url
            # Use expect_navigation so we don't read page.content() before the new page lands.
            with page.expect_navigation(wait_until="domcontentloaded", timeout=20000):
                nxt.click()
            page.wait_for_load_state("networkidle", timeout=15000)
            after_url = page.url
            page_num += 1
            if verbose:
                # Show only the path+query, not the full URL.
                short = lambda u: u.split("ttbonline.gov", 1)[-1] if "ttbonline.gov" in u else u
                print("  navigated %s → %s" % (short(before_url), short(after_url)))
        except PWTimeout:
            print("  navigation timed out on page %d — stopping" % page_num)
            break
    return ids[:target]


def discover_results(page, date_from, date_to):
    """Run a search, then print the results page's links and buttons so we can pin pagination."""
    print("Running search to load a results page ...")
    run_search(page, date_from, date_to)
    print("\n--- result-count info ---")
    info = parse_result_count(page)
    print("  parsed:", info)
    print("\n--- all anchor texts (deduped) ---")
    seen = set()
    for el in page.locator("a").all():
        t = (el.inner_text() or "").strip()
        if t and t not in seen and len(t) < 40:
            seen.add(t)
            print("  text=%r href=%r" % (t, el.get_attribute("href")))
    print("\n--- input[type=image] (legacy pagination) ---")
    for el in page.locator('input[type="image"]').all():
        print("  alt=%r src=%r" % (el.get_attribute("alt"), el.get_attribute("src")))
    print("\n--- input[type=submit] ---")
    for el in page.locator('input[type="submit"]').all():
        print("  value=%r name=%r" % (el.get_attribute("value"), el.get_attribute("name")))
    print("\nIf the 'Next' control is visible above and the script missed it,")
    print("paste its identifying attributes back and we'll add the selector.")


def save_one(context, ttbid, delay):
    """Open a COLA's detail + printable pages; save PDF and return a manifest row."""
    page = context.new_page()
    try:
        url = DETAIL_URL.format(ttbid=ttbid)
        page.goto(url, wait_until="networkidle")
        body = page.inner_text("body")

        fields = {k: scrape_field(body, lbl) for k, lbl in FIELD_LABELS.items()}
        status = fields.get("status", "")

        # Open the Printable Version (often a new tab) and print it to PDF.
        pdf_path = os.path.join(PASS_DIR, "%s.pdf" % ttbid)
        printable = None
        link = page.get_by_role("link", name=re.compile("Printable", re.I))
        if link.count():
            try:
                with context.expect_page() as pop:
                    link.first.click()
                printable = pop.value
            except PWTimeout:
                printable = page  # opened in same tab
        target_page = printable or page
        target_page.wait_for_load_state("networkidle")
        time.sleep(1.0)  # let the label image settle
        target_page.pdf(path=pdf_path, format="Letter", print_background=True)
        if printable and printable is not page:
            printable.close()

        return {
            "ttb_id": ttbid,
            "file_name": "%s.pdf" % ttbid,
            "brand_name": fields.get("brand_name", ""),
            "fanciful_name": fields.get("fanciful_name", ""),
            "class_type": fields.get("class_type", ""),
            "origin": fields.get("origin", ""),
            "net_contents": "",   # usually only on the label image; fill from PDF later
            "abv": "",            # field 12 on the printable form; fill from PDF later
            "warning_present": "",
            "expected_result": "match",
            "defect_type": "none",
            "source_url": url,
            "notes": "status %s" % status,
        }
    finally:
        page.close()
        time.sleep(delay)


def main():
    ap = argparse.ArgumentParser(
        description="Download approved COLAs from TTB's Public COLA Registry as PDFs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--from", dest="date_from", default="01/01/2025",
                    help="Date Completed from (MM/DD/YYYY). Default: 01/01/2025")
    ap.add_argument("--to", dest="date_to", default="12/31/2025",
                    help="Date Completed to (MM/DD/YYYY). Default: 12/31/2025")
    ap.add_argument("--count", type=int, default=100,
                    help="How many to download. Default: 100")
    ap.add_argument("--delay", type=float, default=2.5,
                    help="Seconds between records (be polite). Default: 2.5")
    ap.add_argument("--approved-only", action="store_true",
                    help="Skip records whose status is not APPROVED")
    ap.add_argument("--discover", action="store_true",
                    help="Print the search form fields and exit (debugging)")
    ap.add_argument("--discover-results", action="store_true",
                    help="Run a search, then print the results page's links and buttons (debugging pagination)")
    ap.add_argument("--headed", action="store_true",
                    help="Show the browser (for debugging only; PDFs require headless)")
    args = ap.parse_args()

    if args.headed and not args.discover:
        print("WARNING: --headed is for debugging the search flow only. "
              "PDF generation requires headless Chromium and will fail.\n")

    ensure_manifest()
    done = existing_ids()
    if done:
        print("Resuming: %d already in the manifest, will skip those." % len(done))
    print("Output directory: %s" % PASS_DIR)
    print("Manifest:         %s" % MANIFEST)

    with sync_playwright() as p:
        # PDF printing requires headless Chromium.
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(
            accept_downloads=True,
            user_agent=USER_AGENT,
        )
        page = context.new_page()

        if args.discover:
            discover(page)
            browser.close()
            return

        if args.discover_results:
            discover_results(page, args.date_from, args.date_to)
            browser.close()
            return

        print("\nSearching %s to %s ..." % (args.date_from, args.date_to))
        run_search(page, args.date_from, args.date_to)
        # collect extra so we still hit the target after skips
        ids = collect_ids(page, args.count + len(done) + 25, verbose=True)
        ids = [t for t in ids if t not in done]
        print("Found %d new TTB IDs. Downloading up to %d." % (len(ids), args.count))

        saved = 0
        for tid in ids:
            if saved >= args.count:
                break
            try:
                row = save_one(context, tid, args.delay)
                if args.approved_only and row["notes"].upper().find("APPROVED") < 0:
                    print("  skip %s (status not APPROVED)" % tid)
                    continue
                append_row(row)
                saved += 1
                print("  [%d/%d] saved %s  %s" %
                      (saved, args.count, tid, row["brand_name"][:40]))
            except Exception as e:
                print("  !! %s failed: %s" % (tid, e))

        browser.close()
        print("\nDone. %d PDFs in %s" % (saved, PASS_DIR))
        print("Manifest: %s" % MANIFEST)


if __name__ == "__main__":
    sys.exit(main())
