/**
 * Structured assistant turn trace (P4-2).
 *
 * One log line per `runTurn` invocation, emitted as JSON so the
 * observability backend (Langfuse / Phoenix in P6-6) can consume the
 * same shape the prototype console emits. The shape is PII-redacted
 * by construction: no user message text, no model output text, no
 * applicant fields — only the structural facts about the turn.
 *
 * Fields:
 *   - `event`           — always `trace.assistantTurn` for grep-ability.
 *   - `role`            — `agent` | `admin`, server-resolved.
 *   - `retrievedSources` — filenames of the chunks the prompt cited.
 *   - `usedTool`        — `get_my_rollup` when the tool fired, else absent.
 *   - `totalMs`         — wall-clock latency for the whole turn.
 *
 * Production seam: the Langfuse / Phoenix backend consumes the same
 * record shape; the prototype writes to stdout (`console.info`) so a
 * tail of the dev server shows every turn. The named `event` lets
 * structured-log shippers (e.g. Vector) filter on it without
 * inspecting the body.
 */

import type { AssistantRole } from "@/types/assistant";

export type AssistantTurnTrace = {
  event: "trace.assistantTurn";
  role: AssistantRole;
  retrievedSources: ReadonlyArray<string>;
  usedTool?: "get_my_rollup";
  totalMs: number;
};

/**
 * Emit a single structured trace line. Synchronous by design — the
 * orchestrator is on the response path, so we never want a trace
 * write to block on I/O. `console.info` is the prototype sink;
 * production swaps to an OTel exporter without changing this call
 * site.
 */
export function emitTurnTrace(input: {
  role: AssistantRole;
  retrievedSources: ReadonlyArray<string>;
  usedTool?: "get_my_rollup";
  totalMs: number;
}): void {
  const trace: AssistantTurnTrace = {
    event: "trace.assistantTurn",
    role: input.role,
    retrievedSources: input.retrievedSources,
    totalMs: input.totalMs,
    ...(input.usedTool ? { usedTool: input.usedTool } : {}),
  };
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(trace));
}
