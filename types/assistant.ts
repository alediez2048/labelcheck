/**
 * Assistant turn contract (P4-2).
 *
 * The wire shape for `/api/assistant/turn` plus the value-types the
 * server-side orchestrator (`lib/assistant/`) returns. Per FR-30 /
 * NFR-4 the assistant is read-only and conversation history is
 * client-held — these types are the surface the chat panel and the
 * route handler agree on, and nothing about a turn persists to the
 * application DB.
 *
 * Role-scope isolation (D16; observability.md): the request body
 * carries `activeAgentId` only so the server can look the row up in
 * the seed store and CONFIRM the caller. The role is NEVER trusted
 * from the body — the server reads `state.agents.find(a => a.id ===
 * activeAgentId).role` itself.
 */

/** Whose shell the caller is in. The server derives this, never the client. */
export type AssistantRole = "agent" | "admin";

/**
 * One footer-chip's worth of provenance. The assistant cites the
 * `(sourceFilename, version)` pair so observability traces can replay
 * exactly which version of the KB was on the prompt at answer time.
 */
export type Citation = {
  sourceFilename: string;
  topic: string;
  version: number;
  title: string;
};

/** One turn in the client-held conversation history. */
export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Request body for `POST /api/assistant/turn`.
 *
 * `activeAgentId` is what the role switcher (P2-5) put in the URL or
 * cookie. The server validates it against `SEED_AGENTS` and reads the
 * role from there — production swaps this for a real session / SSO
 * resolution and the body field disappears.
 */
export type AssistantTurnRequest = {
  /** Full conversation history (client-held, per-session). */
  messages: AssistantMessage[];
  /**
   * The active agent id from the role switcher. The SERVER will
   * verify this maps to a known agent + read role from `lib/queue/
   * fixtures.ts`. NEVER trust this for role determination; the
   * server reads `state.agents.find(a => a.id === activeAgentId).role`.
   */
  activeAgentId: string;
};

/**
 * Response body for `POST /api/assistant/turn`.
 *
 * `citations` is empty when the assistant answered from the rollup
 * tool — the tool's output is not KB material. `metadata` is the
 * structured trace's public-facing slice; the full trace shape is in
 * `lib/assistant/trace.ts` and is PII-redacted before emission.
 */
export type AssistantTurnResponse = {
  message: AssistantMessage;
  citations: Citation[];
  usedTool?: "get_my_rollup";
  metadata: {
    role: AssistantRole;
    retrievedCount: number;
    totalMs: number;
  };
};

/**
 * Output shape of `get_my_rollup` — the one (and only) tool the
 * assistant can call. Mirrors the slice of `metric_rollup` the
 * production read returns when scoped to `agent_id = :callerId`
 * (Agent caller) or `agent_id IS NULL` (Admin caller).
 *
 * `scope` is the audit signal: every snapshot announces which role
 * scope produced it, so the formatter and any future eval can
 * distinguish "your numbers" from "the division's numbers".
 */
export type RollupSnapshot = {
  range: "week" | "month";
  processed: number;
  matchCount: number;
  mismatchCount: number;
  reviewCount: number;
  approvedCount: number;
  returnedCount: number;
  avgHandlingSeconds: number;
  scope: "self" | "division";
};
