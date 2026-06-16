/**
 * Assistant generator seam (P4-2).
 *
 * The chat-with-tools surface the orchestrator (`./turn.ts`) calls
 * twice per turn:
 *   1. With `toolsEnabled: true` — the model either returns final
 *      text or a `get_my_rollup` tool call.
 *   2. If the first call returned a tool call, the orchestrator
 *      executes the tool and then needs prose around the result.
 *      For the mock, we use `formatRollup` directly (no second
 *      model call). Production swaps this for a real second
 *      generator call seeded with the tool result.
 *
 * Why a separate seam from the existing `VisionProvider`: that one
 * is built for one-shot vision extraction (D4). The assistant needs
 * a multi-turn chat surface with optional tool calls. Same provider
 * APIs underneath (Anthropic / OpenAI), but a different shape.
 * Documenting the split here rather than overloading `extract()`.
 *
 * Production swap: `AnthropicAssistantGenerator` uses the Messages
 * API with `tools: [getMyRollupSchema]`. Stubbed for now — the
 * prototype demos through the mock heuristic. Adding the live
 * adapter is a self-contained change (no callers move).
 */

import type { AssistantMessage, RollupSnapshot } from "@/types/assistant";

/**
 * What the orchestrator hands the generator on each call.
 *
 * `systemPrompt` is the full prompt from `buildSystemPrompt`
 * (KB context already folded in). `messages` is the client-held
 * conversation history, oldest first. `toolsEnabled` tells the
 * generator whether the rollup tool is on the table — the
 * orchestrator turns it off for the second call so the model
 * doesn't loop calling tools forever.
 */
export type GenerateInput = {
  systemPrompt: string;
  messages: ReadonlyArray<AssistantMessage>;
  /** Whether the rollup tool is offered to the model. */
  toolsEnabled: boolean;
};

/**
 * What the generator returns. Either final text OR a tool call —
 * not both. The orchestrator branches on the presence of `toolCall`.
 */
export type GenerateOutput = {
  text: string;
  /** Whether the model elected to call get_my_rollup. */
  toolCall?: { name: "get_my_rollup"; input: { range?: "week" | "month" } };
};

export type AssistantGenerator = {
  readonly name: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
};

// ---------------------------------------------------------------------------
// Mock generator — heuristic, no key required.
//
// The orchestrator drives the mock through the same two-call path it
// drives a real model through, but in the mock the second call is
// short-circuited by `formatRollup` directly. We document this here
// rather than baking it into the orchestrator so a future swap to a
// real model doesn't require touching `turn.ts`.
// ---------------------------------------------------------------------------

/** Patterns the mock treats as "asking about my own numbers". */
const NUMBERS_QUESTION_PATTERNS: ReadonlyArray<RegExp> = [
  /how\s+am\s+i\s+doing/i,
  /my\s+numbers/i,
  /my\s+stats/i,
  /this\s+week/i,
  /this\s+month/i,
  /completed/i,
  /handled/i,
];

const WEEK_PATTERN = /\bweek\b/i;
const MONTH_PATTERN = /\bmonth\b/i;

/** Best-effort snippet length for the KB-grounded mock answer. */
const SNIPPET_MAX = 280;

const NO_ANSWER_REPLY =
  "I don't have an answer for that yet. Try the docs (Knowledge Base) or ask your supervisor.";

/**
 * Mock generator. The behaviour, in order:
 *
 *   1. Find the most recent user message.
 *   2. If it sounds like a "my own numbers" question AND tools are
 *      offered, return a `get_my_rollup` tool call with the inferred
 *      range (week / month, default month).
 *   3. Else, if the system prompt's KB context block is non-empty,
 *      return a templated answer that quotes the first chunk and
 *      names the source filename.
 *   4. Else, return the "don't know yet" fallback.
 *
 * This is deliberately a small set of regexes — it lets the
 * prototype demo without a key without pretending to be a real
 * language model.
 */
export class MockAssistantGenerator implements AssistantGenerator {
  readonly name = "mock-heuristic";

  generate(input: GenerateInput): Promise<GenerateOutput> {
    const latestUser = findLatestUser(input.messages);
    const text = latestUser?.content ?? "";

    if (input.toolsEnabled && isNumbersQuestion(text)) {
      const range: "week" | "month" = WEEK_PATTERN.test(text)
        ? "week"
        : MONTH_PATTERN.test(text)
          ? "month"
          : "month";
      return Promise.resolve({
        text: "",
        toolCall: { name: "get_my_rollup", input: { range } },
      });
    }

    const block = extractKbBlock(input.systemPrompt);
    if (block !== null) {
      return Promise.resolve({ text: templatedKbAnswer(block) });
    }

    return Promise.resolve({ text: NO_ANSWER_REPLY });
  }
}

/**
 * Stub for the Anthropic-backed chat-with-tools generator. Will use
 * the Messages API with `tools: [{ name: "get_my_rollup", ... }]`.
 * The prototype demos through the mock; this is the documented seam
 * for the production swap.
 */
export class AnthropicAssistantGenerator implements AssistantGenerator {
  readonly name = "anthropic-chat-with-tools";

  generate(_input: GenerateInput): Promise<GenerateOutput> {
    void _input;
    return Promise.reject(
      new Error(
        "AnthropicAssistantGenerator not implemented in P4-2 prototype",
      ),
    );
  }
}

/**
 * Factory. Today: always returns the mock. The production swap reads
 * an env var (`ASSISTANT_GENERATOR`) and dispatches.
 */
export function getGenerator(): AssistantGenerator {
  return new MockAssistantGenerator();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLatestUser(
  messages: ReadonlyArray<AssistantMessage>,
): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") {
      return m;
    }
  }
  return undefined;
}

function isNumbersQuestion(text: string): boolean {
  for (const pattern of NUMBERS_QUESTION_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Pull the rendered KB context block out of the system prompt.
 * Returns null when the block was empty (the `--- KB CONTEXT EMPTY ---`
 * marker is present instead).
 */
function extractKbBlock(systemPrompt: string): string | null {
  const start = systemPrompt.indexOf("--- KB CONTEXT START ---");
  const end = systemPrompt.indexOf("--- KB CONTEXT END ---");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return systemPrompt
    .slice(start + "--- KB CONTEXT START ---".length, end)
    .trim();
}

/**
 * Build a templated answer that quotes the first chunk and names its
 * source filename. Pattern matches the header the prompt builder
 * emits: `[filename.md] (topic: ..., v1)`.
 */
function templatedKbAnswer(block: string): string {
  const headerMatch = block.match(
    /\[(.+?)\]\s*\(topic:\s*(.+?),\s*v\d+\)\s*\n([\s\S]*?)(?=\n\[|$)/,
  );
  if (!headerMatch) {
    // Fallback — shouldn't happen given the prompt builder's format,
    // but if it does, surface the whole block rather than nothing.
    return `According to the knowledge base: ${truncate(block, SNIPPET_MAX)}`;
  }
  const filename = headerMatch[1] ?? "the knowledge base";
  const topic = headerMatch[2] ?? "general";
  const body = (headerMatch[3] ?? "").trim();
  const snippet = truncate(body, SNIPPET_MAX);
  return `According to ${filename} (topic: ${topic}): ${snippet}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max).trimEnd()}...`;
}

/**
 * Format a `RollupSnapshot` into a plain-language sentence. Used by
 * the orchestrator after a `get_my_rollup` tool call to skip the
 * second model call in the mock path (production replaces this with
 * a real second generator call seeded with the tool result).
 */
export function formatRollup(snapshot: RollupSnapshot): string {
  const window =
    snapshot.range === "week" ? "this week" : "this month";
  const subject = snapshot.scope === "self" ? "you've" : "the division has";
  if (snapshot.processed === 0) {
    return `${capitalise(window)} ${subject} not processed any applications yet.`;
  }
  return (
    `${capitalise(window)} ${subject} processed ${snapshot.processed} ` +
    `application${plural(snapshot.processed)}; ` +
    `${snapshot.matchCount} cleared as match, ` +
    `${snapshot.mismatchCount} as mismatch, ` +
    `${snapshot.reviewCount} needed review. ` +
    `${snapshot.approvedCount} approved, ${snapshot.returnedCount} returned.`
  );
}

function capitalise(s: string): string {
  if (s.length === 0) {
    return s;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}
