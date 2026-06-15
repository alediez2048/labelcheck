/**
 * Client-side queue store (P2-1 + P2-3 + P2-5).
 *
 * Holds the in-memory `QueueStoreState` in React state and exposes the
 * mutation seams (`claimNext`, `recordDisposition`, router actions)
 * plus derived-view selectors. Rendered in `app/(agent)/queue/layout.tsx`
 * and `app/(admin)/operations/layout.tsx` so the queue page, the
 * per-application review detail, and the Operations view share the
 * same state without prop-threading.
 *
 * Session-only by design (NFR-4) — a page reload reseeds from the
 * fixtures; nothing persists to disk or to a server.
 *
 * Admin-gated actions (`bulkApproveMatchLane`, `applyDistribute`,
 * `handAssign`, `reassign`, `setSpecialization`) derive the actor from
 * `state.currentAgentId` + the agent's `role` — `state.currentAgentId`
 * IS the active-agent store (D16; the role switcher in P2-5 mutates it
 * via `setCurrentAgentId`). They translate thrown `RouterError`s into
 * `{ ok, error }` results the UI can render without a try/catch. The
 * lib layer still throws — defense in depth means a direct call from
 * outside the provider still hits the gate.
 */

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { actorFromAgent } from "@/lib/auth/scope";
import { handAssign as routerHandAssign } from "@/lib/router/handAssign";
import { reassign as routerReassign } from "@/lib/router/reassign";
import { distribute as routerDistribute } from "@/lib/router/distribute";
import { setSpecialization as setSpecializationPure } from "@/lib/router/setSpecialization";
import { RouterError, type DistributeSummary } from "@/lib/router/types";
import type { BeverageType, DispositionRecord } from "@/types";

import { claimNext as claimNextPure, type ClaimResult } from "./claimNext";
import {
  recordDisposition as recordDispositionPure,
  type DispositionInput,
  type DispositionResult,
} from "./disposition";
import {
  BASELINE_MATCH_RATE,
  DEFAULT_CURRENT_AGENT_ID,
  SEED_AGENTS,
  SEED_APPLICATIONS,
  SEED_AUDIT_EVENTS,
  SEED_DISPOSITIONED_APPLICATIONS,
} from "./fixtures";
import { selectMyQueue, selectPoolCount } from "./myQueue";
import type { QueueAgent, QueueItem, QueueStoreState } from "./types";

type ActionResult = { ok: true } | { ok: false; error: string };
type BulkApproveResult =
  | { ok: true; records: DispositionRecord[] }
  | { ok: false; error: string };
type DistributeResult =
  | { ok: true; summary: DistributeSummary }
  | { ok: false; error: string };

type QueueContextValue = {
  state: QueueStoreState;
  myQueue: QueueItem[];
  poolCount: number;
  currentAgent: QueueAgent | undefined;
  claimNext: () => ClaimResult["outcome"];
  recordDisposition: (input: DispositionInput) => DispositionResult["record"] | null;
  /**
   * Bulk-confirm every match-lane application currently in the store
   * (FR-20, FR-23). The actor is derived from `state.currentAgentId` —
   * the active agent must be an admin (D16). Returns `{ ok, records }`
   * on success, `{ ok: false, error }` if the active agent is missing
   * or not admin.
   */
  bulkApproveMatchLane: () => BulkApproveResult;
  /**
   * Set the current agent id — the role switcher (P2-5) uses this to
   * swap active identity between the supervisor and a seeded agent.
   */
  setCurrentAgentId: (id: string) => void;
  /**
   * Run the work router across the shared pool (admin-only). Returns
   * `{ ok, summary }` on success, `{ ok: false, error }` if the active
   * agent is missing or not admin.
   */
  applyDistribute: () => DistributeResult;
  /** Supervisor hand-assigns a pool item (or claimed item) to an agent. */
  handAssign: (applicationId: string, agentId: string) => ActionResult;
  /**
   * Supervisor reassigns a claimed item from one agent to another,
   * or back to pool when `toAgentId === null`.
   */
  reassign: (
    applicationId: string,
    fromAgentId: string,
    toAgentId: string | null,
  ) => ActionResult;
  /**
   * Admin-only: replace an agent's specializations. The next
   * Distribute reflects the change; currently-claimed items are NOT
   * touched (the supervisor uses `reassign` for that).
   */
  setSpecialization: (
    agentId: string,
    types: ReadonlyArray<BeverageType>,
  ) => ActionResult;
  /**
   * Set an agent's availability. Admins can edit anyone; agents can
   * edit only their own row (CONTEXT.md Availability — Profile screen
   * lets an agent go OOO without supervisor help). No audit event is
   * emitted: the existing audit pattern is for admin overrides, and
   * an agent toggling their own status is not an override.
   */
  setAvailability: (
    agentId: string,
    availability: "available" | "out_of_office",
  ) => ActionResult;
};

const QueueContext = createContext<QueueContextValue | null>(null);

const INITIAL_STATE: QueueStoreState = {
  agents: SEED_AGENTS,
  applications: SEED_APPLICATIONS,
  dispositionedApplications: SEED_DISPOSITIONED_APPLICATIONS,
  currentAgentId: DEFAULT_CURRENT_AGENT_ID,
  baselineMatchRate: BASELINE_MATCH_RATE,
  auditEvents: SEED_AUDIT_EVENTS,
};

const NO_ACTIVE_AGENT_ERROR = "No active agent";

export function QueueProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<QueueStoreState>(INITIAL_STATE);

  const claimNext = useCallback((): ClaimResult["outcome"] => {
    const result = claimNextPure(state);
    setState(result.state);
    return result.outcome;
  }, [state]);

  const recordDisposition = useCallback(
    (input: DispositionInput): DispositionResult["record"] | null => {
      const result = recordDispositionPure(state, input);
      if (!result) return null;
      setState(result.state);
      return result.record;
    },
    [state],
  );

  const bulkApproveMatchLane = useCallback((): BulkApproveResult => {
    const currentAgent = state.agents.find(
      (a) => a.id === state.currentAgentId,
    );
    if (!currentAgent) {
      return { ok: false, error: NO_ACTIVE_AGENT_ERROR };
    }
    if (currentAgent.role !== "admin") {
      return {
        ok: false,
        error: `Admin role required; got "${currentAgent.role}"`,
      };
    }

    const matchIds = state.applications
      .filter((a) => a.verification.lane === "match")
      .map((a) => a.applicationId);
    let next = state;
    const records: DispositionRecord[] = [];
    for (const id of matchIds) {
      const result = recordDispositionPure(next, {
        applicationId: id,
        disposition: "approve",
        agentId: currentAgent.id,
      });
      if (result) {
        next = result.state;
        records.push(result.record);
      }
    }
    setState(next);
    return { ok: true, records };
  }, [state]);

  const setCurrentAgentId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, currentAgentId: id }));
  }, []);

  const applyDistribute = useCallback((): DistributeResult => {
    const currentAgent = state.agents.find(
      (a) => a.id === state.currentAgentId,
    );
    if (!currentAgent) {
      return { ok: false, error: NO_ACTIVE_AGENT_ERROR };
    }
    try {
      const result = routerDistribute(state, actorFromAgent(currentAgent));
      setState(result.state);
      return { ok: true, summary: result.summary };
    } catch (error) {
      if (error instanceof RouterError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  }, [state]);

  const handAssign = useCallback(
    (applicationId: string, agentId: string): ActionResult => {
      const currentAgent = state.agents.find(
        (a) => a.id === state.currentAgentId,
      );
      if (!currentAgent) {
        return { ok: false, error: NO_ACTIVE_AGENT_ERROR };
      }
      try {
        const nextState = routerHandAssign(
          state,
          applicationId,
          agentId,
          actorFromAgent(currentAgent),
        );
        setState(nextState);
        return { ok: true };
      } catch (error) {
        if (error instanceof RouterError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
    [state],
  );

  const reassign = useCallback(
    (
      applicationId: string,
      fromAgentId: string,
      toAgentId: string | null,
    ): ActionResult => {
      const currentAgent = state.agents.find(
        (a) => a.id === state.currentAgentId,
      );
      if (!currentAgent) {
        return { ok: false, error: NO_ACTIVE_AGENT_ERROR };
      }
      try {
        const nextState = routerReassign(
          state,
          applicationId,
          fromAgentId,
          toAgentId,
          actorFromAgent(currentAgent),
        );
        setState(nextState);
        return { ok: true };
      } catch (error) {
        if (error instanceof RouterError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
    [state],
  );

  const setSpecialization = useCallback(
    (
      agentId: string,
      types: ReadonlyArray<BeverageType>,
    ): ActionResult => {
      const currentAgent = state.agents.find(
        (a) => a.id === state.currentAgentId,
      );
      if (!currentAgent) {
        return { ok: false, error: NO_ACTIVE_AGENT_ERROR };
      }
      try {
        const nextState = setSpecializationPure(
          state,
          agentId,
          types,
          actorFromAgent(currentAgent),
        );
        setState(nextState);
        return { ok: true };
      } catch (error) {
        if (error instanceof RouterError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
    [state],
  );

  const setAvailability = useCallback(
    (
      agentId: string,
      availability: "available" | "out_of_office",
    ): ActionResult => {
      const currentAgent = state.agents.find(
        (a) => a.id === state.currentAgentId,
      );
      if (!currentAgent) {
        return { ok: false, error: NO_ACTIVE_AGENT_ERROR };
      }
      // Admins can edit anyone; agents can edit only their own row.
      if (currentAgent.role !== "admin" && currentAgent.id !== agentId) {
        return {
          ok: false,
          error: "Cannot edit another agent's availability",
        };
      }
      const index = state.agents.findIndex((a) => a.id === agentId);
      if (index === -1) {
        return { ok: false, error: `Agent ${agentId} not found` };
      }
      const previous = state.agents[index]!;
      if (previous.availability === availability) {
        // No-op — keep the same object identity so referential
        // equality checks downstream don't see a spurious change.
        return { ok: true };
      }
      const nextAgents = [...state.agents];
      nextAgents[index] = { ...previous, availability };
      setState({ ...state, agents: nextAgents });
      return { ok: true };
    },
    [state],
  );

  const value = useMemo<QueueContextValue>(() => {
    return {
      state,
      myQueue: selectMyQueue(state),
      poolCount: selectPoolCount(state),
      currentAgent: state.agents.find((a) => a.id === state.currentAgentId),
      claimNext,
      recordDisposition,
      bulkApproveMatchLane,
      setCurrentAgentId,
      applyDistribute,
      handAssign,
      reassign,
      setSpecialization,
      setAvailability,
    };
  }, [
    state,
    claimNext,
    recordDisposition,
    bulkApproveMatchLane,
    setCurrentAgentId,
    applyDistribute,
    handAssign,
    reassign,
    setSpecialization,
    setAvailability,
  ]);

  return (
    <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
  );
}

export function useQueue(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (ctx === null) {
    throw new Error(
      "useQueue must be used inside a <QueueProvider> — wrap the route in app/(agent)/queue/layout.tsx",
    );
  }
  return ctx;
}
