/**
 * Assistant turn orchestrator (P4-2, hardened in P4-3).
 *
 * Drives one full request → response cycle:
 *   1. Pick the latest user message from the client-held history.
 *   2. Classify the message intent (P4-3) — deterministic, no model call.
 *   3. Retrieve top-K KB chunks above the similarity floor.
 *   4. Build the system prompt (role + retrieved chunks + intent tags).
 *   5. Call the generator (chat-with-tools, mock or live).
 *   6. If the generator returned a `get_my_rollup` tool call,
 *      execute the tool with server-resolved caller context and
 *      format the snapshot into prose. Citations are intentionally
 *      empty when the answer came from the tool (the tool output
 *      isn't KB material).
 *   7. Run the response-side postcheck (P4-3) — demote uncited
 *      compliance claims and cross-user mentions to fixed-shape
 *      refusals. Belt-and-braces on top of the prompt.
 *   8. Build the response and emit a PII-redacted trace.
 *
 * Caller identity is NEVER read from the request body — the route
 * handler resolves it server-side and threads it through `input`.
 * The orchestrator simply forwards it to `getMyRollup`'s context.
 *
 * Latency: budget is p95 < 3s per turn (acceptance criterion). The
 * mock generator is essentially free; production swap to a real
 * model adds the model call latency. `totalMs` is measured here so
 * the trace captures the real wall clock the user sees.
 */

import { getMyRollup } from "@/lib/assistant/tools/getMyRollup";
import { formatRollup, getGenerator } from "@/lib/assistant/generator";
import { classifyIntent } from "@/lib/assistant/intent";
import { postcheckResponse } from "@/lib/assistant/postcheck";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { retrieveContext } from "@/lib/assistant/retrieve";
import { emitTurnTrace, type TraceRefusal } from "@/lib/assistant/trace";
import { SEED_AGENTS } from "@/lib/queue/fixtures";
import type {
  AssistantMessage,
  AssistantRole,
  AssistantTurnRequest,
  AssistantTurnResponse,
} from "@/types/assistant";

import {
  ALL_REFUSAL_TEMPLATES,
  REFUSAL_CROSS_USER,
  REFUSAL_DISPOSITION,
  REFUSAL_LEGAL,
  REFUSAL_OUT_OF_SCOPE,
  REFUSAL_UNSUPPORTED_COMPLIANCE,
  type RefusalKind,
} from "@/lib/assistant/refusals";

/**
 * Optional P5-1 observability hook. The route handler wraps `runTurn`
 * in `withAssistantSpan` and threads the resulting context here; the
 * orchestrator fills attributes (intent tags, retrieval count, used
 * tool, refusal template, postcheck action, total ms) as the turn
 * unfolds. Kept optional so unit tests can drive `runTurn` directly
 * without setting up a span.
 */
export type RunTurnObservability = {
  setAttributes(
    attrs: Record<string, string | number | boolean | string[] | undefined>,
  ): void;
};

export type RunTurnInput = {
  request: AssistantTurnRequest;
  /** Resolved server-side; NEVER from the request body. */
  callerAgentId: string;
  callerRole: AssistantRole;
  /** Optional P5-1 hook — wires the assistant.turn span attributes. */
  observability?: RunTurnObservability;
};

/**
 * Run one assistant turn. The route handler is a thin wrapper
 * around this — it validates the body and resolves the caller, then
 * calls `runTurn` and returns the response.
 */
export async function runTurn(
  input: RunTurnInput,
): Promise<AssistantTurnResponse> {
  const start = performance.now();

  const messages = input.request.messages;
  const latestUser = findLatestUser(messages);
  const query = latestUser?.content ?? "";

  // Step 1: classify intent before anything else — drives prompt
  // hints and generator branching.
  const intentTags = classifyIntent(query);

  // Step 2: retrieve.
  const { chunks, citations } = await retrieveContext(query);

  // Step 3: build the system prompt.
  const systemPrompt = buildSystemPrompt(input.callerRole, chunks, intentTags);

  // Step 4: first generator call (tools enabled).
  const generator = getGenerator();
  const first = await generator.generate({
    systemPrompt,
    messages,
    toolsEnabled: true,
    intentTags,
  });

  let answerText: string;
  let usedTool: "get_my_rollup" | undefined;
  let outCitations = citations;

  if (first.toolCall && first.toolCall.name === "get_my_rollup") {
    // Step 5: execute the tool with server-resolved context.
    const snapshot = getMyRollup(first.toolCall.input, {
      callerAgentId: input.callerAgentId,
      callerRole: input.callerRole,
    });
    // Step 6: in the mock path, skip the second model call and
    // format the snapshot directly. Production replaces this with a
    // second `generator.generate` call seeded with the tool result.
    answerText = formatRollup(snapshot);
    usedTool = "get_my_rollup";
    // Numbers came from the tool, not the KB — drop citations so
    // the response doesn't lie about provenance.
    outCitations = [];
  } else {
    answerText = first.text;
  }

  const message: AssistantMessage = {
    role: "assistant",
    content: answerText,
  };

  const draftResponse: AssistantTurnResponse = {
    message,
    citations: outCitations,
    ...(usedTool ? { usedTool } : {}),
    metadata: {
      role: input.callerRole,
      retrievedCount: chunks.length,
      totalMs: 0, // filled below after postcheck so we capture the real wall clock
    },
  };

  // Step 7: postcheck — demote uncited compliance claims or
  // cross-user mentions. The check is PURE; no I/O beyond the
  // synchronous config read.
  const postResult = postcheckResponse({
    response: draftResponse,
    callerAgentId: input.callerAgentId,
    callerRole: input.callerRole,
    allAgentIds: SEED_AGENTS.map((a) => a.id),
    allAgentNames: SEED_AGENTS.map((a) => a.name),
  });

  const finalResponse = postResult.response;
  const totalMs = Math.round(performance.now() - start);

  // Step 8: trace. PII-redacted by construction — only structural
  // facts, no message text. We capture the generator's refusal too
  // by string-matching the answer text against the templates; this
  // is cheap (5-template lookup) and keeps the trace consistent
  // whether the refusal came from the prompt path or the postcheck.
  const generatorRefusal = matchRefusalTemplate(answerText);
  const retrievedSources = chunks.map((c) => c.sourceFilename);
  emitTurnTrace({
    role: input.callerRole,
    retrievedSources,
    ...(usedTool && !postResult.appliedRefusal ? { usedTool } : {}),
    totalMs,
    intentTags,
    refusalTemplate: generatorRefusal ?? "none",
    postcheckAction: postResult.appliedRefusal ?? "none",
  });

  // P5-1: feed the same facts to the assistant.turn span so the
  // observability backend gets a single structured record per turn
  // (same shape the legacy console trace above carries). The
  // attribute keys all live in `SAFE_ATTRIBUTE_KEYS` — no PII.
  input.observability?.setAttributes({
    "assistant.intent_tags": [...intentTags],
    "assistant.retrieved_count": chunks.length,
    "assistant.retrieved_sources": [...retrievedSources],
    "assistant.used_tool": usedTool,
    "assistant.refusal_template": generatorRefusal ?? "none",
    "assistant.postcheck_action": postResult.appliedRefusal ?? "none",
    "assistant.total_ms": totalMs,
  });

  // The metadata.totalMs gets overwritten with the final measurement.
  return {
    ...finalResponse,
    metadata: {
      ...finalResponse.metadata,
      totalMs,
    },
  };
}

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

/**
 * Map an answer string back to a refusal kind by exact match against
 * the templates. Returns null when the answer is not a refusal.
 *
 * The trace records refusals by kind so the observability backend can
 * count them without scraping the message text (NFR-4).
 */
function matchRefusalTemplate(text: string): RefusalKind | null {
  if (!ALL_REFUSAL_TEMPLATES.includes(text)) {
    return null;
  }
  switch (text) {
    case REFUSAL_LEGAL:
      return "legal_advice";
    case REFUSAL_DISPOSITION:
      return "disposition_request";
    case REFUSAL_CROSS_USER:
      return "cross_user_stats";
    case REFUSAL_UNSUPPORTED_COMPLIANCE:
      return "unsupported_compliance";
    case REFUSAL_OUT_OF_SCOPE:
      return "out_of_scope";
    default:
      return null;
  }
}

// Re-export so the trace seam stays the only public type surface for
// callers that need to disambiguate "none" from a refusal kind.
export type { TraceRefusal };
