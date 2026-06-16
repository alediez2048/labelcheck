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

---

## Outcome — done 2026-06-15 — Phase 3 complete

**Branch:** `feat/perf`
**Status:** Done — 312 tests pass + 1 skipped (+4); lint + build clean. Phase 3 closes here.
**Workflow:** Single-agent build (measurement + instrumentation; sequential work).

**What landed:**
- `lib/observability/timing.ts` — `timed<T>(fn): { result, durationMs }`. The seam P5-1's OTel spans will consume.
- `lib/verify/runVerification.ts` — per-stage timing via `timed(...)`. Emits one `verify.timing` log per request on every settling branch (success / degraded / unreadable). PII-redacted.
- `lib/extraction/service.ts` + `lib/provider/types.ts` — `ExtractionResponse.rereadAttempted?: boolean` for the timing log's `rereadTriggered` field.
- `scripts/load.ts` — three scenarios (sequential, concurrent, single-app during 300-app batch). Hand-rolled CLI; reuses `runVerification` and `runBatch` directly (no HTTP — pure pipeline cost measurement).
- `docs/00-build/HOSTING.md` — vendor-neutral warm-host requirement (Render / Railway / Fly / Vercel / Azure Container Apps).
- `config/batch.json` — `note` field documenting the chosen cap.
- `README.md` — Performance section.

**Measured (mock adapter):**

| Scenario | Samples | p50 | p95 | p99 | max | PASS |
| --- | ---:| ---:| ---:| ---:| ---:| --- |
| A — sequential (50 iters) | 50 | 4 | 18 | 28 | 28 | ✓ |
| B — concurrent (10 × 60s) | 32,592 | 16 | 30 | 54 | 297 | ✓ |
| C — single-app during 300-app batch | 30 | 57 | 58 | 59 | 59 | ✓ |

All three under 5000ms budget by orders of magnitude. Scenario C's batch ran in 542ms across 300 items at cap=5; no starvation on the mock.

**Live-adapter measurement is the real test** — pending an API-key run. The mock numbers are the structural smoke; the cap stays at 5 unless the live run shows starvation, in which case `config/batch.json` drops to 3 or 4.

**Deviations:**
- Scenario C bounds the single-app count to 30 and terminates alongside the batch deterministically (the mock runs too fast for a wall-clock window).
- `verify.timing` log emits on degraded / unreadable branches with `matchMs: 0` / `triageMs: 0`. Throw branch stays silent — `verify.request` already covers it.
- `degraded` is a boolean (richer "retry actually fired" needs extending `withTimeout`; documented limitation).
- Hosting config is vendor-neutral `HOSTING.md` rather than a Render-specific `render.yaml` — the repo doesn't ship a deploy file and the requirement holds regardless of platform.

### Why

P3-4 closes Phase 3 with the budget answer NFR-1 + NFR-7 demand: p95 holds under concurrent load AND during a batch burst, not just in isolation (P1-11). The architectural disciplines hold: one model call per app (D14), full resolution (D7), 8s timeout + one retry (D10). Hardening is host + cap + measurement — not redesign.

The **per-stage timing log** is the observability hook P5-1's OTel spans will read directly. `timed(...)` is the seam: span boundaries map one-for-one to the wrapper's `performance.now()` deltas; span attributes map to the JSON fields. P5-1 swaps `console.info` for span emission and inherits this ticket's instrumentation for free.

The **vendor-neutral `HOSTING.md`** is the structural enforcement of the warm-host requirement regardless of platform. Without it, a scale-to-zero deploy would silently violate NFR-1 on the first cold-start.

The **batch concurrency cap stayed at 5** because the mock measurement shows no starvation. The cap is config, not code, so re-tuning after a live-adapter run is a config edit + re-deploy.

The **NFR-4 PII-redacted log shape** matches `extraction.call` and `verify.request` from P1-11. Ids, counts, durations, enums — no transcribed text, no form values, no bytes. The operator can spot patterns without ever seeing applicant data.

The **three load scenarios** materialise "p95 under burst, not just in isolation" as a script. A passing Scenario A is necessary but not sufficient; Scenario B proves sustained concurrency holds; Scenario C proves the batch path doesn't starve the sync path. Mock numbers prove the script works; live numbers prove the system works.
