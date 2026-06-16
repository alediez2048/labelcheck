/**
 * Structured assistant turn trace (P4-2, extended in P4-3).
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
 *   - `intentTags`      — classifier output (P4-3). Empty array possible.
 *   - `refusalTemplate` — which refusal the generator emitted (or "none").
 *   - `postcheckAction` — which refusal the postcheck substituted
 *                         (or "none").
 *
 * Production seam: the Langfuse / Phoenix backend consumes the same
 * record shape; the prototype writes to stdout (`console.info`) so a
 * tail of the dev server shows every turn. The named `event` lets
 * structured-log shippers (e.g. Vector) filter on it without
 * inspecting the body.
 */

import type { AssistantRole } from "@/types/assistant";

import type { IntentTag } from "./intent";
import type { RefusalKind } from "./refusals";

/** "none" sentinel for the trace's refusal slots — keeps the shape
 *  flat instead of `RefusalKind | undefined`, which is easier to
 *  count over in the observability backend. */
export type TraceRefusal = RefusalKind | "none";

export type AssistantTurnTrace = {
  event: "trace.assistantTurn";
  role: AssistantRole;
  retrievedSources: ReadonlyArray<string>;
  usedTool?: "get_my_rollup";
  totalMs: number;
  intentTags: ReadonlyArray<IntentTag>;
  refusalTemplate: TraceRefusal;
  postcheckAction: TraceRefusal;
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
  intentTags: ReadonlyArray<IntentTag>;
  refusalTemplate: TraceRefusal;
  postcheckAction: TraceRefusal;
}): void {
  const trace: AssistantTurnTrace = {
    event: "trace.assistantTurn",
    role: input.role,
    retrievedSources: input.retrievedSources,
    totalMs: input.totalMs,
    intentTags: input.intentTags,
    refusalTemplate: input.refusalTemplate,
    postcheckAction: input.postcheckAction,
    ...(input.usedTool ? { usedTool: input.usedTool } : {}),
  };
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(trace));
}
