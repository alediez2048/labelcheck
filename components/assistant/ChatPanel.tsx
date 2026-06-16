/**
 * ChatPanel — bottom-right floating chat for the read-only assistant
 * (P4-2; FR-30, FR-31; systemsdesign.md Assistant).
 *
 * Why floating + same component in both shells: the assistant is a
 * helper layer over the work, not a route. Mounting one component in
 * both `(admin)` and `(agent)` layouts means the same UI surface is
 * present everywhere a signed-in actor can be, and the role-scoped
 * server-side resolution does the rest (D16). The panel itself reads
 * `currentAgent` from `useQueue()` so it can label the session
 * ("As {name} · {role}") and pass `activeAgentId` on every turn — but
 * never trusts the client value for authorisation; the server
 * re-derives it (D16; observability.md role-scope isolation).
 *
 * Session-only state (NFR-4): messages and citations live in component
 * state and reset on reload. Nothing about the conversation lands in
 * the application DB; traces are an observability concern, not an app
 * one. This is why the component keeps its own state instead of
 * reaching for a provider or persistence layer.
 *
 * Accessibility (NFR-2): role="dialog" + aria-modal="false" — the
 * panel floats over the page but does not block underlying focus, so
 * the agent can read context while typing a question. The message
 * list is an aria-live="polite" region so new assistant turns are
 * announced without stealing focus from the textarea.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useQueue } from "@/lib/queue/QueueProvider";
import {
  REFUSAL_CROSS_USER,
  REFUSAL_DISPOSITION,
  REFUSAL_LEGAL,
  REFUSAL_OUT_OF_SCOPE,
  REFUSAL_RATIONALE,
  REFUSAL_UNSUPPORTED_COMPLIANCE,
  type RefusalKind,
} from "@/lib/assistant/refusals";
import type {
  AssistantMessage,
  AssistantTurnRequest,
  AssistantTurnResponse,
  Citation as CitationType,
} from "@/types/assistant";

import { Citation } from "./Citation";

/**
 * Map a message content string to the refusal kind it represents
 * (or null when it's a normal answer). Used by the UI to decide
 * whether to render the refusal treatment (NFR-2: refusals are
 * signalled with colour + icon + text, not tone alone).
 */
function detectRefusalKind(content: string): RefusalKind | null {
  switch (content) {
    case REFUSAL_LEGAL:
      return "legal_advice";
    case REFUSAL_DISPOSITION:
      return "disposition_request";
    case REFUSAL_CROSS_USER:
      return "cross_user_stats";
    case REFUSAL_UNSUPPORTED_COMPLIANCE:
      return "unsupported_compliance";
    case REFUSAL_OUT_OF_SCOPE:
      return "out_of_scope";
    default:
      return null;
  }
}

const WELCOME_TEXT =
  "Ask me how the tool works, what counts as a defect, or how you're doing this week. I can only answer from the Knowledge Base and your own numbers.";

const NETWORK_ERROR_MESSAGE =
  "Could not reach the assistant — please try again.";

export function ChatPanel(): React.ReactElement {
  const { currentAgent } = useQueue();

  // Component-local state — NFR-4 says nothing about the conversation
  // persists. `assistantCitations` is index-aligned with `messages`:
  // only the assistant rows have non-empty arrays; user rows hold [].
  const [open, setOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [assistantCitations, setAssistantCitations] = useState<
    CitationType[][]
  >([]);
  const [input, setInput] = useState<string>("");
  const [inflight, setInflight] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  // Esc closes the panel — the same affordance HandAssignPicker uses
  // so the keyboard model is consistent across floating surfaces.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Auto-scroll the message list when a new turn lands. We scroll the
  // scrollable container itself rather than the document so the rest
  // of the page never jumps under the user.
  useEffect(() => {
    const list = messageListRef.current;
    if (list === null) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.length, inflight]);

  // When the panel opens, focus the textarea so a keyboard user can
  // type immediately — the floating launcher is the entry point, the
  // textarea is where the work happens.
  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
  }, [open]);

  const sendTurn = useCallback(async (): Promise<void> => {
    const trimmed = input.trim();
    if (trimmed.length === 0) return;
    if (inflight) return;
    if (currentAgent === undefined) return;

    const userMessage: AssistantMessage = {
      role: "user",
      content: trimmed,
    };
    const nextMessages: AssistantMessage[] = [...messages, userMessage];

    setMessages(nextMessages);
    setAssistantCitations((prev) => [...prev, []]);
    setInput("");
    setInflight(true);
    setErrorMessage(null);

    const body: AssistantTurnRequest = {
      messages: nextMessages,
      activeAgentId: currentAgent.id,
    };

    try {
      const response = await fetch("/api/assistant/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // Surface the parallel agent's contract error shape — 400 or
        // 500 returns `{ error: string }`. We render it inline rather
        // than clearing the user's message; the user can edit + retry.
        let serverError = `Assistant error (${response.status}).`;
        try {
          const parsed: unknown = await response.json();
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "error" in parsed &&
            typeof (parsed as { error: unknown }).error === "string"
          ) {
            serverError = (parsed as { error: string }).error;
          }
        } catch {
          // Body not JSON — keep the generic status-code message.
        }
        setErrorMessage(serverError);
        return;
      }

      const payload = (await response.json()) as AssistantTurnResponse;
      setMessages((prev) => [...prev, payload.message]);
      setAssistantCitations((prev) => [...prev, payload.citations]);
    } catch {
      // Network-level failure — the user never got past the fetch.
      // Generic copy keeps us from leaking implementation detail.
      setErrorMessage(NETWORK_ERROR_MESSAGE);
    } finally {
      setInflight(false);
    }
  }, [input, inflight, currentAgent, messages]);

  const onKeyDownTextarea = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Enter sends; Shift+Enter inserts a newline (familiar chat
      // pattern). We void the promise — React event handlers can't be
      // async, and we don't care about the return value here.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendTurn();
      }
    },
    [sendTurn],
  );

  // The floating launcher — always rendered when closed; when open,
  // the panel sits in roughly the same corner and the launcher visually
  // hides behind it (we just stop rendering it).
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-300 bg-white text-2xl shadow-lg transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <span aria-hidden="true">{"\u{1F4AC}"}</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-labelledby="assistant-title"
      aria-modal="false"
      className="fixed bottom-4 right-4 z-50 flex h-[520px] max-h-[calc(100vh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
    >
      {/* Header — title, role caption, close. */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex flex-col">
          <h2
            id="assistant-title"
            className="text-sm font-semibold text-slate-900"
          >
            Assistant
          </h2>
          {currentAgent !== undefined ? (
            <p className="text-xs text-slate-500">
              As {currentAgent.name}
              <span aria-hidden="true"> · </span>
              <span className="capitalize">{currentAgent.role}</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <span aria-hidden="true">{"\u00D7"}</span>
        </button>
      </div>

      {/* Body — message list, scrollable. aria-live="polite" so
          assistive tech announces new assistant turns without stealing
          focus (NFR-2). */}
      <div
        ref={messageListRef}
        role="log"
        aria-live="polite"
        aria-label="Assistant conversation"
        className="flex-1 overflow-y-auto px-3 py-3"
      >
        {currentAgent === undefined ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span aria-hidden="true" className="mr-1">
              {"\u26A0"}
            </span>
            Sign in via the role switcher to use the assistant.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-600">{WELCOME_TEXT}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message, index) => {
              const citations = assistantCitations[index] ?? [];
              const isUser = message.role === "user";
              const refusalKind = !isUser
                ? detectRefusalKind(message.content)
                : null;
              return (
                <li
                  key={index}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900"
                        : refusalKind !== null
                          ? "relative max-w-[85%] whitespace-pre-wrap rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2 pr-7 text-sm text-amber-900"
                          : "max-w-[85%] whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    }
                  >
                    {refusalKind !== null ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-2 top-1 text-amber-600"
                      >
                        {"\u26A0"}
                      </span>
                    ) : null}
                    {message.content}
                    {refusalKind !== null ? (
                      <details className="mt-1 text-xs text-amber-800">
                        <summary className="cursor-pointer select-none font-medium">
                          Why?
                        </summary>
                        <p className="mt-1">{REFUSAL_RATIONALE[refusalKind]}</p>
                      </details>
                    ) : null}
                  </div>
                  {!isUser && citations.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {citations.map((citation, cIdx) => (
                        <Citation
                          key={`${index}-${cIdx}`}
                          citation={citation}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {inflight ? (
          <p
            className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400"
            />
            Thinking…
          </p>
        ) : null}

        {errorMessage !== null ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900"
          >
            <span aria-hidden="true" className="mr-1">
              {"\u26A0"}
            </span>
            {errorMessage}
          </p>
        ) : null}
      </div>

      {/* Footer — textarea + Send. Disabled while a turn is in flight
          OR when there's no active agent (the body shows the
          placeholder in that case and Send would have nothing to do). */}
      <form
        className="flex items-end gap-2 border-t border-slate-200 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendTurn();
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message
        </label>
        <textarea
          id="assistant-input"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDownTextarea}
          rows={2}
          disabled={inflight || currentAgent === undefined}
          placeholder={
            currentAgent === undefined
              ? "Sign in to ask a question"
              : "Ask a question…"
          }
          className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={
            inflight ||
            currentAgent === undefined ||
            input.trim().length === 0
          }
          className="flex h-10 min-h-[40px] items-center gap-1 rounded-md border border-slate-300 bg-slate-900 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
        >
          <span aria-hidden="true">{"\u27A4"}</span>
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}
