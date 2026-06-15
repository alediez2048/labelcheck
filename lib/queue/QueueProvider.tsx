/**
 * Client-side queue store (P2-1 + P2-3).
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
 * The router actions (`applyDistribute`, `handAssign`, `reassign`)
 * call into the pure router modules and translate thrown
 * `RouterError`s into `{ ok, error }` results the UI can render
 * without a try/catch.
 */

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { handAssign as routerHandAssign } from "@/lib/router/handAssign";
import { reassign as routerReassign } from "@/lib/router/reassign";
import { distribute as routerDistribute } from "@/lib/router/distribute";
import { setSpecialization as setSpecializationPure } from "@/lib/router/setSpecialization";
import { RouterError, type DistributeSummary } from "@/lib/router/types";
import type { BeverageType } from "@/types";

import { claimNext as claimNextPure, type ClaimResult } from "./claimNext";
import {
  recordDisposition as recordDispositionPure,
  type DispositionInput,
  type DispositionResult,
} from "./disposition";
import {
  BASELINE_MATCH_RATE,
  DEFAULT_CURRENT_AGENT_ID,
  DEFAULT_SUPERVISOR_ID,
  SEED_AGENTS,
  SEED_APPLICATIONS,
  SEED_AUDIT_EVENTS,
} from "./fixtures";
import { selectMyQueue, selectPoolCount } from "./myQueue";
import type { QueueItem, QueueStoreState } from "./types";

type ActionResult = { ok: true } | { ok: false; error: string };

type QueueContextValue = {
  state: QueueStoreState;
  myQueue: QueueItem[];
  poolCount: number;
  currentAgent: QueueStoreState["agents"][number] | undefined;
  claimNext: () => ClaimResult["outcome"];
  recordDisposition: (input: DispositionInput) => DispositionResult["record"] | null;
  /**
   * Bulk-confirm every match-lane application currently in the store
   * (FR-20, FR-23). Used by the Operations view's "Approve all N"
   * action — one disposition per application is recorded.
   */
  bulkApproveMatchLane: (decidedBy: string) => DispositionResult["record"][];
  /**
   * Set the current agent id — P2-5's role switcher will use this.
   */
  setCurrentAgentId: (id: string) => void;
  /** Run the work router across the shared pool. Returns the summary. */
  applyDistribute: () => DistributeSummary;
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
};

const QueueContext = createContext<QueueContextValue | null>(null);

const INITIAL_STATE: QueueStoreState = {
  agents: SEED_AGENTS,
  applications: SEED_APPLICATIONS,
  currentAgentId: DEFAULT_CURRENT_AGENT_ID,
  baselineMatchRate: BASELINE_MATCH_RATE,
  auditEvents: SEED_AUDIT_EVENTS,
};

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

  const bulkApproveMatchLane = useCallback(
    (decidedBy: string): DispositionResult["record"][] => {
      const matchIds = state.applications
        .filter((a) => a.verification.lane === "match")
        .map((a) => a.applicationId);
      let next = state;
      const records: DispositionResult["record"][] = [];
      for (const id of matchIds) {
        const result = recordDispositionPure(next, {
          applicationId: id,
          disposition: "approve",
          agentId: decidedBy,
        });
        if (result) {
          next = result.state;
          records.push(result.record);
        }
      }
      setState(next);
      return records;
    },
    [state],
  );

  const setCurrentAgentId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, currentAgentId: id }));
  }, []);

  const applyDistribute = useCallback((): DistributeSummary => {
    const result = routerDistribute(state);
    setState(result.state);
    return result.summary;
  }, [state]);

  const handAssign = useCallback(
    (applicationId: string, agentId: string): ActionResult => {
      try {
        const nextState = routerHandAssign(state, applicationId, agentId, {
          id: DEFAULT_SUPERVISOR_ID,
          role: "admin",
        });
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
      try {
        const nextState = routerReassign(
          state,
          applicationId,
          fromAgentId,
          toAgentId,
          { id: DEFAULT_SUPERVISOR_ID, role: "admin" },
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
      try {
        const nextState = setSpecializationPure(state, agentId, types, {
          id: DEFAULT_SUPERVISOR_ID,
          role: "admin",
        });
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
