/**
 * Assistant turn orchestrator (P4-2).
 *
 * Drives one full request → response cycle:
 *   1. Pick the latest user message from the client-held history.
 *   2. Retrieve top-K KB chunks above the similarity floor.
 *   3. Build the system prompt (role + retrieved chunks).
 *   4. Call the generator (chat-with-tools, mock or live).
 *   5. If the generator returned a `get_my_rollup` tool call,
 *      execute the tool with server-resolved caller context and
 *      format the snapshot into prose. Citations are intentionally
 *      empty when the answer came from the tool (the tool output
 *      isn't KB material).
 *   6. Build the response and emit a PII-redacted trace.
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
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { retrieveContext } from "@/lib/assistant/retrieve";
import { emitTurnTrace } from "@/lib/assistant/trace";
import type {
  AssistantMessage,
  AssistantRole,
  AssistantTurnRequest,
  AssistantTurnResponse,
} from "@/types/assistant";

export type RunTurnInput = {
  request: AssistantTurnRequest;
  /** Resolved server-side; NEVER from the request body. */
  callerAgentId: string;
  callerRole: AssistantRole;
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

  // Step 1: retrieve.
  const { chunks, citations } = await retrieveContext(query);

  // Step 2: build the system prompt.
  const systemPrompt = buildSystemPrompt(input.callerRole, chunks);

  // Step 3: first generator call (tools enabled).
  const generator = getGenerator();
  const first = await generator.generate({
    systemPrompt,
    messages,
    toolsEnabled: true,
  });

  let answerText: string;
  let usedTool: "get_my_rollup" | undefined;
  let outCitations = citations;

  if (first.toolCall && first.toolCall.name === "get_my_rollup") {
    // Step 4: execute the tool with server-resolved context.
    const snapshot = getMyRollup(first.toolCall.input, {
      callerAgentId: input.callerAgentId,
      callerRole: input.callerRole,
    });
    // Step 5: in the mock path, skip the second model call and
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

  const totalMs = Math.round(performance.now() - start);

  // Step 6: trace. PII-redacted by construction — only structural
  // facts, no message text.
  emitTurnTrace({
    role: input.callerRole,
    retrievedSources: chunks.map((c) => c.sourceFilename),
    ...(usedTool ? { usedTool } : {}),
    totalMs,
  });

  const message: AssistantMessage = {
    role: "assistant",
    content: answerText,
  };

  return {
    message,
    citations: outCitations,
    ...(usedTool ? { usedTool } : {}),
    metadata: {
      role: input.callerRole,
      retrievedCount: chunks.length,
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
