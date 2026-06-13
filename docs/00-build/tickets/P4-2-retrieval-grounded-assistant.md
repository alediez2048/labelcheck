# P4-2 — Retrieval-grounded assistant

Build the read-only chat assistant at the bottom-right of the experience: it answers questions, onboards new users, and summarises the user's own role-scoped numbers, grounded only in the knowledge base from P4-1 and in metric_rollup scoped to the caller's role. It never decides, disposes, reassigns, or changes any record.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P4-2: Retrieval-grounded assistant.

Current state: (at start)
- [list what is DONE so far, with check, including P4-1 KB store with seeded chunks, P2-5 role shells, P2-6 metric_rollup data, and any deployed URL]

What's NOT done yet:
- [P4-2] No chat UI; no assistant API route; no retrieval over the KB; no role-scoped summary tool.
- [P4-3] Guardrails (out-of-scope refusal, zero leak) — done in the next ticket on top of this one.

TICKET-P4-2 Goal:
Ship a read-only chat panel anchored bottom-right (visible in both shells), backed by a turn endpoint that (1) retrieves top-k chunks from the P4-1 knowledge base, (2) optionally calls a single role-scoped summary tool over the caller's metric_rollup data, and (3) generates a grounded answer that cites its KB source(s). The assistant must never call any disposition, router, router-edit, or KB-write endpoint. An Agent sees only their own numbers; an Admin sees the division. Refusals for out-of-scope / legal / disposition asks land in P4-3 — but the prompt scaffolding here must already prevent action calls.

Check `lib/kb/*`, `app/api/assistant/`, and `components/assistant/` before starting. Don't overwrite existing code.
Follow the architecture in @systemsdesign.md (Assistant component, D16 role-scoped access) and the eval bars in @observability.md (Component B: groundedness, helpfulness, zero role-scope leak).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (FR-30).
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P4-1. Expected: `lib/kb/store.ts`, `lib/kb/embed.ts`, `lib/kb/search.ts` available; the Knowledge Base tab can ingest documents and at least the seeded `sample-warning-guidance.md` is `ready`. Role switcher and `metric_rollup` fixture data from P2-5 / P2-6 in place.)_

Files created: [paths from P4-1, e.g. `lib/kb/search.ts`, `.data/kb/` populated]
Infrastructure: [single host, env vars for provider key, KB file-backed store]
Current branch: [`feat/kb-ingest` merged to main]

### TICKET-P4-2 Scope

- Phase: Phase 4 — Assistant and knowledge base
- Time budget: 4h
- Dependencies: P4-1 (KB store with at least one indexed source), P2-5 (role shells + role switcher), P2-6 (metric_rollup data the summary tool reads)
- Branch: `feat/assistant`

### Acceptance criteria

- [ ] A chat panel is rendered bottom-right in both Admin and Agent shells (FR-30; systemsdesign Assistant).
- [ ] On each user turn, the server retrieves top-k (default 4) chunks from the P4-1 KB via cosine similarity and includes them in the prompt as the only allowed knowledge source (FR-30, FR-31).
- [ ] The assistant answers about its own numbers by calling exactly one read-only summary tool (`get_my_rollup`) that reads `metric_rollup` row-scoped to the caller's `agent_id` for Agents, and division-wide (`agent_id IS NULL`) for Admins (FR-30; D16; observability.md role-scope isolation).
- [ ] The assistant cites the source filename (and topic) of any KB chunk it relies on, in the response (observability.md: groundedness; FR-31 KB is the only citable source).
- [ ] The assistant has NO tools available for disposition, routing, reassignment, KB write, or any state change (FR-30; CONTEXT.md Assistant).
- [ ] Conversation history is held client-side and per-session only; nothing about the conversation is written to the application DB (NFR-4; schema.md note "the assistant adds no other application-side tables"; observability traces go to the observability backend, not the app DB).
- [ ] If the KB returns no relevant chunks above a similarity floor, the assistant says it doesn't know yet rather than answering from priors (observability.md: no fabricated rules — final form in P4-3, but the prompt scaffolding here must already enforce it).
- [ ] Response latency target: p95 under ~3 seconds per turn on the prototype host (consistent with the verification budget profile — assistant is not on the verification path but should feel snappy).

### Implementation details

1. Define the assistant turn contract in `types/assistant.ts`: `AssistantTurnRequest` (messages, role, userId), `AssistantTurnResponse` (message, citations[], usedTool?: 'get_my_rollup').
2. Build the retrieval step in `lib/assistant/retrieve.ts`: embed the latest user message with the same embedder used at ingest (P4-1), call `kbStore.searchByVector(query, k=4)`, filter chunks below a configured similarity floor (e.g. 0.55 cosine), return the surviving chunks with their `source_filename`, `title`, `topic`, `version`.
3. Build the role-scoped summary tool in `lib/assistant/tools/getMyRollup.ts`:
   - Input: optional `from` / `to` date range, optional `metric` subset.
   - Resolves the caller's identity from the role-switcher context (server-side; never trust a client-supplied role).
   - For role = `agent`, queries `metric_rollup` WHERE `agent_id = :callerId`. For role = `admin`, queries WHERE `agent_id IS NULL` (division-wide rollup).
   - Returns a small JSON shape: processed, match_ct, mismatch_ct, review_ct, approved_ct, returned_ct, avg_handling_seconds, range. NEVER returns another agent's row even if the model "asks" for one.
4. Build the system prompt in `lib/assistant/prompt.ts`. It must state:
   - You are a read-only helper. You can answer questions, onboard, explain how the tool works, and summarise the caller's own numbers.
   - You may cite ONLY the KB chunks provided in this turn's context. If the KB has no answer, say so.
   - You may call `get_my_rollup` for summary questions. You have NO other tools — you cannot approve, return, reassign, or change anything.
   - The caller's role is `{role}`. Their numbers are scoped to that role; do not infer or request another user's data.
   - Cite the source filename when you use a KB chunk.
5. Define the tool schema for `get_my_rollup` and bind it through the existing provider adapter (D8). Production note: this is the same adapter seam used by extraction — a different system prompt and a different (much smaller) tool set, but the same shape.
6. Build the chat panel in `components/assistant/ChatPanel.tsx`: anchored bottom-right (z-index above everything else, dismissible, keyboard accessible per NFR-2), holds messages in component state, posts to `/api/assistant/turn`, renders citations as small footer chips on each assistant message.
7. Wire the chat panel into `app/(admin)/layout.tsx` and `app/(agent)/layout.tsx` so it appears in both shells. The panel itself never changes records — it has no callbacks into the app.
8. Implement `app/api/assistant/turn/route.ts` POST:
   - Behind the access gate (P0-6).
   - Resolves the caller's role + id from the server-side role-switcher state (NEVER from a request body).
   - Calls `retrieve` → optionally `get_my_rollup` if the model elects to → calls the provider adapter for generation → returns the response with citations.
   - Emits a structured trace (OTel-style) with caller role, retrieved source filenames, tool calls, latency, token counts. PII redacted per observability.md. Prototype emits to console / local file (the production Langfuse + Phoenix stack lands in P6-6 and is wired through P5-1).
9. Add tests:
   - Unit: `retrieve` returns the right chunks against a fixture KB and the mock embedder (P4-1).
   - Unit: `get_my_rollup` returns the agent's own row for agents and the division row for admins, and refuses to scope to anyone else's id.
   - Integration: a chat turn that asks "how am I doing this week?" produces a response that cites no KB (it's a numbers question) and whose body matches the rollup row.
   - Integration: a chat turn that asks "what counts as a warning defect?" produces a response that cites the seeded KB source from P4-1.

### Key constraints (from CONTEXT.md, constraints.md, systemsdesign.md)

1. Read-only. The assistant has no tools that mutate state — no disposition, no router, no reassignment, no KB write. The tool registry exposed to the provider is exactly `{ get_my_rollup }` and nothing else (FR-30; CONTEXT.md Assistant; systemsdesign Assistant: "takes no actions, and changes no records").
2. Grounded only in (a) the P4-1 KB and (b) the caller's role-scoped metric_rollup. If neither source supports an answer, the assistant says so — even before the P4-3 guardrails harden this (observability.md: groundedness is the primary quality bar; no fabricated rules).
3. Role-scope isolation, server-side (D16; observability.md): the caller's role and id are resolved on the server from the role-switcher context. The model NEVER sees other users' ids and the tool implementation NEVER accepts an `agent_id` parameter — it derives it from the caller. Zero leak rate is the bar.
4. The verbatim warning text lives in `config/warning.json` (P0-4), not in the KB. If a user asks "what is the warning text", the assistant retrieves a KB chunk that explains the rule and points to the configured value, rather than reciting it from priors.
5. Cross-cutting: TypeScript strict, no `any`. The chat panel is keyboard-navigable and screen-reader friendly (NFR-2).
6. NFR-4: nothing about the conversation lands in the application DB. Traces go to the observability layer.
7. Same adapter seam (D8): the assistant goes through the same provider adapter as extraction, with a different system prompt and tool set.

### Files to modify

Primary: `app/(admin)/layout.tsx` and `app/(agent)/layout.tsx`
Action: mount the `<ChatPanel />` component at the bottom-right, present in both shells.

Also modify:
- `middleware.ts` — ensure `/api/assistant/*` is behind the access gate (P0-6).
- `lib/provider/types.ts` — extend, if needed, to allow a tools list passed through (or document that the assistant uses the provider's chat-with-tools surface directly).

### Files to create

1. `types/assistant.ts` — `AssistantTurnRequest`, `AssistantTurnResponse`, `Citation`, `ToolName` enum.
2. `lib/assistant/retrieve.ts` — embed the query, search the KB, filter below the similarity floor, return citation-ready chunks.
3. `lib/assistant/tools/getMyRollup.ts` — the only tool; reads `metric_rollup` row-scoped to the caller.
4. `lib/assistant/prompt.ts` — the system prompt template (parameterised on role).
5. `lib/assistant/turn.ts` — orchestrator: retrieve → bind tools → call provider → return response + citations.
6. `lib/assistant/trace.ts` — structured turn trace (OTel-shaped attributes, PII-redacted).
7. `app/api/assistant/turn/route.ts` — POST handler.
8. `components/assistant/ChatPanel.tsx` — bottom-right chat UI, mounted in both shells.
9. `components/assistant/Citation.tsx` — small footer chip showing source filename + version.
10. `tests/lib/assistant/retrieve.test.ts`, `tests/lib/assistant/getMyRollup.test.ts`, `tests/app/api/assistant/turn.test.ts`.
11. `fixtures/metric-rollup.ts` — fixture rollup rows for an agent and the division (if not already provided by P2-6).

### Config / schema / store updates

- No new schema. Reads existing `metric_rollup` (P2-6 fixture data); reads the P4-1 KB store.
- Configurable similarity floor and `k` in `config/assistant.json` (new file): `{ "topK": 4, "minSimilarity": 0.55 }` so an admin can tune retrieval without code changes (FR-25 spirit applied to the assistant).
- Traces emitted to console / local file under `.data/traces/assistant/` (gitignored); production replacement is the self-hosted Langfuse/Phoenix backend (observability.md).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Tests to add:
- `tests/lib/assistant/retrieve.test.ts` — given the seeded KB, a query about warning defects returns the relevant chunk; an off-topic query falls below the similarity floor and returns no chunks.
- `tests/lib/assistant/getMyRollup.test.ts` — agent caller gets only their own row; admin caller gets the division row; the tool refuses an `agent_id` parameter even if smuggled in.
- `tests/app/api/assistant/turn.test.ts` — full turn integration: KB-grounded question returns a response with a citation; numbers question returns a response derived from the rollup row.

Manual:
- [ ] As an Agent, ask "how am I doing this week?" — confirm the answer cites no KB and the numbers match the Agent's `metric_rollup` row fixture.
- [ ] Switch to Admin via the role switcher and ask the same question — confirm the answer reports the division-wide numbers (the `agent_id IS NULL` row) and that they DIFFER from the Agent's answer. This is the headline manual check for this ticket: role-scoped summaries differ between Agent and Admin shells.
- [ ] As an Agent, ask "what is my colleague Jane's mismatch rate?" — confirm the assistant declines or scopes back to the caller's own numbers, never names another agent's stats (full guardrail hardening is P4-3, but the tool must already refuse to look up another id).
- [ ] Ask "what counts as a warning defect?" — confirm the response cites the seeded `sample-warning-guidance.md` source and quotes only what the chunk contained.
- [ ] Ask a question with no KB coverage and no rollup angle (e.g. "what's the weather?") — confirm the assistant says it doesn't have the answer rather than improvising.
- [ ] Chat panel is dismissible, keyboard-focusable, and announces new messages to a screen reader (NFR-2).

Eval (observability.md Component B: Chat Assistant Evaluation):
- Run the assistant question set offline (curated stats / how-it-works / onboarding questions). For this ticket:
  - Helpfulness — LLM-as-judge score on the response.
  - Faithfulness / groundedness — does each compliance claim trace back to a retrieved KB chunk?
  - Role-scope isolation — pass/fail; zero leak rate is the bar (caller-only summaries).
- These metrics are recorded; the pass/fail enforcement (CI gate) is sharpened in P4-3 and the CI gate lands in P5-5. Reference observability.md Component B by name in the DEV-LOG.

Update docs: mark P4-2 done in TICKETS.md; add a DEV-LOG entry recording the topK and minSimilarity defaults, the tool registry (`get_my_rollup` only), and a worked example of an Agent vs Admin role-scoped answer.

### Reference

- requirements.md — FR-30 (read-only assistant, role-scoped summaries, never decides), FR-31 (KB is the citable source).
- systemsdesign.md — Assistant component, D16 role-scoped access.
- schema.md — `knowledge_base` (source of citations), `metric_rollup` (source of numbers; `agent_id IS NULL` row = division-wide).
- observability.md — Component B: Chat Assistant Evaluation (groundedness, helpfulness, faithfulness, role-scope leak rate, response latency).
- CONTEXT.md — Assistant definition (read-only, never decides, distinct AI component from Verification).
- techstack.md — D8 swappable provider adapter (the assistant uses the same adapter).

### Common gotchas

1. The assistant is read-only — it must NEVER call any disposition, router, router-edit, KB-write, or any state-changing endpoint. The tool registry exposed to the provider is exactly `{ get_my_rollup }`. A tempting refactor is to "let it propose a disposition" — do not; that violates FR-30 and CONTEXT.md (Assistant). The Agent owns the disposition (CONTEXT.md: Disposition).
2. Grounded retrieval ONLY in (a) the P4-1 KB and (b) the caller's own role-scoped `metric_rollup`. Falling back to model priors is a faithfulness failure (observability.md). If retrieval is empty and the question is not a numbers question, say "I don't have an answer for that yet — try the docs or your supervisor."
3. Role scope is resolved server-side, never from a request body. An Agent sees only their own numbers (`agent_id = callerId`); an Admin sees the division (`agent_id IS NULL`). The tool implementation must not accept an `agent_id` parameter — derive it from the authenticated caller, full stop. This is the security eval the observability framework calls out (observability.md: role-scope isolation; zero leak rate).
4. The same provider adapter as extraction (D8) is used here — different system prompt, different (tiny) tool set, but the same swappable seam. Do not introduce a second adapter abstraction for the assistant.
5. Conversation history is per-session and client-side; nothing lands in the application DB (NFR-4; schema.md note). Traces are observability data, in a separate backend, and PII-redacted.
6. Cite the source filename and version on every KB-grounded claim. An uncited response that sounds confident is a groundedness failure waiting to be flagged in the offline eval.

### Definition of Done

Code complete when:
- [ ] Chat panel is visible bottom-right in both Admin and Agent shells.
- [ ] `/api/assistant/turn` retrieves top-k KB chunks above the similarity floor, optionally calls `get_my_rollup`, returns a grounded response with citations.
- [ ] The only tool the model can call is `get_my_rollup`; it derives the caller from the server, not from input.
- [ ] An Agent sees only their own numbers; an Admin sees the division — and the two answers DIFFER in the manual test.
- [ ] No conversation data lands in the application DB.
- [ ] Traces are emitted in the observability shape (caller role, retrieved sources, tool calls, latency).
- [ ] No console / test errors; `pnpm lint` + `pnpm build` + `pnpm test` clean.
- [ ] Cross-cutting bars met where applicable (NFR-2 keyboard / screen reader).

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual, assistant eval recorded against observability.md Component B).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/assistant`, pushed, merged to main.

### Expected output

A bottom-right chat panel in both shells answers grounded questions from the P4-1 KB and summarises the caller's own role-scoped numbers via a single read-only tool. The Agent's "how am I doing" answer differs from the Admin's "how is the division doing" answer. No KB or app-DB writes occur. P4-3 hardens the refusal behaviour and the zero-leak guarantee on top of this.

### Dependencies to install

```
# Likely already added in P4-1; otherwise:
pnpm add @anthropic-ai/sdk
# OR
pnpm add openai

# No new dependencies strictly required if P4-1 chose the same provider for embeddings.
# Optional: a small server-side rate limiter on /api/assistant/turn (e.g. an in-memory token bucket)
# — not a new dep, just a util.
```
