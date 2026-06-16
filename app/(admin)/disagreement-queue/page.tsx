/**
 * /disagreement-queue — sampled tool-vs-agent disagreements (P5-3).
 *
 * Bidirectional review surface from observability.md: every override
 * gets sampled here and the team confirms who was actually right. The
 * confirmation back-writes onto the record so the accumulating
 * agent-corrections corpus stays trustworthy (without it, every
 * override is silently treated as a tool error and the corpus drifts).
 *
 * The page polls because dispositions land continuously from the queue
 * UI; an interval-based pull keeps the surface live without the
 * supervisor having to refresh. Chained timeouts (not `setInterval`)
 * so a slow response can't stack a backlog of in-flight fetches.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { DisagreementRow } from "@/components/feedback/DisagreementRow";
import type {
  FeedbackConfirmResponse,
  FeedbackDisagreementsResponse,
} from "@/components/feedback/types";

const POLL_INTERVAL_MS = 8_000;

export default function DisagreementQueuePage(): React.ReactElement {
  const [data, setData] = useState<FeedbackDisagreementsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOnce = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/feedback/disagreements", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as FeedbackDisagreementsResponse;
      if (!mountedRef.current) return;
      setData(json);
      setLoadError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      const msg = e instanceof Error ? e.message : "Unknown error";
      setLoadError(`Could not load disagreement queue: ${msg}`);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    async function tick(): Promise<void> {
      await fetchOnce();
      if (mountedRef.current) {
        timerRef.current = setTimeout(() => {
          void tick();
        }, POLL_INTERVAL_MS);
      }
    }

    void tick();

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchOnce]);

  const handleConfirm = useCallback(
    async (
      id: string,
      confirmation: "tool_was_right" | "agent_was_right",
    ): Promise<void> => {
      setActionError(null);
      const res = await fetch(
        `/api/feedback/disagreements/${encodeURIComponent(id)}/confirm`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ confirmation }),
        },
      );

      let payload: FeedbackConfirmResponse;
      try {
        payload = (await res.json()) as FeedbackConfirmResponse;
      } catch {
        const msg = `HTTP ${res.status}`;
        setActionError(msg);
        throw new Error(msg);
      }

      if (!res.ok || payload.ok !== true) {
        const msg =
          payload.ok === false ? payload.error : `HTTP ${res.status}`;
        setActionError(msg);
        throw new Error(msg);
      }

      // Refresh on success so the row's "confirmed" chip lands immediately.
      await fetchOnce();
    },
    [fetchOnce],
  );

  const items = data?.items ?? [];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Disagreement queue
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cases where the tool and the agent disagreed. Confirm who was
          right; the corpus learns either way.
        </p>
      </header>

      {actionError !== null && (
        <p
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="mr-1 font-bold">
            ✕
          </span>
          {actionError}
        </p>
      )}

      {loadError !== null && data === null && (
        <p
          role="alert"
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="mr-1 font-bold">
            ✕
          </span>
          {loadError}
        </p>
      )}

      {data === null && loadError === null && (
        <p className="text-sm text-slate-500">Loading disagreements…</p>
      )}

      {data !== null && items.length === 0 && (
        <section
          aria-labelledby="empty-heading"
          className="rounded-md border border-slate-200 bg-white p-6 text-center"
        >
          <p
            id="empty-heading"
            className="text-base font-semibold text-slate-800"
          >
            No disagreements today.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The tool and the agents agreed on everything they reviewed.
          </p>
        </section>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <DisagreementRow
              key={item.id}
              item={item}
              onConfirm={handleConfirm}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
