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

export type ProcessedPdf = {
  pageCount: number;
  page1Text: string;
  labelPng: {
    base64: string;
    mime: "image/png";
    width: number;
    height: number;
  };
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

  // --- pass 1: page-1 text
  const page1 = await doc.getPage(1);
  const content = await page1.getTextContent();
  const page1Text = content.items
    .map((it) => ("str" in it ? it.str : ""))
    .join(" ");

  // --- pass 2: render label page
  const labelIndex = pickLabelPageIndex(doc.numPages);
  const labelPage =
    labelIndex === 1 ? page1 : await doc.getPage(labelIndex);
  const labelPng = await renderPageToPng(labelPage, targetLongEdge);

  const pageCount = doc.numPages;
  await doc.cleanup();
  return { pageCount, page1Text, labelPng };
}
