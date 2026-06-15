/**
 * `lib/auth/scope` tests (P2-5).
 *
 * Centralised admin gate — `requireAdmin` is what every admin-only
 * router operation calls. The tests pin the predicate (admin passes,
 * non-admin throws RouterError("not_admin")) and the `actorFromAgent`
 * shape conversion.
 */

import { describe, expect, it } from "vitest";

import { actorFromAgent, requireAdmin } from "../scope";
import { RouterError } from "@/lib/router/types";
import type { QueueAgent } from "@/lib/queue/types";

describe("requireAdmin", () => {
  it("passes for an admin actor", () => {
    expect(() =>
      requireAdmin({ id: "admin-sasha", role: "admin" }),
    ).not.toThrow();
  });

  it("throws RouterError('not_admin') for a non-admin actor", () => {
    try {
      requireAdmin({ id: "agent-marcus", role: "agent" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError);
      expect((e as RouterError).code).toBe("not_admin");
    }
  });
});

describe("actorFromAgent", () => {
  it("copies id and role from a QueueAgent", () => {
    const agent: QueueAgent = {
      id: "agent-marcus",
      name: "Marcus Lee",
      role: "agent",
      specializations: ["distilled_spirits"],
      availability: "available",
    };
    expect(actorFromAgent(agent)).toEqual({
      id: "agent-marcus",
      role: "agent",
    });
  });

  it("preserves admin role", () => {
    const agent: QueueAgent = {
      id: "admin-sasha",
      name: "Sasha Okafor",
      role: "admin",
      specializations: [],
      availability: "available",
    };
    expect(actorFromAgent(agent)).toEqual({
      id: "admin-sasha",
      role: "admin",
    });
  });
});
