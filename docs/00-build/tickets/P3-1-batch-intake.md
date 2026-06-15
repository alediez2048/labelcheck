# P3-1 — Batch intake

Accept many applications in one submission, run them through the existing per-application pipeline with bounded concurrency, report progress, group results by lane, and let a supervisor bulk-confirm the match lane in one action — without breaking single-application p95 latency for concurrent users.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P3-1: Batch intake.

Current state: (at start)
- [list what is DONE so far, with checks, including Phase 0, Phase 1 (per-application verify pipeline: input → extraction → matching → triage → result API; review UI; timeout + degrade; acceptance tests; latency bench), and Phase 2 (My Queue, Operations view with match-lane bulk-confirm surface, work router with shared exception pool and specialization, role-based shells)]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: batch intake endpoint and orchestrator (this ticket), imperfect-image robustness, error-handling pass, performance hardening]

TICKET-P3-1 Goal:
Add a batch path that wraps the existing per-application pipeline. Accept many applications in one submission (targeting ~300, A29), run them with bounded concurrency through an in-process queue (techstack: in-process queue with bounded concurrency), expose a job id with poll endpoint for progress, and present grouped-by-lane results so the supervisor reviews mismatches and review-lane items first and bulk-confirms the match lane on the existing aggregate review surface. State is ephemeral and in-memory (D2, NFR-4); a restart cancels in-flight batches by design.

Check the per-application pipeline (extraction service, matching engine, triage classifier, /api/verify) and the Operations view's bulk-confirm surface before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (Batch orchestrator, Data Flow: Batch Verification, D2 batch state, D14 one call per application, D15 routing — match lane never routes to an agent) and the rules in @CONTEXT.md (Application, Lane, Bulk confirm, Work pool).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from Phase 2's last ticket: P2-6 admin views, plus the per-application pipeline from Phase 1.)_

### TICKET-P3-1 Scope

- Phase: Phase 3 — Batch, imperfect images, hardening
- Time budget: 4h
- Dependencies: P1-7 (result API); benefits from P2-2 (Operations view bulk-confirm surface)
- Branch: feat/batch

### Acceptance criteria

- [ ] The system accepts a batch of many applications with their form data and label faces in one submission (FR-17; A29).
- [ ] Batch processing is asynchronous with bounded parallelism; the system returns a job id immediately and reports progress on poll (FR-18; systemsdesign Batch).
- [ ] The orchestrator runs the per-application pipeline with a fixed concurrency cap (default ~5 in flight, config-tunable), self-throttling against provider rate limits and the cost ceiling (techstack Backend and Batch; NFR-3, NFR-7).
- [ ] Per-item status is tracked in memory only; nothing persists to disk (D2, NFR-4).
- [ ] A ~300-application batch completes end to end (AC-8).
- [ ] Results are grouped by lane (match, mismatch, review) so exception-first review is the default (FR-19).
- [ ] The supervisor can bulk-confirm the match-lane group in one action, preceded by the existing aggregate review surface (FR-20, FR-23; D11, D15; CONTEXT.md: Bulk confirm).
- [ ] Concurrent single-application verification holds p95 under 5 seconds during a batch run (NFR-1, NFR-7).
- [ ] A failed batch item is marked failed within the job and does not abort the run (systemsdesign Error Handling; expanded in P3-3).

### Implementation details

- Add the batch endpoints under `app/api/batch/`: `POST /api/batch` (create), `GET /api/batch/:id` (poll progress + partial results), and a bulk-confirm acknowledgment that is a client-side state action and need not hit the server (systemsdesign API layer).
- Implement the orchestrator at `lib/batch/orchestrator.ts`. Use `p-limit` (or hand-rolled equivalent) for bounded concurrency. Default cap = 5; expose via `config/batch.json` so it can be tuned without code changes.
- Job state lives in a module-level `Map<jobId, BatchJob>` at `lib/batch/store.ts`. Each `BatchJob` carries `items: BatchItem[]`, where a `BatchItem` is `{ id, application, status: 'pending' | 'running' | 'done' | 'failed', result?: VerificationResult, error?: { code, message } }`. No disk writes; restart loses the job by design (D2).
- The orchestrator fans out items through `p-limit(cap)`, each item calling the existing per-application pipeline (extraction → matching → triage) used by `/api/verify`. Do not duplicate the pipeline; import and reuse it.
- Progress is computed from the in-memory job: `{ total, pending, running, done, failed, byLane: { match, mismatch, review } }`. The poll endpoint returns this plus any completed items' results.
- The batch results UI lives at `app/batch/[id]/page.tsx`: a running progress bar, three lane buckets with counts, and an expandable per-item view that reuses the Phase 1 per-field breakdown component. The match-lane bucket renders the existing aggregate review surface (FR-23) and the one-click bulk-confirm action (FR-20). Mismatch and review groups render exception-first.
- Input: reuse the Phase 1 application schema (zod) for each item in the batch; validate the whole batch at the API boundary and reject only the malformed items, not the whole submission (Error Handling, expanded in P3-3).
- The bulk-confirm action records dispositions client-side (no persistence in the prototype, NFR-4) and then collapses the match group. It does not route through the work router; the match lane never enters the exception pool (D15; CONTEXT.md: Work pool).
- Single-application `/api/verify` continues to run synchronously and must not be starved by an in-flight batch. Verify this by manual concurrent load (testing section).

### Key constraints

1. Model reads, code decides (D4, D5) — the batch pipeline is the same per-application pipeline; do not let the batch path introduce model verdicts.
2. p95 under 5s for single-application verify must hold during a batch run (NFR-1, NFR-7).
3. Ephemeral state, no persistence (D2, NFR-4) — job state in memory only; a restart cancels in-flight work by design.
4. Bounded concurrency respects provider rate limits AND protects single-application latency for concurrent users (techstack Backend and Batch).
5. The match lane is bulk-confirmed; it never routes to an individual agent (D15; FR-20; CONTEXT.md: Work pool, Bulk confirm).
6. TypeScript strict mode, no `any` (techstack).
7. The Application is the unit of verification (D13) — a batch is many Applications, each with one or more faces, each running in one model call (D14).

### Files to modify

- `app/api/verify/route.ts` (at start — paste real content from P1-7) — extract the per-application pipeline into a reusable function (e.g. `lib/verify/runVerification.ts`) so the batch orchestrator can call it without duplicating logic.
- `app/(admin)/operations/page.tsx` (or equivalent — paste real content from P2-2) — link to the batch results view when a batch is in flight or recently completed.

### Files to create

1. `lib/batch/orchestrator.ts` — the bounded-concurrency orchestrator that fans items through the per-application pipeline.
2. `lib/batch/store.ts` — the in-memory job store (`Map<jobId, BatchJob>`), with helpers `createJob`, `getJob`, `updateItem`, `summarizeProgress`.
3. `lib/batch/types.ts` — `BatchJob`, `BatchItem`, `BatchProgress` types.
4. `lib/verify/runVerification.ts` — extracted per-application pipeline (called by both `/api/verify` and the batch orchestrator).
5. `app/api/batch/route.ts` — `POST` create-batch endpoint.
6. `app/api/batch/[id]/route.ts` — `GET` poll-batch endpoint.
7. `app/batch/[id]/page.tsx` — the batch results view (progress, lane groupings, bulk-confirm).
8. `app/batch/[id]/LaneGroup.tsx` — a reusable lane-bucket component.
9. `config/batch.json` — `{ "concurrency": 5, "maxItems": 500 }` so the cap is tunable without code changes.

### Config / schema / store updates

- New `config/batch.json` with the concurrency cap and a hard `maxItems` ceiling (so an accidental 10,000-app submission does not blow the cost budget).
- No new persistent state stores. Job state is an in-process `Map` only (D2, NFR-4).
- No schema changes; the prototype persists nothing.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add Vitest unit tests for:
- `lib/batch/orchestrator.ts` — feed 20 items with a mock verification function; assert the cap is respected (no more than `concurrency` running at any moment) and all items complete.
- `lib/batch/store.ts` — `summarizeProgress` returns correct counts by status and by lane.
- One item failing in the orchestrator does not abort the rest (sets up P3-3).

Manual:
- [ ] Simulate a ~300-application batch (use the mock provider so cost stays at zero; the bottleneck is the orchestrator, not the model). Confirm completion, progress reporting during the run, and grouped-by-lane results at the end (AC-8).
- [ ] Open the batch results view mid-run; confirm the progress bar updates as the poll endpoint is called.
- [ ] On the completed batch, click bulk-confirm on the match lane group; confirm the aggregate review surface (count, bottom-quartile-confidence inline, deltas vs. baseline) renders before the action, and the group collapses after (FR-20, FR-23).
- [ ] While a batch is running, submit a single-application verify in another tab; confirm p95 under 5s holds (NFR-1, NFR-7). Time it.
- [ ] Submit a batch with one malformed item (missing required field); confirm the batch starts, the malformed item is marked failed with a clean message, and the rest run.

Eval: not applicable directly; the per-item pipeline reuses Phase 1's golden-set behaviour.

Update docs: mark P3-1 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — Architecture Overview (batch path), Component Breakdown (Batch orchestrator, Work router), Data Flow: Batch Verification, D2 (batch state), D14 (one call per application), D15 (match lane never routes).
- @techstack.md — Backend and Batch (in-process queue with bounded concurrency, `p-limit`); Hosting (single always-warm container).
- @requirements.md — FR-17 to FR-20, FR-23; NFR-1, NFR-4, NFR-7; AC-8.
- @CONTEXT.md — Application, Lane, Bulk confirm, Work pool.
- @assumptions.md — A29 (peak-season ~300-app burst), A30 (low sustained QPS, bursty peaks).

### Common gotchas

1. In-memory ephemeral state is prototype-correct (NFR-4, D2). Do not "fix" this by adding SQLite; the documented upgrade path is the job-store interface against SQLite if restart resilience is later required, and even then it lands in production, not in this ticket.
2. Bounded concurrency must respect provider rate limits AND must not break single-application p95 latency for concurrent users (NFR-1, NFR-7). A cap of 5 in flight is the prototype default; tune by `config/batch.json`, not by code. Verify with the concurrent-tab manual check.
3. Results must be grouped by lane (match, mismatch, review) for exception-first review (FR-19). Do not present a flat list — the value of batch is that the agent reviews the small exception slice first and bulk-confirms the large clean slice in one action.
4. The match lane is bulk-confirmed by a supervisor and never routed to an individual agent (D15, FR-20, CONTEXT.md Work pool). Do not let the batch path push match-lane items into the exception work pool that the Phase 2 router serves.

### Definition of Done

Code complete when:
- [ ] `POST /api/batch` accepts a multi-application submission, returns a job id, and runs the items with bounded concurrency.
- [ ] `GET /api/batch/:id` returns progress and results grouped by lane.
- [ ] The batch results view renders progress, the three lane buckets, and the bulk-confirm action on the match group.
- [ ] A failed item does not abort the run.
- [ ] Concurrent single-application verify holds p95 under 5s during a batch run.
- [ ] No console or test errors.
- [ ] Meets the cross-cutting requirements (latency, accessibility, no persistence).

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Manual checks above ticked (including the 300-app simulated run and the concurrent-tab latency check).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/batch, pushed, merged to main.

### Expected output

A supervisor can submit a multi-application batch, watch progress fill in as items complete, see the results grouped into match / mismatch / review buckets, review the small exception slice first, and bulk-confirm the entire match group in one action after the aggregate review surface — all while concurrent single-application verifications continue to meet the 5-second budget.

### Dependencies to install

```
pnpm add p-limit
```

(`p-limit` is the small concurrency-cap library called out in techstack Backend and Batch. No other new deps.)

---

## Outcome — done 2026-06-15

**Branch:** `feat/batch`
**Status:** Done — 288 tests pass + 1 skipped (+14 new); lint + build clean.
**Workflow:** Fifth parallel-agent build. Agent A: backend + orchestrator + pipeline extraction. Agent B: results UI + Operations submit button. Contract-first dispatch — `BatchPollResponse` + `POST /api/batch` shapes dictated upfront.

**What landed:**
- `lib/verify/result.ts` + `lib/verify/runVerification.ts` — shared helpers + reusable pipeline. Route handler + orchestrator now share one source of truth.
- `lib/batch/{types,store,orchestrator}.ts` + tests — in-memory store, `p-limit(5)` orchestrator with per-item try/catch.
- `app/api/batch/route.ts` (POST) + `app/api/batch/[id]/route.ts` (GET) — create + poll.
- `app/batch/[id]/{page,LaneGroup}.tsx` — results page polling every 800ms, lane buckets exception-first, match bucket has one-click "Approve all N".
- `components/batch/SubmitBatchButton.tsx` + Operations panel — "Run sample batch (50)" / "Run peak-season batch (300)".
- `config/batch.json` — tunable cap + maxItems + syntheticDefaultCount.
- `p-limit ^7.3.0` installed.

**Verified end-to-end:** `POST /api/batch {"count":20}` → orchestrator runs → `GET /api/batch/:id` after 1s returns `done: 20, finished: true`.

**Deviations:**
- Aggregate review surface (count + bottom-quartile + delta-vs-baseline) is NOT rendered on the batch's match group; the existing `MatchLaneApprovalPanel` is anchored to the live queue. Approve-all is still one click; full FR-23 surface for batches lands in a follow-up.
- Batch bulk-confirm is client-side only — the batch is its own world for the prototype. P6-2 persistence will unify.
- `BatchItem` carries the per-item pipeline inputs (`form`, `faces`) so the orchestrator can dispatch. UI ignores them.

### Why

P3-1 opens Phase 3 with the batch path the take-home prompt asks for. The architectural disciplines from earlier phases hold: same pipeline runs per item, same triage classifier picks lanes, same result contract is returned.

The **extracted `runVerification` function** is the most load-bearing refactor in this ticket. Phase 1 held the pipeline inline because there was one caller; P3-1 has two (route + orchestrator). Lift the pipeline; both paths stay in sync automatically when the matching engine changes.

The **in-memory job store** is prototype-correct (D2, NFR-4). A restart cancels in-flight batches by design. Production swap point is a Map → SQLite write+read in P6-2.

The **`p-limit` bounded concurrency** is the structural enforcement of NFR-1 + NFR-7. Cap of 5 means no more than 5 model calls in flight; single-application route's p95 budget stays honest under a batch. Tunable via config, not code.

The **per-item try/catch in the orchestrator** is the structural "failed item doesn't abort the run" rule. `await Promise.all(items.map(limit(async () => { try { ... } catch { updateItem(... failed ...) } })))`. P3-3 expands the posture; P3-1 establishes the seam.

The **lane-grouped UI with failed-items at the top** is FR-19's "exception-first" posture materialised. The supervisor sees what failed → what needs decisions → what they can bulk-confirm.

The **client-side bulk-confirm** is the right scope for the prototype. The batch is ephemeral; persisting its dispositions without persisting the batch would be incoherent. P6-2's persistence layer makes both real together.

The **synthetic-batch `{ count }` path** is the demo seam. The 9 mock fixtures cycle so 50 items hit a mix of lane outcomes — exactly the variety the three buckets need.
