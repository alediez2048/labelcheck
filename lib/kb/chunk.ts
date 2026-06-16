/**
 * Paragraph-aware chunker with overlap.
 *
 * Targets ~500 words per chunk as a rough proxy for ~650 tokens (1 word
 * ≈ 1.3 tokens for English prose). This is deliberately a word count and
 * not a tokenizer call — the prototype embedder is hash-derived
 * (`./embed.ts`) so we have no tokenizer in the loop, and any real
 * embedder will tolerate a chunk window of ±100 tokens around the
 * intended size.
 *
 * Overlap: the last paragraph of chunk N-1 is prepended to chunk N. This
 * is the cheapest way to keep retrieval working across paragraph
 * boundaries; a chunk that splits mid-argument still has the immediately
 * preceding paragraph as context.
 *
 * The chunker always returns at least one chunk, even on tiny inputs.
 * Returning an empty array would mean the source has no retrievable
 * content, which is a different signal (the ingest orchestrator routes
 * that to `failed`).
 */

export type ChunkInput = {
  text: string;
  topic: string;
};

export type ChunkOutput = {
  /** First sentence / heading of the chunk, ≤100 chars. */
  title: string;
  body: string;
  topic: string;
};

const TARGET_WORDS = 500;
const TITLE_MAX_CHARS = 100;

export function chunkText(input: ChunkInput): ChunkOutput[] {
  const paragraphs = splitParagraphs(input.text);
  if (paragraphs.length === 0) {
    // Tiny / empty input — return a single chunk with whatever text we
    // have (possibly empty). The caller (ingest orchestrator) decides
    // whether an empty chunk warrants `failed` status.
    return [
      {
        title: makeTitle(input.text),
        body: input.text,
        topic: input.topic,
      },
    ];
  }

  const groups: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const words = countWords(para);
    // If adding this paragraph would push the chunk past target AND we
    // already have content, close the current chunk first. The "already
    // have content" guard prevents an oversize single-paragraph input
    // from producing an empty chunk before itself.
    if (currentWords > 0 && currentWords + words > TARGET_WORDS) {
      groups.push(current);
      // Overlap: seed the next group with the last paragraph of the
      // previous one. Carries across boundaries without doubling the
      // corpus size (one paragraph of overlap, not a sliding window).
      const last = current[current.length - 1];
      current = last !== undefined ? [last] : [];
      currentWords = last !== undefined ? countWords(last) : 0;
    }
    current.push(para);
    currentWords += words;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups.map((paras) => {
    const body = paras.join("\n\n");
    return {
      title: makeTitle(body),
      body,
      topic: input.topic,
    };
  });
}

/**
 * Split on runs of two or more newlines so we honour Markdown's
 * paragraph convention and tolerate CRLF inputs. Empty paragraphs are
 * dropped.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function countWords(text: string): number {
  const matched = text.match(/\S+/g);
  return matched ? matched.length : 0;
}

/**
 * Title = first 100 chars of the chunk, cut at the first newline if
 * that's earlier. We don't strip Markdown markers (`#`, `>`, etc.) —
 * the UI renders these verbatim and the title is for humans scanning
 * a list, not for the assistant.
 */
function makeTitle(body: string): string {
  const trimmed = body.trimStart();
  const newlineIdx = trimmed.indexOf("\n");
  const head =
    newlineIdx === -1 ? trimmed : trimmed.slice(0, newlineIdx);
  return head.slice(0, TITLE_MAX_CHARS).trim();
}
