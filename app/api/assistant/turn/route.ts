/**
 * POST /api/assistant/turn — one chat turn (P4-2).
 *
 * Resolves the caller server-side (NEVER from the request body's role
 * field — observability.md role-scope isolation, FR-30, D16), calls
 * the orchestrator, returns the grounded response with citations.
 *
 * Prototype seam — caller identity: the route reads `activeAgentId`
 * from the body and looks the agent up in `SEED_AGENTS` to derive
 * the role. Production replaces this with a real session resolution
 * (PIV/CAC + SSO cookie or signed JWT, P6-3) — the body field
 * disappears entirely and the route reads the caller from the
 * request context. The lookup-then-trust pattern here keeps the
 * route's downstream contract identical between prototype and
 * production: the orchestrator always receives a verified
 * `callerAgentId` + `callerRole`.
 *
 * Errors:
 *   - 400 on malformed JSON, missing messages, latest message not
 *     authored by the user, or unknown `activeAgentId`.
 *   - 500 on orchestrator throws (and a generic trace is emitted).
 */

import { NextResponse } from "next/server";

import { runTurn } from "@/lib/assistant/turn";
import { emitTurnTrace } from "@/lib/assistant/trace";
import { SEED_AGENTS } from "@/lib/queue/fixtures";
import type {
  AssistantMessage,
  AssistantTurnRequest,
} from "@/types/assistant";

const BAD_BODY = "Malformed request body";
const NO_MESSAGES = "messages must be a non-empty array";
const LAST_NOT_USER = "Last message must be a user message";
const UNKNOWN_AGENT = "Unknown active agent";
const GENERIC_500 = "Assistant turn failed";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: BAD_BODY }, { status: 400 });
  }

  const parsed = parseRequestBody(body);
  if (parsed.kind === "error") {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  const { request } = parsed;

  // Server-side caller resolution. The agent's role is read from the
  // seed, not from input — even if the body had a role field, we'd
  // ignore it.
  const agent = SEED_AGENTS.find((a) => a.id === request.activeAgentId);
  if (!agent) {
    return NextResponse.json({ error: UNKNOWN_AGENT }, { status: 400 });
  }

  try {
    const response = await runTurn({
      request,
      callerAgentId: agent.id,
      callerRole: agent.role,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    // Emit a minimal trace even on failure so the observability
    // backend records that the turn happened (and failed). No PII.
    emitTurnTrace({
      role: agent.role,
      retrievedSources: [],
      totalMs: 0,
      intentTags: [],
      refusalTemplate: "none",
      postcheckAction: "none",
    });
    // eslint-disable-next-line no-console
    console.error("[assistant.turn] orchestrator failed", err);
    return NextResponse.json({ error: GENERIC_500 }, { status: 500 });
  }
}

type ParseResult =
  | { kind: "ok"; request: AssistantTurnRequest }
  | { kind: "error"; message: string };

/**
 * Validate the wire shape and narrow into `AssistantTurnRequest`.
 * Defensive about the unknown body — `messages` must be a non-empty
 * array of `{ role, content }` and the last one must be authored by
 * the user (the orchestrator embeds the latest user message for
 * retrieval; an empty or assistant-led tail is invalid).
 */
function parseRequestBody(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { kind: "error", message: BAD_BODY };
  }
  const obj = body as Record<string, unknown>;
  const rawMessages = obj.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { kind: "error", message: NO_MESSAGES };
  }

  const messages: AssistantMessage[] = [];
  for (const m of rawMessages) {
    if (typeof m !== "object" || m === null) {
      return { kind: "error", message: NO_MESSAGES };
    }
    const row = m as Record<string, unknown>;
    if (
      (row.role !== "user" && row.role !== "assistant") ||
      typeof row.content !== "string"
    ) {
      return { kind: "error", message: NO_MESSAGES };
    }
    messages.push({ role: row.role, content: row.content });
  }
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    return { kind: "error", message: LAST_NOT_USER };
  }

  const activeAgentId = obj.activeAgentId;
  if (typeof activeAgentId !== "string" || activeAgentId.length === 0) {
    return { kind: "error", message: UNKNOWN_AGENT };
  }

  return {
    kind: "ok",
    request: { messages, activeAgentId },
  };
}
