/**
 * Response-side guardrails (P4-3).
 *
 * Belt-and-braces on top of the prompt. The prompt tells the model to
 * refuse certain categories; this module SCANS the generated response
 * and demotes it to a refusal when the model failed to refuse on its
 * own. LLMs can be coaxed; the postcheck is the deterministic catch.
 *
 * Two checks today:
 *
 *   1. Uncited compliance claim. A response that contains
 *      compliance-shaped language ("you must", "the rule is", "is
 *      required", etc.) AND has no citations attached is the
 *      "fabricated rule" failure mode (observability.md: no
 *      fabricated rules). Replace with the unsupported-compliance
 *      refusal. The patterns live in `config/assistant-guardrails.json`
 *      so they're tunable without a code change (FR-25 spirit).
 *
 *   2. Cross-user mention. A response that names any agent OTHER than
 *      the caller is a role-scope leak (observability.md: zero leak).
 *      Replace with the cross-user refusal. The check skips the
 *      caller's own name + id so legitimate "as Marcus, you've..."
 *      replies pass through.
 *
 * Pure: no I/O beyond the synchronous `readFileSync` of the config.
 * The orchestrator calls this AFTER generation and substitutes the
 * returned response into the trace and the wire response.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AssistantTurnResponse } from "@/types/assistant";

import { REFUSAL_CROSS_USER, REFUSAL_UNSUPPORTED_COMPLIANCE, type RefusalKind } from "./refusals";

export type PostcheckInput = {
  response: AssistantTurnResponse;
  callerAgentId: string;
  callerRole: "agent" | "admin";
  allAgentIds: ReadonlyArray<string>;
  allAgentNames: ReadonlyArray<string>;
};

export type PostcheckResult = {
  response: AssistantTurnResponse;
  /** Which refusal, if any, the postcheck substituted. */
  appliedRefusal?: RefusalKind;
  /** Reasons for any modification (PII-redacted; structural facts only). */
  reasons: ReadonlyArray<string>;
};

type GuardrailsConfig = {
  complianceClaimPatterns: ReadonlyArray<string>;
  promptInjectionPatterns: ReadonlyArray<string>;
};

let cachedConfig: GuardrailsConfig | null = null;

/**
 * Read `config/assistant-guardrails.json` once per process. The file is
 * tiny and rarely changes; reading on every postcheck would be wasted
 * I/O on the response path.
 */
function loadConfig(): GuardrailsConfig {
  if (cachedConfig !== null) {
    return cachedConfig;
  }
  const path = resolve(process.cwd(), "config/assistant-guardrails.json");
  const raw = readFileSync(path, "utf8");
  cachedConfig = JSON.parse(raw) as GuardrailsConfig;
  return cachedConfig;
}

/**
 * Test-only escape hatch — clears the cached config so a test that
 * writes a temp config file before calling can see the updated values.
 * No production code calls this.
 */
export function __resetPostcheckConfigForTests(): void {
  cachedConfig = null;
}

/**
 * Build a case-insensitive word-boundary regex for an agent name or
 * id. `\b` doesn't behave nicely with hyphens (agent ids like
 * `agent-marcus` have a hyphen), so we anchor with `(?<![a-z0-9])` /
 * `(?![a-z0-9])` to match a real token boundary without treating the
 * hyphen as a word character.
 */
function tokenRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
}

/**
 * Find the caller's own name from the id. Returns `null` if the id
 * isn't in `allAgentIds` (shouldn't happen in production — the route
 * resolves the caller from the seed — but the postcheck is defensive).
 */
function findCallerName(
  callerAgentId: string,
  allAgentIds: ReadonlyArray<string>,
  allAgentNames: ReadonlyArray<string>,
): string | null {
  const idx = allAgentIds.indexOf(callerAgentId);
  if (idx === -1) {
    return null;
  }
  return allAgentNames[idx] ?? null;
}

/**
 * Run the postcheck. Returns the response unchanged if it's fine, or a
 * new response with the message demoted to a refusal template.
 *
 * Order of checks:
 *   1. Cross-user mention first — a leak is the highest-severity
 *      failure (observability.md: zero leak is the hard bar). Even if
 *      the response ALSO makes an uncited compliance claim, the leak
 *      takes priority.
 *   2. Uncited compliance claim second.
 *
 * Citations present + compliance claim is fine — the citation is the
 * legitimate provenance for the claim.
 */
export function postcheckResponse(input: PostcheckInput): PostcheckResult {
  const original = input.response;
  const text = original.message.content;
  const reasons: string[] = [];

  // ---- Check 1: cross-user mention -----------------------------------
  const callerName = findCallerName(
    input.callerAgentId,
    input.allAgentIds,
    input.allAgentNames,
  );

  // Build the caller's name tokens once so we can exclude them from
  // the per-other-agent scan. Names are space-separated; tokens shorter
  // than 3 chars are skipped (too noisy — e.g. "Lee" could appear in
  // ordinary prose).
  const callerNameTokens = new Set<string>(
    (callerName ?? "")
      .split(/\s+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3),
  );

  for (let i = 0; i < input.allAgentIds.length; i++) {
    const otherId = input.allAgentIds[i];
    const otherName = input.allAgentNames[i];
    if (!otherId || !otherName) continue;
    // Skip the caller's own name and id.
    if (otherId === input.callerAgentId) continue;
    if (callerName !== null && otherName === callerName) continue;

    // Check the full name, the id, AND each significant name token
    // (first / last name). The mock generator and a real model both
    // typically refer to agents by first name ("Priya's stats"), so a
    // full-name-only check is too narrow.
    const tokensToCheck = new Set<string>([otherName, otherId]);
    for (const piece of otherName.split(/\s+/)) {
      if (piece.length < 3) continue;
      if (callerNameTokens.has(piece.toLowerCase())) continue;
      tokensToCheck.add(piece);
    }

    for (const token of tokensToCheck) {
      if (tokenRegex(token).test(text)) {
        reasons.push(
          `cross_user_mention:other_agent_named_or_id_in_response`,
        );
        return {
          response: replaceContent(original, REFUSAL_CROSS_USER),
          appliedRefusal: "cross_user_stats",
          reasons,
        };
      }
    }
  }

  // ---- Check 2: uncited compliance claim ----------------------------
  const config = loadConfig();
  const claimsCompliance = config.complianceClaimPatterns.some((src) => {
    const rx = new RegExp(src, "i");
    return rx.test(text);
  });
  if (claimsCompliance && original.citations.length === 0) {
    reasons.push("uncited_compliance_claim");
    return {
      response: replaceContent(original, REFUSAL_UNSUPPORTED_COMPLIANCE),
      appliedRefusal: "unsupported_compliance",
      reasons,
    };
  }

  return { response: original, reasons };
}

/**
 * Build a new response with the message content replaced. Drops
 * citations (a refusal cannot be "cited from the KB") and clears the
 * usedTool marker (a refusal didn't come from the tool).
 */
function replaceContent(
  original: AssistantTurnResponse,
  newContent: string,
): AssistantTurnResponse {
  return {
    message: { role: "assistant", content: newContent },
    citations: [],
    metadata: {
      ...original.metadata,
    },
  };
}
