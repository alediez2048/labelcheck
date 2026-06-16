/**
 * Document parsing — PDF / DOCX / Markdown / Plain text → raw text.
 *
 * The parser is intentionally minimal: it extracts text only. Layout,
 * tables, and images are dropped. Chunking (`./chunk.ts`) splits the
 * extracted text on paragraph boundaries, so we only need to preserve
 * `\n\n` separators here.
 *
 * Failure modes the orchestrator (`./ingest.ts`) routes to status
 * `failed`:
 *   - PDF parses but returns empty / sub-20-char text (typically a
 *     scan-only "image PDF"; pdf-parse can't read it).
 *   - Unsupported MIME (the upload route also rejects but the parser
 *     is the second line of defence).
 *   - Either the PDF or DOCX library throws (corrupt file).
 */

import { extractRawText } from "mammoth";

// pdf-parse pulls in pdfjs-dist at module load, which fails under
// Next.js's RSC webpack bundling ("Object.defineProperty called on
// non-object"). Lazy-import it inside the PDF branch only so a
// Markdown / DOCX / TXT upload doesn't load pdfjs at all.

/**
 * Result of parsing one uploaded document.
 *
 * `topic` is the per-source label that gets stamped onto every chunk
 * (KnowledgeBaseChunk.topic). It comes from the document itself when
 * possible (a top-level Markdown H1) and falls back to the filename
 * stem so the assistant still has a meaningful grouping label.
 */
export type ParseResult = {
  text: string;
  /** Inferred topic — usually the filename without extension, possibly overridden by a top-level header. */
  topic: string;
};

const MIN_PDF_TEXT_LENGTH = 20;

/**
 * MIME → parser dispatch. The set is closed (FR-31 — admin uploads PDF,
 * DOCX, MD, TXT) so anything else throws with a clear reason rather
 * than silently producing a zero-chunk source.
 */
export async function parseDocument(
  bytes: Buffer,
  mime: string,
  filename: string,
): Promise<ParseResult> {
  const text = await extractText(bytes, mime);
  const topic = inferTopic(text, filename);
  return { text, topic };
}

async function extractText(bytes: Buffer, mime: string): Promise<string> {
  switch (mime) {
    case "application/pdf": {
      // Lazy import — see file-level comment.
      const { PDFParse } = await import("pdf-parse");
      // pdf-parse v2 exposes a class; we instantiate, ask for text, and
      // destroy so the underlying pdfjs worker is released even on the
      // happy path.
      const parser = new PDFParse({ data: new Uint8Array(bytes) });
      try {
        const result = await parser.getText();
        const text = result.text ?? "";
        if (text.trim().length < MIN_PDF_TEXT_LENGTH) {
          // Most TTB-style PDFs are scans — pdf-parse returns either
          // empty or whitespace-only. The orchestrator catches this
          // and surfaces "no extractable text — re-upload as DOCX or
          // MD" on the failed source row.
          throw new Error("no extractable text — re-upload as DOCX or MD");
        }
        return text;
      } finally {
        await parser.destroy().catch(() => {
          // Destroy failures are non-fatal — the parser is about to be
          // garbage-collected anyway.
        });
      }
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await extractRawText({ buffer: bytes });
      return result.value;
    }
    case "text/markdown":
    case "text/plain": {
      return bytes.toString("utf8");
    }
    default:
      throw new Error("unsupported file type");
  }
}

/**
 * Topic inference. Preference order:
 *   1. A top-level Markdown H1 at the start of the text (`# Heading`).
 *   2. The filename minus extension (e.g. `warning-guidance.md` →
 *      `warning-guidance`).
 *
 * The H1 path covers the "the doc names itself" case — a hand-authored
 * markdown file usually opens with its title. The filename path is the
 * safe fallback that always produces a non-empty topic.
 */
function inferTopic(text: string, filename: string): string {
  const trimmed = text.trimStart();
  const h1 = trimmed.match(/^#\s+(.+?)\s*(?:\r?\n|$)/);
  if (h1 && h1[1]) {
    return h1[1].trim();
  }
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}
