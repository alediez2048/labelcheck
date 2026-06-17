/**
 * Client-side PDF utilities (P5-8).
 *
 * Runs in the BROWSER only. Uses pdfjs-dist to:
 *   1. Extract the page-1 text → handed off to parseColaForm.
 *   2. Render a target page to a PNG (base64) → uploaded as the
 *      label face.
 *
 * Vercel-safe by construction: the server never imports this module
 * because it never touches PDFs. All processing happens on the
 * operator's machine before the payload reaches /api/batch.
 *
 * pdfjs-dist worker: loaded from /pdf.worker.min.mjs which is copied
 * into public/ at install time.
 *
 * IMPORTANT — buffer lifetime: pdfjs-dist transfers the ArrayBuffer
 * to the worker, detaching it from the main thread. A second
 * getDocument() call against the same buffer will throw "Cannot
 * perform Construct on a detached ArrayBuffer". The fix is to load
 * the document ONCE and do both passes (text + render) against the
 * same PDFDocumentProxy. processPdf() is the only function the
 * dropzone should call.
 */

import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";

let loadedPdfJs:
  | {
      getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PDFDocumentProxy> };
      GlobalWorkerOptions: { workerSrc: string };
    }
  | null = null;

async function loadPdfJs(): Promise<NonNullable<typeof loadedPdfJs>> {
  if (loadedPdfJs) return loadedPdfJs;
  const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  loadedPdfJs = mod as unknown as NonNullable<typeof loadedPdfJs>;
  return loadedPdfJs;
}

type RenderedPng = {
  base64: string;
  mime: "image/png";
  width: number;
  height: number;
};

export type ProcessedPdf = {
  pageCount: number;
  page1Text: string;
  /** Primary label render. */
  labelPng: RenderedPng;
  /** Up to two additional candidate label renders, ordered by image-op count desc. */
  extraLabelPngs: ReadonlyArray<RenderedPng>;
};

/**
 * Pick the label-bearing page from a TTB COLA PDF.
 *
 * TTB Form 5100.31 structure (verified against the Public COLA Registry):
 *   - Page 1 — application form (all text, no label).
 *   - Page 2 — the AFFIXED LABEL ARTWORK (the demo target).
 *   - Page 3+ — TTB footer / instructions (mostly empty).
 *
 * Heuristic:
 *   - 1-page PDF → page 1 (label embedded with form, or form-only).
 *   - 2+ pages   → page 2 (the canonical label page).
 *
 * AC-5 (unreadable / low confidence) catches the rare wrong-page case.
 */
export function pickLabelPageIndex(pageCount: number): number {
  if (pageCount <= 1) return 1;
  return 2;
}

async function renderPageToPng(
  page: PDFPageProxy,
  targetLongEdge: number,
): Promise<ProcessedPdf["labelPng"]> {
  const baseViewport = page.getViewport({ scale: 1 });
  const longEdge = Math.max(baseViewport.width, baseViewport.height);
  const scale = Math.min(targetLongEdge / longEdge, 4);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // pdfjs v4 render API: canvasContext + viewport only.
  await page.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return {
    base64,
    mime: "image/png",
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Single-pass PDF processor. Loads the document ONCE; extracts page-1
 * text AND renders the label page from the same PDFDocumentProxy.
 * Avoids the detached-ArrayBuffer hazard.
 *
 * The caller's `pdfBytes` is owned by the worker after this call;
 * do not reuse it.
 */
export async function processPdf(
  pdfBytes: ArrayBuffer,
  targetLongEdge = 1568,
): Promise<ProcessedPdf> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;

  // --- pass 1: form text from EVERY page combined. Multi-page TTB
  //     COLAs put fields like CLASS/TYPE DESCRIPTION on page 2;
  //     reading only page 1 misses them. The regex parser is anchor-
  //     based and not sensitive to noise from concatenated pages.
  const page1 = await doc.getPage(1);
  let combinedText = (await page1.getTextContent()).items
    .map((it) => ("str" in it ? it.str : ""))
    .join(" ");
  for (let i = 2; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = (await page.getTextContent()).items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    combinedText += " " + text;
  }
  const page1Text = combinedText;

  // --- pass 2: rank pages 2..N by image-op count and render the top 1-3.
  //     The label artwork lives on the page with the most image draws —
  //     not always page 2 (some COLAs have a form continuation there).
  //     Page 1 is always form, so we skip it. If the PDF has only 1
  //     page, that single page is the label render.
  const PAINT_IMG_OP = 85; // OPS.paintImageXObject
  const pageScores: Array<{ pageIndex: number; imageOps: number }> = [];
  if (doc.numPages === 1) {
    pageScores.push({ pageIndex: 1, imageOps: 0 });
  } else {
    for (let i = 2; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const ops = await page.getOperatorList();
        const imageOps = ops.fnArray.filter((fn) => fn === PAINT_IMG_OP).length;
        pageScores.push({ pageIndex: i, imageOps });
      } catch {
        // Ignore malformed pages; keep the others.
      }
    }
    // Sort by image-op count desc so the most-likely-label page wins.
    pageScores.sort((a, b) => b.imageOps - a.imageOps);
  }

  const candidates = pageScores.slice(0, 3);
  const rendered: RenderedPng[] = [];
  for (const c of candidates) {
    try {
      const p = c.pageIndex === 1 ? page1 : await doc.getPage(c.pageIndex);
      const png = await renderPageToPng(p, targetLongEdge);
      rendered.push(png);
    } catch {
      // Skip render failures rather than aborting the whole upload.
    }
  }

  const pageCount = doc.numPages;
  await doc.cleanup();

  if (rendered.length === 0) {
    throw new Error("Could not render any candidate label page from this PDF");
  }
  return {
    pageCount,
    page1Text,
    labelPng: rendered[0]!,
    extraLabelPngs: rendered.slice(1),
  };
}
