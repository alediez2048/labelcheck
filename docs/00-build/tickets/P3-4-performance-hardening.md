# P3-4 — Performance hardening

Hold the 5-second p95 budget for single-application verification under concurrent load and during a batch burst. Confirm the warm-host posture, instrument the critical path, and tighten the cap settings so a batch never starves a concurrent single-app user.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P3-4: Performance hardening.

Current state: (at start)
- [list what is DONE so far, with checks, including Phase 0, Phase 1 (per-application pipeline with the P1-11 latency bench), Phase 2 (queue, routing, roles), P3-1 (batch orchestrator with bounded concurrency), P3-2 (targeted warning re-read), P3-3 (error-handling pass with structured degraded results)]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: performance hardening under concurrent and burst load (this ticket)]

TICKET-P3-4 Goal:
Confirm the system holds p95 under 5 seconds for single-application verification under the kind of load it will actually see — concurrent single-app users plus an in-flight ~300-app batch (A29, A30, NFR-7). The work is mostly measurement, not new features: confirm the warm-host posture (no scale-to-zero, no per-request cold start, per constraints: Cold start tolerance), instrument the critical path so latency is visible, and tune the batch concurrency cap so a burst never starves a concurrent single-app verify. Document the measured p95 against the budget.

Check the hosting config (Render or equivalent), the per-application pipeline, the provider adapter wrapper, the batch orchestrator's concurrency cap (config/batch.json), and the latency bench from P1-11 before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (Meeting the Latency Budget — one model call, full-resolution image, always-warm host, 8s timeout + one retry; Failure Modes and Resilience — bounded concurrency self-throttles; D14 one call per application carries all faces).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P3-3: structured errors funnelled through `toResult`, the batch orchestrator's per-item failure isolation, and the FR-26b recommendation surfaced cleanly. Also paste the P1-11 latency bench script.)_

### TICKET-P3-4 Scope

- Phase: Phase 3 — Batch, imperfect images, hardening
- Time budget: 2h
- Dependencies: P1-11 (latency measurement)
- Branch: feat/perf

### Acceptance criteria

- [ ] Single-application verification p95 under 5 seconds on representative inputs in isolation (NFR-1; AC-7).
- [ ] Single-application verification p95 under 5 seconds while a ~300-app batch is in flight (NFR-7).
- [ ] Single-application verification p95 under 5 seconds under concurrent single-app load (multiple agents verifying at the same time, representative of A30 sustained throughput).
- [ ] The deployed host is always-warm; no per-request cold start, no scale-to-zero behaviour (constraints: Cold start tolerance; techstack Hosting — single always-warm container on Render).
- [ ] The batch concurrency cap (`config/batch.json`) is set to a value that does not starve concurrent single-app users; the measured single-app p95 during a batch is the evidence.
- [ ] Critical-path timing instrumentation is in place: per-request total latency, provider call duration, image preprocessing duration, matching + triage duration. Logged structured, no applicant PII (NFR-4, observability minimal section of systemsdesign).
- [ ] A measured p95 number is recorded in the DEV-LOG against each scenario above, with the test inputs documented.

### Implementation details

- Confirm the hosting config has the container always running. On Render: a Web Service with min-instances ≥ 1, no sleep, health check pointing at a lightweight `/api/health` endpoint that does not call the model. Document the setting in the README.
- Add `app/api/health/route.ts`: returns `{ status: 'ok' }` immediately. The host's health check polls this so the container stays warm; the endpoint must not call the provider or do real work.
- Extend the per-request timing instrumentation in the verify pipeline. Around the model call, around image preprocessing, around matching + triage. Log a structured line per request: `{ requestId, totalMs, preprocessMs, providerMs, matchMs, triageMs, lane, faceCount, retried, rereadTriggered }`. No applicant PII. This sets up the Phase 5 OpenTelemetry tracing seam without taking on the full P5-1 work.
- Add a small load script at `scripts/load.ts` (Node, uses the mock provider by default to keep cost at zero): drives N concurrent single-app verify calls plus an optional concurrent batch of size B. Reports per-scenario p50, p95, p99, max, error count.
- Run three scenarios and record the numbers in the DEV-LOG:
  - **A. Single-app baseline.** 50 sequential single-app verifies. Confirm p95 < 5s (NFR-1; AC-7).
  - **B. Concurrent single-app.** 10 concurrent single-app verifies sustained for 60s (representative of A30, well above the realistic sustained rate). Confirm p95 < 5s.
  - **C. Single-app during batch burst.** A 300-app batch in flight at the current `config/batch.json` cap, with single-app verifies hitting `/api/verify` at the same time. Confirm the single-app p95 < 5s. If it does not, lower the batch concurrency cap and re-measure. Document the chosen cap and why.
- The 5-second budget applies to single-application verification (NFR-1). The batch itself is async and not held to the per-app budget; throughput and not breaking the sync path are what matter (systemsdesign Data Flow: Batch Verification).
- Confirm the existing timeout + one-retry policy (D10) is doing its job: count retried requests and confirm retried calls still degrade to a structured low-confidence result rather than blowing the budget silently.
- Do not change the model call structure, the image resolution, or the matching rules to "go faster" — those are deliberate (D7, D14). Performance hardening here is about the host, the concurrency cap, and the measurement, not about cutting quality.

### Key constraints

1. Warm host required (no scale-to-zero, no per-request cold start) — constraints: Cold start tolerance; techstack Hosting.
2. p95 under 5s for single-application verification must hold under concurrent burst (NFR-1, NFR-7).
3. D14 says one model call per application carries all faces. Do not split the call to "parallelise" — that adds round trips and image tokens for no quality gain.
4. D7 says full usable resolution. Do not downscale to hit latency. Downscaling breaks the warning check.
5. Bounded concurrency self-throttles (Failure Modes and Resilience). The right knob for "single-app starvation during a batch" is the cap in `config/batch.json`, not removing the cap.
6. No applicant PII in timing logs (NFR-4). Structured logs carry latency and lane only, never extracted values or image content.
7. TypeScript strict mode, no `any` (techstack). Load script too.

### Files to modify

- The hosting config (Render `render.yaml` or equivalent — paste real content) — confirm min-instances ≥ 1, autosleep disabled, health check pointed at `/api/health`.
- `lib/verify/runVerification.ts` (at start — paste real content from P3-1) — add the per-stage timing instrumentation and the structured log line.
- `config/batch.json` (at start — paste real content from P3-1) — tune the `concurrency` value based on the Scenario C measurements; document the chosen number in the file as a comment and in the DEV-LOG.
- `README.md` — add a short "Performance" section noting the warm-host requirement, the load script, and the measured p95 numbers.

### Files to create

1. `app/api/health/route.ts` — lightweight `{ status: 'ok' }` endpoint for the host's health check (keeps the container warm).
2. `scripts/load.ts` — concurrent load script (single-app sequential, single-app concurrent, single-app during batch).
3. `lib/observability/timing.ts` — small helper that wraps a stage with start/end timing and returns the duration, used by `runVerification`.

### Config / schema / store updates

- `config/batch.json` concurrency tuned to the value the measurements support. Default 5 unless Scenario C shows starvation, in which case lower (e.g. 3) and re-measure.
- No persistent state.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add a small unit test for `lib/observability/timing.ts` (wraps an async function, returns `{ result, durationMs }`).

Manual (the real work of this ticket):
- [ ] **Scenario A — single-app baseline.** Run `pnpm tsx scripts/load.ts --scenario=A` against the mock provider. Record p50, p95, p99. Confirm p95 < 5s (NFR-1; AC-7).
- [ ] **Scenario B — concurrent single-app load.** Run `pnpm tsx scripts/load.ts --scenario=B --concurrency=10 --duration=60`. Record p50, p95, p99. Confirm p95 < 5s under sustained concurrency (NFR-7).
- [ ] **Scenario C — single-app during a 300-app batch burst.** Run `pnpm tsx scripts/load.ts --scenario=C --batchSize=300`. Record the single-app p95 while the batch is in flight. Confirm p95 < 5s. If not, lower `config/batch.json#concurrency`, re-measure, and pick the highest cap that holds the single-app budget.
- [ ] Confirm the deployed instance does not scale to zero: leave the deploy idle for ≥ 15 minutes, then hit `/api/verify` and time the first request. It must be a normal request, not a cold-start spike (constraints: Cold start tolerance).
- [ ] Confirm the structured timing log line appears on every request, with no applicant PII.

Eval: not applicable — performance, not correctness.

Update docs: record the measured p95 numbers and the chosen concurrency cap in the DEV-LOG; mark P3-4 done in TICKETS.md.

### Reference

- @systemsdesign.md — Meeting the Latency Budget, Failure Modes and Resilience, Observability (minimal, privacy-preserving), Data Flow: Batch Verification (batch is async; the budget is on single verify).
- @techstack.md — Hosting (single always-warm container, no scale-to-zero), Backend and Batch (in-process bounded concurrency).
- @requirements.md — NFR-1, NFR-4, NFR-7; AC-7.
- @assumptions.md — A12 (the 5s budget needs measurement on real inputs), A27 (the budget is a hard acceptance criterion), A29 (~300-app burst), A30 (low sustained QPS, bursty peaks).
- @CONTEXT.md — Application (the unit the budget applies to).

### Common gotchas

1. Warm host is required (constraints: Cold start tolerance; techstack Hosting). Scale-to-zero or per-request cold starts will silently blow the budget. Confirm min-instances ≥ 1 on Render (or the equivalent on Railway / Fly) and a health check is pointed at `/api/health` to keep the container warm.
2. p95 must hold under concurrent burst (NFR-7), not just on a single isolated call. The Scenario C measurement is the one that actually proves the requirement. Do not declare done from Scenario A alone.
3. The 5-second budget applies to single-application verification (NFR-1). The batch is async; do not try to enforce per-app latency on batch items — that fights the whole point of bounded concurrency (Failure Modes and Resilience).
4. Do not "optimise" by downscaling images (breaks D7) or by splitting the model call (breaks D14). The right knobs are the warm-host posture and the batch concurrency cap, not the design decisions.

### Definition of Done

Code complete when:
- [ ] `/api/health` is live and pointed at by the host's health check; min-instances ≥ 1; no scale-to-zero.
- [ ] Per-stage timing instrumentation is in place; structured log lines emit on every request; no PII.
- [ ] The load script runs all three scenarios.
- [ ] `config/batch.json#concurrency` is set to the highest value Scenario C supports without starving single-app verify.
- [ ] Measured p95 numbers for Scenarios A, B, C are recorded.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Manual checks (Scenarios A, B, C, idle warmth) ticked, with the measured numbers recorded.
- [ ] README's Performance section updated; DEV-LOG carries the measurements.
- [ ] TICKETS.md updated.
- [ ] Committed to feat/perf, pushed, merged to main.

### Expected output

The single-application 5-second p95 budget is provably met not just in isolation but under concurrent load and during a 300-app batch burst, with the chosen batch concurrency cap recorded and the host confirmed as always-warm. The measurement script and the structured per-request timing log give Phase 5 observability a head start without taking on its scope.

### Dependencies to install

No new dependencies. `tsx` (already typical in a TypeScript repo for ad-hoc scripts) covers the load script; if it is not already present, `pnpm add -D tsx`. No runtime deps.
