# P6-6 — Self-hosted observability

Stand up the self-hosted, in-boundary observability stack — Langfuse or Phoenix as the LLM observability backend, OpenTelemetry as the instrumentation standard, Prometheus + Grafana for system metrics and alerts — and turn the agent-correction feedback loop into a live pipeline. The same constraint that forbids public model APIs in production forbids shipping prompts, traces, and PII to an external SaaS.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @observability.md, @schema.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P6-6: Self-hosted observability.

Current state: (at start)
- [Prototype Phase 0–5 plus P6-1..P6-5 in production. P5-1 instrumented OpenTelemetry spans around verification and the assistant. P5-2 ran offline evals against the golden set. P5-3 captured agent corrections as labeled signals. P5-4 ran the bake-off. P5-5 wired the CI eval gate. All of this currently logs to a lightweight local backend.]

What's NOT done yet:
- [P6-6] No self-hosted LLM-observability backend deployed in-boundary; no live correction-feedback pipeline; no drift / guardrail alerting.
- [P6-7] Compliance hardening still to come.

TICKET-P6-6 Goal:
Deploy a self-hosted Langfuse OR Arize Phoenix inside the Azure FedRAMP boundary as the LLM-trace backend, point the existing OpenTelemetry instrumentation (P5-1) at it, deploy Prometheus + Grafana for system metrics and alerting, and turn the agent-correction loop (P5-3) into a continuous pipeline feeding tool-vs-agent agreement dashboards and a triage queue for disagreements. Drift and guardrail breaches page the owner. Everything inside the FedRAMP boundary — NO external SaaS.

Check @observability.md (the spec for this ticket) and the P5-1 OTel setup before starting.
Follow observability Tooling Stack, observability Prototype vs Production, and the "no external SaaS" rule (observability.md, A21).
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste P6-5's real output: correction lifecycle live, auto-reject job idempotent, resubmissions linked, the production deployment otherwise stable.)_

### TICKET-P6-6 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 4h
- Dependencies: P5-1 (OTel instrumentation), P5-2 (offline eval harness), P5-3 (agent-correction capture)
- Branch: `feat/obs-prod`

### Acceptance criteria

- [ ] A self-hosted **Langfuse** (or Arize Phoenix — pick one; observability.md Open Items names the choice) is deployed inside the Azure FedRAMP boundary, receiving OTel traces from the production app. The pick is recorded in the DEV-LOG with the shallow-PoC reasoning.
- [ ] OpenTelemetry exporters in the app are reconfigured from the prototype's local logging to the self-hosted Langfuse/Phoenix OTel ingest endpoint (in-cluster service URL, not public).
- [ ] Prometheus scrapes the app's `/metrics` endpoint (OTel metrics exposition) and Grafana renders the production dashboards: per-verification p50/p95 latency vs the 5s budget, request rate, error and timeout rates by provider, lane distribution over time, confidence calibration distribution.
- [ ] The agent-correction pipeline (P5-3) is **live**: every `disposition` that overrides the tool's lane (e.g. an `approve` on a mismatch lane, or a `return_for_correction` on a match lane) is captured as a labeled signal in the observability backend, tagged for sampling into a review queue per observability.md.
- [ ] **Drift alerts** are configured in Grafana / Prometheus Alertmanager: lane-distribution drift (>X% week-over-week shift in match rate), confidence-distribution drift, per-field mismatch-rate spikes (a sudden spike in warning failures pages the owner — could be a real fraud pattern or a model regression).
- [ ] **Guardrail alerts** are configured: a non-zero role-scope-leak rate on the assistant pages immediately (observability Guardrail evals); false-negative rate on the rolling agent-correction signal crossing the bake-off threshold pages immediately.
- [ ] **Everything is in-boundary.** No traces, prompts, or PII leave the FedRAMP boundary. The app's OTel exporter endpoint is an in-cluster service URL. Grafana, Prometheus, and Langfuse/Phoenix all run inside the boundary, behind the same SSO (P6-3).
- [ ] **PII redaction is enforced in the OTel exporter**, not "we'll redact later." Applicant name, producer name, producer address, and any raw form values are hashed or removed before the span is exported (observability Privacy section).
- [ ] The CI eval gate (P5-5) writes its run results into Langfuse/Phoenix as datasets so the eval history is queryable and a regression is browsable, not just a CI red/green.

### Implementation details

1. **Pick the LLM backend.** Langfuse and Phoenix both meet the bar (OTel-compatible, OSS, self-hostable, dataset + experiment management, online scoring, annotation queues). Pick one with a shallow PoC. Recommendation: Langfuse for prompt + dataset workflows; Phoenix for eval-heavy + retrieval-quality workflows. Record the choice in DEV-LOG.
2. **Deploy the backend in-boundary.** Helm chart or Docker Compose into the agency's Azure FedRAMP cluster (the same boundary as the app and the model). Backed by its own PostgreSQL (separate from the app DB — operational telemetry is not in the system of record; schema.md is explicit about this).
3. **Point the app's OTel exporter** at the new backend. Replace the prototype's console / file exporter with an OTLP HTTP exporter to the in-cluster Langfuse/Phoenix endpoint.
4. **Deploy Prometheus + Grafana** in-boundary. Configure scraping of the app's `/metrics` endpoint. Bind Grafana to the SSO from P6-3 — operators don't get a separate password.
5. **Implement the redaction filter** in `lib/observability/redact.ts` and install it as an OTel span processor that runs **before** the exporter. PII columns from schema.md (`applicant_name`, `producer_name`, `producer_address`, plus any extracted text that is applicant PII) get hashed; `application.id` and `ttb_id` are fine for correlation.
6. **Wire the agent-correction pipeline:** in the dispose endpoint, after the `disposition` insert, compute tool-vs-agent agreement (verification.lane vs the disposition decision) and emit an OTel event / Langfuse score with the result. Disagreements get tagged `sample: true` so they land in the review queue.
7. **Configure dashboards** (Grafana JSON checked into the repo under `infra/grafana/`):
   - Verification latency (p50/p95) vs 5s budget.
   - Lane distribution over time.
   - Tool-vs-agent agreement (rolling 7-day).
   - False-negative rate (rolling, from the agent-correction signal).
   - Confidence calibration curve.
   - Provider error / timeout rates.
   - Assistant: groundedness, role-scope-leak rate (must read 0), thumbs ratio.
8. **Configure alerts** (Alertmanager rules under `infra/prometheus/alerts/`):
   - p95 latency > 5s for 10 minutes → page.
   - Lane distribution shift > threshold week-over-week → page.
   - Role-scope-leak > 0 in any one-hour window → immediate page.
   - False-negative rate > bake-off threshold over 200 dispositions → page.
   - Provider error rate > threshold → page.
9. **Wire the CI eval gate** (P5-5) to push run results into Langfuse/Phoenix datasets so history is browsable.

### Key constraints

1. The model reads, the code decides — D4. (Unaffected.)
2. p95 under 5s for verification — NFR-1. OTel adds bounded overhead; the redaction processor must be fast (no synchronous network calls).
3. TypeScript strict, no `any`.
4. **Production-specific: self-hosted, in-boundary.** The same constraint that forbids public model APIs in production (A21) forbids shipping prompts, traces, and PII to an external observability SaaS (observability.md). LangSmith, Datadog LLM, and the SaaS versions of Langfuse / Phoenix are **not** options for production.
5. **PII redaction is in the exporter,** not downstream. A trace that ever held raw `applicant_name` in a span attribute has already lost the PII once it crosses an in-process boundary; redact at span-end before export.
6. **Operational telemetry stays out of the application database** (schema.md note "What the assistant does not add to this schema"). Langfuse/Phoenix has its own DB; the app DB stays the system of record for applications and decisions.
7. The CI eval gate runs the golden set and the agent-correction set; a regression on either fails the build (P5-5; observability Improvement Cycle).

### Files to modify

Primary: `lib/observability/otel.ts` (P5-1) — swap the local exporter for the OTLP HTTP exporter to the in-cluster Langfuse/Phoenix endpoint.

Also: `app/api/applications/[id]/dispose/route.ts` — emit the tool-vs-agent agreement signal after the disposition is committed (P6-4 transaction completes first).

Also: the CI workflow (P5-5) — push eval runs into Langfuse/Phoenix datasets.

### Files to create

1. `infra/observability/langfuse-deploy.yaml` (or `phoenix-deploy.yaml`) — Helm values / Docker Compose for the in-boundary deployment.
2. `infra/observability/prometheus.yaml` — scrape config.
3. `infra/observability/grafana/datasources.yaml` — Prometheus + Langfuse/Phoenix as data sources; SSO from P6-3.
4. `infra/grafana/dashboards/verification.json`, `assistant.json`, `system.json` — checked-in dashboards.
5. `infra/prometheus/alerts/verification.yaml`, `guardrails.yaml` — Alertmanager rules.
6. `lib/observability/redact.ts` — PII redaction span processor.
7. `lib/observability/agent-correction.ts` — emit the tool-vs-agent agreement signal on every dispose.
8. `tests/observability/redact.test.ts` — asserts applicant PII never appears in exported spans.

### Config / schema / store updates

Env additions:
- `OTEL_EXPORTER_OTLP_ENDPOINT` (in-cluster Langfuse/Phoenix OTLP ingest URL).
- `OBS_BACKEND=langfuse|phoenix`.
- Grafana / Prometheus deployment configs live in `infra/`.

No app-DB schema changes. Langfuse/Phoenix has its own DB (separate from the app's PostgreSQL).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm test:observability   # redact.test, agent-correction-signal.test
```

Manual:
- [ ] A verification request emits an OTel trace that lands in Langfuse/Phoenix; the trace shows the per-field verdicts, the assigned lane, latency.
- [ ] **Redaction:** the same trace, inspected in Langfuse/Phoenix, contains no `applicant_name`, `producer_name`, `producer_address`, or raw form values. Hashed correlation IDs only.
- [ ] Grafana renders the verification latency dashboard; p95 holds under 5s under representative load.
- [ ] Disagreement (an `approve` disposition on a `mismatch` lane) appears in the agent-correction review queue within minutes.
- [ ] A simulated role-scope leak (assistant test that asks for another agent's stats) triggers the guardrail alert.
- [ ] A simulated lane drift (seeded skew) triggers the drift alert.
- [ ] Network inspection: no outbound traffic from the app, Langfuse/Phoenix, Prometheus, or Grafana goes to a public observability SaaS endpoint.

Eval: rerun the P5-2 golden set; results push into Langfuse/Phoenix as a dataset; browse the eval history in the UI.

Update docs: mark P6-6 done in TICKETS.md; add a DEV-LOG entry recording Langfuse vs Phoenix and why.

### Reference

- observability.md — the spec for this ticket (Tooling Stack; Prototype vs Production; Key Metrics; Privacy and Compliance of the Observability Itself).
- requirements.md — NFR-11 (observable and evaluable; tooling self-hostable and OTel-based for in-boundary).
- systemsdesign.md — Production Evolution Path.
- assumptions.md — A21 (boundary).

### Common gotchas

1. **Langfuse / Phoenix + OTel + Prometheus / Grafana — all SELF-HOSTED IN-BOUNDARY.** The same constraint that forbids public model APIs (A21) ALSO forbids shipping prompts, traces, and PII to an external SaaS (observability.md Tooling Stack). LangSmith, Datadog LLM, and any cloud-only mode of Langfuse / Phoenix is out. The exporter endpoint is an in-cluster service URL.
2. **PII redaction is in the exporter.** Once a span attribute is set with raw applicant PII, the only safe handling is a span processor that hashes or strips it **before** the OTLP exporter ships it. A "we'll redact in Langfuse" plan is wrong — the PII has already crossed the boundary by then.
3. **Operational telemetry stays out of the app DB.** Langfuse/Phoenix has its own database; the app's PostgreSQL is the system of record for applications and decisions (schema.md). Do not log assistant turns into `audit_event` unless a regulator later requires it; use `event_type=assistant_query` only if that requirement materializes.
4. **The live agent-correction pipeline is the killer signal** (observability.md). Every override is a labeled example produced by an expert. Wire it: emit the tool-vs-agent agreement on every dispose, tag disagreements for the review queue, feed the rolling false-negative rate into the alert rule. Without this loop, the production tool gets worse silently and the CI eval gate never sees the real-world drift.

### Definition of Done

Code complete when:
- [ ] Langfuse or Phoenix is deployed in-boundary and receiving traces.
- [ ] PII redaction span processor runs before export; tests assert no PII in exported spans.
- [ ] Prometheus scrapes the app; Grafana renders the production dashboards.
- [ ] Drift and guardrail alerts fire on seeded conditions.
- [ ] The agent-correction signal is emitted on every dispose; disagreements land in the review queue.
- [ ] No `any`; no console errors; p95 under 5s preserved.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, observability).
- [ ] TICKETS.md and DEV-LOG updated; Langfuse-vs-Phoenix choice recorded.
- [ ] Committed to `feat/obs-prod`, pushed, merged to main.

### Expected output

The production system is observed end-to-end inside the FedRAMP boundary. Every verification and assistant turn lands as a trace in self-hosted Langfuse/Phoenix with applicant PII redacted; Prometheus + Grafana surface latency, lane distribution, calibration, and provider health; drift and guardrail breaches page the owner; the agent-correction loop continuously refines the tool. No telemetry leaves the boundary.

### Dependencies to install

```
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
pnpm add @opentelemetry/semantic-conventions
pnpm add @opentelemetry/instrumentation-http @opentelemetry/instrumentation-pg
# If using Langfuse:
pnpm add langfuse
# If using Phoenix: the OTLP HTTP exporter alone is enough; Phoenix accepts OTel directly.
```
