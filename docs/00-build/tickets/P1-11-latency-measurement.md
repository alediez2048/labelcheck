# P1-11 — Latency measurement

Build a small bench script and add timing instrumentation around the model call. Measure end-to-end p95 (not p50) on representative inputs against the 5s budget, and flag if full-resolution multi-face calls exceed the budget so assumption A12 gets a measured answer.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-11: Latency measurement.

Current state: (at start)
- [list with checks: full verification pipeline reachable through /api/verify; review UI; timeout/degrade; golden set with green and red fixtures]

What's NOT done yet: nothing in Phase 1 after this — this is the last Phase 1 ticket.

TICKET-P1-11 Goal:
Measure end-to-end p95 latency on representative inputs (the golden-set green pairs and red defects, single-face and multi-face) and assert it stays under the 5s budget (NFR-1, AC-7). Add instrumented timing around the model call vs. the end-to-end request so we can isolate the dominant cost. Report p95 — the long-tail metric that defines the budget — not p50. Flag if full-resolution multi-face calls exceed budget; that's where assumption A12 (real-world latency of full-resolution multi-face calls is unverified) gets a measured answer.

Check lib/extraction/service.ts, app/api/verify/route.ts, and the golden set from P1-10 before starting.
Follow the architecture and decisions in @systemsdesign.md (Meeting the Latency Budget, D10 timeout) and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-11 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 1h
- Dependencies: P1-2 (extraction service), P1-8 (review UI / full pipeline reachable)
- Branch: feat/latency

### Acceptance criteria

- [ ] Timing is instrumented separately around the model call and the end-to-end /api/verify request (observability.md: What We Instrument).
- [ ] A bench script (`scripts/bench-latency.ts`) runs N applications through the pipeline (configurable, default 50) using the golden set as inputs.
- [ ] The bench reports p50, p95, and max for both the model-call duration and the end-to-end duration.
- [ ] p95 is the headline number (NFR-1, AC-7). p50 is reported but secondary.
- [ ] The bench can run against the mock adapter (deterministic, for CI smoke) and against the live adapter (when the API key is set, for the real measurement).
- [ ] If full-resolution multi-face p95 exceeds the 5s budget, the bench output flags it explicitly (this is the answer to A12).
- [ ] AC-7 is asserted in CI against the mock adapter as a smoke check: end-to-end mock p95 < 5s.
- [ ] The README documents how to run the live-adapter bench.

### Implementation details

- Add `scripts/bench-latency.ts` that imports the golden-set fixtures, runs each through either the lib pipeline (preferred for speed and determinism) or POST /api/verify (slower but truer to production). Default to running through `lib/extraction/service.ts` + matching + triage so the bench can run in CI without standing up the dev server.
- Repeat each fixture enough times to get a meaningful p95 — e.g. 50 iterations across the golden set, mixed single-face and multi-face.
- Use `performance.now()` for the timings. Capture two durations per run: model call (extraction service entry → exit) and end-to-end (preprocess entry → final result).
- Sort the durations and compute p50 (median), p95 (95th percentile), and max.
- Print a small table: `{ scope, p50, p95, max }` for model-call and end-to-end.
- Add a CI assertion via a Vitest test (`tests/latency.test.ts`) that runs a reduced version of the bench (e.g. 20 iterations against the mock) and fails if end-to-end p95 > 5000ms. The mock adapter should be fast enough that this is a stable check; the live-adapter bench is opt-in via env.
- Add the instrumentation hooks in `lib/extraction/service.ts` (or wrap with a thin trace helper) so the model-call duration is logged on every real request, not just in the bench. Format: structured log line, applicant PII redacted (observability.md: Privacy).
- Flag multi-face cases explicitly in the bench output: report multi-face p95 separately from single-face p95. If multi-face p95 > 5000ms when run against the live adapter, print a clear A12 warning so the budget question gets a real answer.

### Key constraints

1. p95 is the metric, not p50 (NFR-1). The long tail is what fails the agent's experience.
2. The bench measures end-to-end and the model call separately so we can isolate the dominant cost (observability.md).
3. AC-7 asserts the 5s budget; the CI smoke check uses the mock adapter for determinism. The live-adapter measurement is opt-in.
4. A12 is the explicit open assumption: full-resolution multi-face call latency is unverified. The bench's multi-face split is where that gets a measured answer.
5. No PII in logs (NFR-4, observability Privacy) — applicant identifiers and raw images stay out of the trace.
6. TypeScript strict mode, no any.

### Files to modify

- `lib/extraction/service.ts` (at start — paste real content from P1-2 / P1-9) — add timing instrumentation around the provider call.
- `app/api/verify/route.ts` (at start — paste real content from P1-7) — add end-to-end timing instrumentation.
- `README.md` (at start — paste real content from prior tickets) — document how to run the bench (mock and live).

### Files to create

1. `scripts/bench-latency.ts` — the bench script.
2. `tests/latency.test.ts` — the CI smoke assertion (mock-adapter, p95 < 5s).

### Config / schema / store updates

- No new config. The bench reads the existing golden-set fixtures.
- Structured log format documented inline; this is the seed for the OpenTelemetry tracing in P5-1.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

The new `tests/latency.test.ts` asserts mock-adapter p95 < 5000ms over 20 iterations.

Manual:
- [ ] Run `pnpm tsx scripts/bench-latency.ts` against the mock adapter; confirm the p50/p95/max table prints.
- [ ] Run `ANTHROPIC_API_KEY=... pnpm tsx scripts/bench-latency.ts` against the live adapter on a representative single-face fixture and a representative multi-face (front+back) fixture. Record the p95 for both in DEV-LOG.
- [ ] If multi-face p95 against the live adapter exceeds 5s, document the result and the implications for A12 in DEV-LOG.

Eval: this IS the latency eval. AC-7 is asserted here (smoke) and explored against the live model in the manual bench.

Update docs: mark P1-11 done in TICKETS.md; add a DEV-LOG entry that records the measured p95 for both single-face and multi-face on the live adapter (the A12 answer).

### Reference

- @systemsdesign.md — Meeting the Latency Budget, D7 (image resolution), D10 (timeout), D14 (single call per app).
- @observability.md — What We Instrument (per-verification span), Online monitoring (p95 latency alerts).
- @requirements.md — NFR-1, AC-7.
- assumptions A12 (real-world latency of full-resolution multi-face calls is unverified — this ticket measures it).

### Common gotchas

1. p95 is the metric, not p50 (NFR-1). The long tail is what fails the agent. Report both, but the budget is on p95.
2. Cite assumption A12 explicitly in the DEV-LOG entry: full-resolution multi-face call latency was unverified before this ticket; the measured number here either confirms the budget or flags it as the work for P3-4 (performance hardening).
3. The CI smoke check uses the mock adapter so it's deterministic; the real number comes from the manual live-adapter bench. Do not assert live-adapter p95 in CI — that introduces flakiness.
4. No PII in the bench logs (NFR-4). Use the application's internal id or the fixture name, never an applicant name or address.

### Definition of Done

Code complete when:
- [ ] `scripts/bench-latency.ts` runs and reports p50/p95/max for model-call and end-to-end durations.
- [ ] `tests/latency.test.ts` asserts mock-adapter p95 < 5s and passes in CI.
- [ ] The model-call duration is logged on every real /api/verify request (structured, PII-redacted).
- [ ] The README documents both the mock and live bench commands.
- [ ] DEV-LOG records the measured live-adapter p95 for single-face and multi-face (the A12 answer).
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/latency, pushed, merged to main.

### Expected output

Phase 1 is complete. The verification flow runs end-to-end on the mock and on a live model; the AC-1 through AC-10 are met (per P1-10); and the 5s p95 budget has a measured answer for both single-face and multi-face inputs. A reviewer can demo the headline take-home flow: load an application, verify it, see the lane and the per-field breakdown, and record a disposition — in under 5s p95.

### Dependencies to install

```
pnpm add -D tsx
```

(`tsx` is used to execute the bench TypeScript directly from the command line.)
