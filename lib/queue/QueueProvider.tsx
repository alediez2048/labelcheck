/**
 * Client-side queue store (P2-1).
 *
 * Holds the in-memory `QueueStoreState` in React state and exposes the
 * mutation seams (`claimNext`, `recordDisposition`) plus the
 * derived-view selectors. Rendered in `app/(agent)/queue/layout.tsx`
 * so both the queue page and the per-application review detail share
 * the same state without prop-threading.
 *
 * Session-only by design (NFR-4) — a page reload reseeds from the
 * fixtures; nothing persists to disk or to a server.
 */

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

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
} from "./fixtures";
import { selectMyQueue, selectPoolCount } from "./myQueue";
import type { QueueItem, QueueStoreState } from "./types";

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
};

const QueueContext = createContext<QueueContextValue | null>(null);

const INITIAL_STATE: QueueStoreState = {
  agents: SEED_AGENTS,
  applications: SEED_APPLICATIONS,
  currentAgentId: DEFAULT_CURRENT_AGENT_ID,
  baselineMatchRate: BASELINE_MATCH_RATE,
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
    };
  }, [state, claimNext, recordDisposition, bulkApproveMatchLane, setCurrentAgentId]);

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
