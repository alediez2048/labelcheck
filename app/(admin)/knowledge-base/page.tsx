/**
 * /knowledge-base — admin-managed corpus the assistant cites (P4-1).
 *
 * Composes the upload dropzone and the source list, and owns the
 * polling loop that watches in-flight ingestions transition to
 * `ready` / `failed`. The polling cadence is 800 ms — fast enough to
 * feel live for a single-doc demo, slow enough that a backlog of
 * sources doesn't hammer the route. The loop stops as soon as every
 * source is terminal, so an idle KB tab makes zero requests after
 * the initial fetch.
 *
 * Why a `setTimeout` chain instead of `setInterval`: requests
 * sometimes outlast the interval (slow disk, large embed batch).
 * Chaining off the fetch's resolution prevents stacked in-flight
 * polls. The interval-style ticker also keeps polling after
 * everything is `ready`, which wastes the budget.
 *
 * Admin gating: this route is wrapped by `app/(admin)/layout.tsx`,
 * which redirects non-admins. The `uploadedBy` we pass to the
 * dropzone is the active admin from the QueueProvider — that becomes
 * the audit attribution for every chunk this upload writes.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { SourcesList } from "@/components/kb/SourcesList";
import { UploadDropzone } from "@/components/kb/UploadDropzone";
import { useQueue } from "@/lib/queue/QueueProvider";
import type { KnowledgeBaseSource } from "@/types/kb";

const POLL_INTERVAL_MS = 800;

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; sources: ReadonlyArray<KnowledgeBaseSource> }
  | { kind: "error"; message: string };

export default function KnowledgeBasePage(): React.ReactElement {
  const { currentAgent } = useQueue();
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "loading" });
  const [replaceModeFor, setReplaceModeFor] = useState<string | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);
  /**
   * `unmountedRef` guards against setting state after the page
   * unmounts in the middle of a poll — strict-mode double-mount in
   * dev otherwise logs a noisy "state on unmounted" warning.
   */
  const unmountedRef = useRef(false);
  /**
   * Tracks the next scheduled poll so it can be cleared when the
   * page unmounts or a manual refetch supersedes it.
   */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSources = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/kb/sources", { cache: "no-store" });
      if (!res.ok) {
        if (!unmountedRef.current) {
          setFetchState({
            kind: "error",
            message: "Could not load the source list.",
          });
        }
        return;
      }
      const body = (await res.json()) as {
        sources: ReadonlyArray<KnowledgeBaseSource>;
      };
      if (unmountedRef.current) return;
      setFetchState({ kind: "ready", sources: body.sources });

      // Schedule the next poll only if any source is still mid-flight.
      const inFlight = body.sources.some(
        (s) => s.status === "queued" || s.status === "indexing",
      );
      if (inFlight) {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          void fetchSources();
        }, POLL_INTERVAL_MS);
      }
    } catch {
      if (!unmountedRef.current) {
        setFetchState({
          kind: "error",
          message: "Could not reach the knowledge base service.",
        });
      }
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    void fetchSources();
    return () => {
      unmountedRef.current = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchSources]);

  const handleUploadComplete = useCallback((): void => {
    // The upload returned 202 — kick the polling loop so the new
    // source surfaces immediately rather than waiting for the next
    // scheduled tick.
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    void fetchSources();
  }, [fetchSources]);

  const handleReplaceClick = useCallback((sourceFilename: string): void => {
    setReplaceModeFor(sourceFilename);
    uploadSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleReplaceModeCleared = useCallback((): void => {
    setReplaceModeFor(null);
  }, []);

  const uploadedBy = currentAgent?.id ?? "admin";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The corpus the assistant is allowed to cite. Upload reference
          documents; re-upload to bump the version.
        </p>
      </header>

      <div ref={uploadSectionRef} className="mt-8">
        <UploadDropzone
          uploadedBy={uploadedBy}
          onUploadComplete={handleUploadComplete}
          replaceModeFor={replaceModeFor}
          onReplaceModeCleared={handleReplaceModeCleared}
        />
      </div>

      <div className="mt-6">
        {fetchState.kind === "loading" ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600"
          >
            Loading documents…
          </p>
        ) : fetchState.kind === "error" ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900"
          >
            <span aria-hidden="true">⚠</span> {fetchState.message}
          </p>
        ) : (
          <SourcesList
            sources={fetchState.sources}
            onReplaceClick={handleReplaceClick}
          />
        )}
      </div>
    </main>
  );
}
