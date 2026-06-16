/**
 * Fixed-shape refusal templates (P4-3).
 *
 * These constants ARE the contract the guardrail eval harness asserts
 * against. The string-match is verbatim — changing a comma here breaks
 * the harness, which is the point: a future prompt or model change
 * cannot silently soften the boundary.
 *
 * Why fixed sentences instead of "any refusal-ish reply": observability
 * .md treats out-of-scope refusal as pass/fail. A graded refusal that
 * apologises for two paragraphs and then volunteers a guess is worse
 * than a brittle one — it invites the user to push back and re-prompt
 * the assistant past the boundary. The fixed shape is the boundary.
 *
 * Brief, not apologetic, pointing to the human process. Read
 * CONTEXT.md (Disposition: "the agent's decision") and observability.md
 * (Component B: pass/fail) before editing any of these strings.
 */

/** Legal / regulatory advice. */
export const REFUSAL_LEGAL =
  "I'm not a lawyer; consult policy or your supervisor.";

/** Approve / return / reject / reassign — disposition is the agent's. */
export const REFUSAL_DISPOSITION =
  "I can't approve, return, reject, or reassign — that's the agent's decision.";

/** Another user's stats, or any role-override attempt. */
export const REFUSAL_CROSS_USER = "I can only show you your own numbers.";

/** Compliance question without KB support — no fabricated rules. */
export const REFUSAL_UNSUPPORTED_COMPLIANCE =
  "I don't have an authoritative answer for that in the knowledge base. Check the docs or ask your supervisor.";

/** Wholly off-topic (weather, sports, general knowledge). */
export const REFUSAL_OUT_OF_SCOPE =
  "I can only help with how this tool works, your own numbers, and what's in the knowledge base.";

/**
 * Discriminated tag for a refusal decision. The orchestrator uses this
 * to thread the chosen refusal through the trace shape so observability
 * can count refusals by kind without scraping message text (NFR-4: no
 * message text in traces).
 */
export type RefusalKind =
  | "legal_advice"
  | "disposition_request"
  | "cross_user_stats"
  | "unsupported_compliance"
  | "out_of_scope";

/**
 * Map a refusal kind to its template. The eval harness expects strict
 * equality — same kind, same sentence, every time.
 */
export function refusalFor(kind: RefusalKind): string {
  switch (kind) {
    case "legal_advice":
      return REFUSAL_LEGAL;
    case "disposition_request":
      return REFUSAL_DISPOSITION;
    case "cross_user_stats":
      return REFUSAL_CROSS_USER;
    case "unsupported_compliance":
      return REFUSAL_UNSUPPORTED_COMPLIANCE;
    case "out_of_scope":
      return REFUSAL_OUT_OF_SCOPE;
  }
}

/**
 * Short rationale shown next to a refusal in the chat UI (P4-3 NFR-2).
 * Kept out of the prompt to avoid drift; the prompt only carries the
 * sentence, and the UI carries the "why".
 */
export const REFUSAL_RATIONALE: Readonly<Record<RefusalKind, string>> = {
  legal_advice: "Compliance advice belongs to your policy team.",
  disposition_request: "The agent owns the decision; I can only inform.",
  cross_user_stats: "Read-only assistant; role-scoped to your own data.",
  unsupported_compliance: "I cite only what's in the Knowledge Base.",
  out_of_scope:
    "I help with the tool, your numbers, and the Knowledge Base.",
};

/**
 * Set of every refusal sentence — useful for the postcheck and the UI
 * to detect "is this message already a refusal?" without listing each
 * constant by hand.
 */
export const ALL_REFUSAL_TEMPLATES: ReadonlyArray<string> = [
  REFUSAL_LEGAL,
  REFUSAL_DISPOSITION,
  REFUSAL_CROSS_USER,
  REFUSAL_UNSUPPORTED_COMPLIANCE,
  REFUSAL_OUT_OF_SCOPE,
];
