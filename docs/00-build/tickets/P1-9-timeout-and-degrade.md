# P1-9 — Timeout and degrade

Wrap the provider call with an ~8s per-call timeout and one automatic retry. On a true timeout, return a low-confidence "could not verify in time" VerificationResult rather than hanging or surfacing a stack trace. p95-under-5-seconds is the goal we aim for, not a hard per-request kill switch.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-9: Timeout and degrade.

Current state: (at start)
- [list with checks: extraction service, matching, triage, merge, result API, review UI]

What's NOT done yet:
- [list with crosses: acceptance tests, latency bench]

TICKET-P1-9 Goal:
Make the provider call resilient without making it brittle. Wrap the call in lib/extraction/service.ts (or in a thin lib/provider/withTimeout.ts wrapper) with an ~8s timeout per attempt, one automatic retry on timeout or transient failure, and a graceful "could not verify in time" structured result on true timeout. The result lands in the review lane with low confidence; it never throws to the UI as a stack trace. The 5s p95 budget is the goal, not the kill switch.

Check lib/extraction/service.ts and the provider adapter contract before starting.
Follow the architecture and decisions in @systemsdesign.md (D10 timeout and degrade, Meeting the Latency Budget) and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-9 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 1.5h
- Dependencies: P1-2 (extraction service)
- Branch: feat/timeout

### Acceptance criteria

- [ ] Provider calls carry an ~8s timeout per attempt (D10).
- [ ] On a timeout or a transient failure (rate-limit, network blip), exactly one automatic retry runs (D10).
- [ ] On a true terminal timeout (both attempts exceeded the timeout), the service returns a structured low-confidence VerificationResult — lane=review, recommendation surfaces "could not verify in time", overall confidence near zero — NOT a thrown error (D10, FR-16, systemsdesign Error Handling).
- [ ] The 5s p95 budget is the goal we measure against in P1-11; the 8s per-attempt timeout is a degradation knob, not a hard kill on every request (D10, NFR-1).
- [ ] The retry has a small backoff (e.g. 250ms) to avoid hammering during a transient outage.
- [ ] A non-timeout error (validation, programming bug) is not retried — only timeouts and transient failures.
- [ ] Unit tests cover: a fast happy path (no retry), a one-shot timeout that retries and succeeds, a double-timeout that returns the graceful structured result.

### Implementation details

- Create `lib/provider/withTimeout.ts` exporting `withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T>` and `withRetry<T>(fn, opts): Promise<T>`. Keep them composable.
- Wrap the provider call inside `lib/extraction/service.ts` with `withTimeout(8000)` and `withRetry({ attempts: 2, backoffMs: 250, retryOn: isTransient })`.
- `isTransient` covers: AbortError (timeout), HTTP 429 / 5xx (when the provider exposes status), and well-known transient SDK errors. NOT validation errors or schema mismatches.
- When BOTH attempts time out, the extraction service should NOT throw. Instead, return a synthetic ExtractionResult marked with a "degraded: timeout" flag, so the downstream pipeline knows to surface the structured result.
- In `app/api/verify/route.ts`, when the extraction service returns the degraded result, build the VerificationResult with lane=`review`, a clear reason ("could not verify in time"), an overall confidence near zero, and a recommendation similar to "Try again, or request a better image" (echoing systemsdesign Error Handling).
- Do not retry on a non-timeout error (e.g. a clean 4xx from the provider for malformed input). Surface as a 500 with a clean message in that case (techstack: clean error handling).

### Key constraints

1. p95 under 5s is the GOAL, not the kill switch (D10, NFR-1). An 8s per-call timeout is the per-request safety net so a slow provider does not hang the UI.
2. One retry only (D10). More retries inflate cost and latency; one is the documented degrade budget.
3. A true terminal timeout returns a structured result, NEVER a thrown error to the UI (D10, FR-16, systemsdesign Error Handling). The agent should never see a stack trace, only an actionable result.
4. Transient errors (timeout, 429, 5xx) are retried. Programming errors and validation errors are not.
5. The retry has a small backoff to avoid hammering during a transient provider issue.
6. TypeScript strict mode, no any.
7. No PII to disk (NFR-4) — the retry path must not log raw images or transcribed PII.

### Files to modify

- `lib/extraction/service.ts` (at start — paste real content from P1-2) — wrap the provider call with `withTimeout` and `withRetry`; on terminal timeout, return a degraded ExtractionResult instead of throwing.
- `app/api/verify/route.ts` (at start — paste real content from P1-7) — detect the degraded ExtractionResult and build the "could not verify in time" VerificationResult.
- `types/domain.ts` (at start — paste real content from prior tickets) — extend ExtractionResult and / or VerificationResult with a `degraded?: 'timeout' | 'transient'` flag.

### Files to create

1. `lib/provider/withTimeout.ts` — the timeout + retry helpers.
2. `lib/provider/__tests__/withTimeout.test.ts` — unit tests for the happy path, the single-retry-success path, and the double-timeout-degrade path.

### Config / schema / store updates

- Timeouts and retry counts can live in code constants for now (D10 gives the numbers) or be promoted to `config/tolerances.json` later. Document the choice.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Unit tests (using fake timers and a controllable mock):
- [ ] A fast provider returns in 1s → no retry, result returned, total elapsed under 1.5s.
- [ ] A slow provider returns at 9s on first attempt and at 1s on the retry → returns the second-attempt result; total elapsed under 9.5s.
- [ ] Both attempts time out at 8s each → returns the degraded ExtractionResult with `degraded: 'timeout'`.
- [ ] A validation error from the provider is NOT retried.

Manual:
- [ ] Simulate a slow mock provider (insert a 9s sleep) and run the verify flow; confirm the UI surfaces the "could not verify in time" review-lane result, not an error page.

Eval: latency assertions land in P1-11.

Update docs: mark P1-9 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D10 (timeout and degrade), Meeting the Latency Budget, Error Handling and Degraded Cases.
- @requirements.md — FR-16, NFR-1.
- @techstack.md — Backend (timeout posture).

### Common gotchas

1. The 8s per-call timeout is a degradation knob (D10), NOT a hard kill on every request. p95-under-5-seconds is the goal we measure against in P1-11. Do not "fix" the timeout down to 5s — that defeats the safety net for the long-tail provider response.
2. On a terminal timeout, return a structured result (lane=review, overall confidence near zero, clear "could not verify in time" reason) — NEVER throw to the UI. The agent should never see a stack trace (systemsdesign Error Handling).
3. One retry only (D10). More retries inflate cost and latency. The retry has a small backoff (~250ms) to avoid hammering a struggling provider.
4. Retry on transient errors only (timeout, 429, 5xx). Do NOT retry on validation errors or programming bugs — those should surface clean error messages immediately.

### Definition of Done

Code complete when:
- [ ] Provider calls run inside `withTimeout` + `withRetry`.
- [ ] A terminal timeout returns a structured degraded result, not a thrown error.
- [ ] The UI receives a clean "could not verify in time" review-lane VerificationResult on simulated double-timeout.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/timeout, pushed, merged to main.

### Expected output

The verification path is now resilient: a slow provider degrades to a clean retry, and a truly stuck provider returns a structured low-confidence "review" result with an actionable message. No request hangs forever; no stack trace ever reaches the agent.

### Dependencies to install

```
(none — uses AbortController from the platform; vitest fake timers for tests)
```
