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

  // --- pass 2: render pages 2..N and rank by the LARGEST embedded image
  //     area, not by paintImageXObject COUNT. Counterexample we hit on
  //     11322001000260.pdf (HOWLING MOON): page 2 has 2 image ops (a 14x16
  //     header icon + a null/decode-failed JPEG), page 3 has 1 image op
  //     but it's the 975x1030 actual label. Counting ops puts page 2 first
  //     and the label disappears. Multiplying by resolved image area puts
  //     page 3 first.
  //
  //     We must render BEFORE inspecting page.objs — pdfjs resolves image
  //     objects during rendering. Reading them off the operator list
  //     before render() returns "isn't resolved yet" errors.
  //
  //     For 1-page PDFs we still just render page 1 (the canonical
  //     "label embedded with form" case).
  const PAINT_IMG_OP = 85; // OPS.paintImageXObject
  const candidateIndices: number[] =
    doc.numPages === 1 ? [1] : Array.from({ length: doc.numPages - 1 }, (_, i) => i + 2);

  type Scored = {
    pageIndex: number;
    png: RenderedPng;
    score: number;
  };
  const scored: Scored[] = [];
  for (const pageIndex of candidateIndices) {
    try {
      const p = pageIndex === 1 ? page1 : await doc.getPage(pageIndex);
      const png = await renderPageToPng(p, targetLongEdge);
      const ops = await p.getOperatorList();
      const pageViewport = p.getViewport({ scale: 1 });
      const pageArea = pageViewport.width * pageViewport.height;

      // Scan every embedded image on the page. For each, compute its
      // coverage of the page area. We want the LABEL image — present, large
      // enough to read, but NOT page-filling (those are watermarks /
      // photocopy scans). On 13130001000430.pdf (HONEY TEA), page 3's TTB
      // footer carries a 591x828 watermark image overlaid on a 612x792
      // page — coverage 1.0+. Page 2's 356x580 actual label sits at 0.42
      // coverage. Raw-area ranking picked the watermark; coverage-aware
      // ranking picks the label.
      let bestImageScore = 0;
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] !== PAINT_IMG_OP) continue;
        const args = ops.argsArray[i];
        const name = Array.isArray(args) ? args[0] : args;
        if (typeof name !== "string") continue;
        try {
          const img = p.objs.get(name) as { width?: number; height?: number } | null;
          if (!img || typeof img.width !== "number" || typeof img.height !== "number") {
            continue;
          }
          const area = img.width * img.height;
          if (area < 10_000) continue; // ignore tiny icons (14x16 etc.)
          const coverage = pageArea > 0 ? area / pageArea : 0;
          // Penalty: pages whose biggest image fills the page are almost
          // always watermarks. >0.85 coverage → drop the score sharply.
          const watermarkPenalty = coverage > 0.85 ? 0.05 : 1.0;
          const imageScore = area * watermarkPenalty;
          if (imageScore > bestImageScore) bestImageScore = imageScore;
        } catch {
          // unresolved or null — skip
        }
      }
      scored.push({ pageIndex, png, score: bestImageScore });
    } catch {
      // Skip render failures rather than aborting the whole upload.
    }
  }

  // Sort by score desc. Tied pages keep their natural order (page 2 first).
  scored.sort((a, b) => b.score - a.score);
  const rendered: RenderedPng[] = scored.slice(0, 3).map((s) => s.png);

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
