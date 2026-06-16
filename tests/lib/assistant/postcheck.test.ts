/**
 * Postcheck unit tests (P4-3).
 *
 * Confirms the response-side guardrail's four behaviours:
 *   1. Uncited compliance claim → REFUSAL_UNSUPPORTED_COMPLIANCE.
 *   2. Cross-user name mention → REFUSAL_CROSS_USER.
 *   3. Clean response (only own name) → passes through.
 *   4. Citation present + compliance claim → passes through.
 */

import { describe, expect, it } from "vitest";

import {
  postcheckResponse,
  __resetPostcheckConfigForTests,
} from "@/lib/assistant/postcheck";
import {
  REFUSAL_CROSS_USER,
  REFUSAL_UNSUPPORTED_COMPLIANCE,
} from "@/lib/assistant/refusals";
import { SEED_AGENTS } from "@/lib/queue/fixtures";
import type { AssistantTurnResponse } from "@/types/assistant";

const ALL_IDS = SEED_AGENTS.map((a) => a.id);
const ALL_NAMES = SEED_AGENTS.map((a) => a.name);

function makeResponse(content: string, citations: AssistantTurnResponse["citations"] = []): AssistantTurnResponse {
  return {
    message: { role: "assistant", content },
    citations,
    metadata: {
      role: "agent",
      retrievedCount: 0,
      totalMs: 0,
    },
  };
}

describe("postcheckResponse", () => {
  it("demotes an uncited compliance claim to REFUSAL_UNSUPPORTED_COMPLIANCE", () => {
    __resetPostcheckConfigForTests();
    const response = makeResponse(
      "You must verify the warning text on the back face.",
      [],
    );
    const result = postcheckResponse({
      response,
      callerAgentId: "agent-marcus",
      callerRole: "agent",
      allAgentIds: ALL_IDS,
      allAgentNames: ALL_NAMES,
    });
    expect(result.appliedRefusal).toBe("unsupported_compliance");
    expect(result.response.message.content).toBe(
      REFUSAL_UNSUPPORTED_COMPLIANCE,
    );
    expect(result.response.citations).toEqual([]);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("replaces a cross-user name mention with REFUSAL_CROSS_USER", () => {
    __resetPostcheckConfigForTests();
    // Marcus is the caller; mentioning "Priya" is a leak.
    const response = makeResponse(
      "Priya's mismatch rate is 18% this month.",
      [],
    );
    const result = postcheckResponse({
      response,
      callerAgentId: "agent-marcus",
      callerRole: "agent",
      allAgentIds: ALL_IDS,
      allAgentNames: ALL_NAMES,
    });
    expect(result.appliedRefusal).toBe("cross_user_stats");
    expect(result.response.message.content).toBe(REFUSAL_CROSS_USER);
  });

  it("passes through a clean response that mentions only the caller", () => {
    __resetPostcheckConfigForTests();
    // Marcus referring to himself is fine.
    const response = makeResponse(
      "Marcus, you've processed 12 applications this month.",
      [],
    );
    const result = postcheckResponse({
      response,
      callerAgentId: "agent-marcus",
      callerRole: "agent",
      allAgentIds: ALL_IDS,
      allAgentNames: ALL_NAMES,
    });
    expect(result.appliedRefusal).toBeUndefined();
    expect(result.response.message.content).toBe(
      response.message.content,
    );
  });

  it("passes through a compliance claim when citations are attached", () => {
    __resetPostcheckConfigForTests();
    // A "you must" line WITH a citation is legitimate.
    const response = makeResponse(
      "According to sample-warning-guidance.md: you must use ALL CAPS for the warning heading.",
      [
        {
          sourceFilename: "sample-warning-guidance.md",
          topic: "warning",
          version: 1,
          title: "Warning guidance",
        },
      ],
    );
    const result = postcheckResponse({
      response,
      callerAgentId: "agent-marcus",
      callerRole: "agent",
      allAgentIds: ALL_IDS,
      allAgentNames: ALL_NAMES,
    });
    expect(result.appliedRefusal).toBeUndefined();
    expect(result.response.message.content).toBe(
      response.message.content,
    );
  });

  it("catches an agent id mention even without the name", () => {
    __resetPostcheckConfigForTests();
    const response = makeResponse(
      "agent-priya processed 4 applications.",
      [],
    );
    const result = postcheckResponse({
      response,
      callerAgentId: "agent-marcus",
      callerRole: "agent",
      allAgentIds: ALL_IDS,
      allAgentNames: ALL_NAMES,
    });
    expect(result.appliedRefusal).toBe("cross_user_stats");
  });

  it("prioritises the cross-user check over the uncited compliance check", () => {
    __resetPostcheckConfigForTests();
    // Both conditions hit; cross-user is the higher-severity refusal.
    const response = makeResponse(
      "You must look at Priya's score.",
      [],
    );
    const result = postcheckResponse({
      response,
      callerAgentId: "agent-marcus",
      callerRole: "agent",
      allAgentIds: ALL_IDS,
      allAgentNames: ALL_NAMES,
    });
    expect(result.appliedRefusal).toBe("cross_user_stats");
  });
});
