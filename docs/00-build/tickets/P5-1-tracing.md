# P5-1 — Tracing

Instrument the verification pipeline and the assistant with OpenTelemetry spans so every AI interaction emits a structured, PII-redacted trace that captures what the model saw, what the code decided, and how long it took.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P5-1: Tracing.

Current state: (at start)
- [list what is DONE so far, with checks, including the Phase 1 verification pipeline (extraction service, matching engine, triage classifier, result API at app/api/verify), the Phase 2 queue and routing, the Phase 4 assistant if landed, and any prior eval-harness placeholder from P0-7]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: the OTel SDK wiring, the per-verification and per-assistant-turn span schemas, PII redaction at the trace boundary, the eval harness (P5-2), the agent-correction feedback loop (P5-3), the model bake-off (P5-4), and the CI eval gate (P5-5)]

TICKET-P5-1 Goal:
Wrap the verification flow and the assistant turn in OpenTelemetry spans that record everything we need to debug a wrong decision or to measure quality, without ever capturing applicant PII or the raw image bytes. The prototype writes traces to the console (and a file sink) using the same OTel SDK that will, in production, ship to a self-hosted Langfuse or Phoenix backend inside the FedRAMP boundary. The interface is what matters: the backend swap is a config change in P6-6.

Check app/api/verify, lib/extraction/service.ts, lib/matching, lib/triage/classify.ts, and the assistant route before starting. Don't overwrite existing code; wrap it.
Follow the architecture and decisions in @systemsdesign.md (decisions D4 model reads / code decides, D5 confidence in code) and the rules in @CONTEXT.md and @observability.md (What We Instrument, Privacy).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-11).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output. Most likely Phase 4 (P4-3) or a clean Phase 1/2 baseline.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-1 Scope

- Phase: Phase 5 — Evals and observability
- Time budget: 3h
- Dependencies: P1-7 (Result API — the span boundary we wrap)
- Branch: feat/otel

### Acceptance criteria

- [ ] One trace per verification call, one trace per assistant turn (observability.md: What We Instrument; NFR-11).
- [ ] Per-verification span attributes: application id (internal, not applicant PII), model name and version, prompt version, image token count and resolution (no image bytes), end-to-end latency, model-call latency captured separately, the raw per-field extraction text, each per-field verdict and code-derived confidence, the assigned lane, and any retry or timeout (observability.md: Per verification span).
- [ ] Per-assistant-turn span attributes: the user's question, retrieved help/data context (role-scoped), the prompt, the response, latency, token counts, the role, and any user feedback when present (observability.md: Per assistant turn).
- [ ] PII redaction at the trace boundary: applicant name, address, brand, label image bytes, and any free-text agent note are either omitted or hashed before they enter a span (observability.md: Privacy; NFR-4).
- [ ] System metrics emitted alongside traces: request rate, error and timeout rate by provider, p50 and p95 latency, lane and confidence distributions (observability.md: Per system).
- [ ] Trace output is human-inspectable in development (console exporter or a local JSONL file sink) and the exporter is config-swappable so a self-hosted Langfuse/Phoenix backend drops in without code changes (observability.md: Tooling Stack; PRD Phase 6 / P6-6).
- [ ] No regression to the p95 under five seconds budget; instrumentation overhead measured and reported (NFR-1).

### Implementation details

- Install the OTel SDK and wire a singleton tracer provider at `lib/observability/tracing.ts`. The provider reads `OTEL_EXPORTER` from env: `console` (default for prototype), `file` (writes JSONL to a configured path), or `otlp` (the production hook; not required to wire end-to-end here, just the seam).
- Define a typed span helper at `lib/observability/spans.ts` so verification and assistant call sites do not touch the raw OTel API. Two builders:
  - `withVerificationSpan(applicationId, fn)` — wraps the full verification call, sets attributes incrementally as the result fills in, and ensures redaction is the only path into span attributes.
  - `withAssistantSpan(role, question, fn)` — wraps an assistant turn the same way.
- Add a child span around the provider model call inside `lib/extraction/service.ts` so model-call latency is captured separately from end-to-end latency (observability.md: Per verification span explicitly splits these).
- Add a redaction layer at `lib/observability/redact.ts`. PII fields (applicant name, address, free-text agent note) are SHA-256-hashed with a salt from env; image bytes are never attached to a span (only image dimensions and token count). Brand name is hashed; the per-field extraction text is captured because it is what the model produced — but is redacted from the assistant turn if it appears in the response, since the assistant must never echo applicant PII.
- Wire metric instruments alongside the tracer (a Counter for requests, a Histogram for latency, a Gauge for lane distribution). The prototype emits to console; the OTLP exporter seam is the same one as for traces.
- Add a small `docs/PRIVACY-IN-TRACES.md` (or a section in observability.md) documenting exactly which fields are redacted and how, so a reviewer can audit it without reading source.

### Key constraints

1. Model reads, code decides (D4) — the trace must record both the raw extraction AND the code-derived verdict and lane, because the value of a trace is being able to replay the decision.
2. Code-derived confidence (D5) — store the computed confidence on the span, not the model's self-reported number. The whole point of the calibration metric in P5-2 is that this number is the one we trust.
3. NFR-1 latency budget — instrumentation must not push p95 over five seconds. Spans are async-flushed; never block on the exporter.
4. NFR-4 / observability Privacy — applicant PII never leaves the boundary in a raw form. Hashes use a salt from env so a leaked trace cannot be reversed by rainbow table.
5. NFR-11 — both AI components (verification AND the assistant) are traced; this ticket covers both.
6. The exporter must be swappable by config so P6-6 drops in Langfuse or Phoenix without touching call sites (observability.md: Tooling Stack).

### Files to modify

- `lib/extraction/service.ts` (at start — paste real content from P1-2) — add a child span around the model call. No logic change.
- `lib/matching/*.ts` (at start — paste real content from P1-3) — emit per-field verdict events on the active span. No logic change.
- `lib/triage/classify.ts` (at start — paste real content from P1-5) — set the final lane attribute on the active span. No logic change.
- `app/api/verify/route.ts` (at start — paste real content from P1-7) — wrap the handler in `withVerificationSpan`.
- The assistant route (at start — paste real content from P4-2) — wrap the turn in `withAssistantSpan`.

### Files to create

1. `lib/observability/tracing.ts` — the singleton OTel tracer provider with the env-driven exporter switch.
2. `lib/observability/spans.ts` — typed `withVerificationSpan` and `withAssistantSpan` helpers.
3. `lib/observability/redact.ts` — the PII redaction layer (salted SHA-256 for hashable fields; explicit allow-list for raw attributes).
4. `lib/observability/metrics.ts` — Counter/Histogram/Gauge instruments for request rate, latency, and lane distribution.
5. `tests/observability/redact.test.ts` — unit tests proving applicant name, address, agent note, and image bytes never appear raw in span attributes.
6. `docs/PRIVACY-IN-TRACES.md` — short auditor-facing doc listing every redacted field and the salt source.

### Config / schema / store updates

- New env vars (document in README): `OTEL_EXPORTER` (console | file | otlp), `OTEL_FILE_PATH` (when file), `OTEL_OTLP_ENDPOINT` (when otlp), `PII_HASH_SALT` (required; the app refuses to start without it in non-dev modes).
- No schema changes; traces are an out-of-band signal.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Manual:
- [ ] Run one verification against the mock adapter with `OTEL_EXPORTER=console`; confirm one parent verification span with the attributes listed in the acceptance criteria, and a child model-call span.
- [ ] Run one assistant turn; confirm one assistant-turn span with the role, the question (hashed if it includes a name pattern), the retrieved context, the response, and latency.
- [ ] Grep the emitted trace JSON for the applicant name, address, and free-text note used in the test input — assert they do NOT appear in raw form (only as hashes or omitted).
- [ ] Confirm image bytes never appear in any span attribute; only dimensions and token count do.
- [ ] Measure p95 latency before and after instrumentation on the same fixture set; confirm overhead is sub-perceptible and the budget still holds (NFR-1).

Eval: these tickets ARE the eval system. P5-1 is the substrate; metric collection here feeds the per-system metrics in observability.md (request rate, error/timeout rate, p50/p95 latency, lane/confidence distributions over time).

Update docs: mark P5-1 done in TICKETS.md; add a DEV-LOG entry; add the `docs/PRIVACY-IN-TRACES.md` reference to observability.md.

### Reference

- @observability.md — What We Instrument (per verification, per assistant, per system), Privacy and Compliance of the Observability Itself, Tooling Stack (OTel as the standard), Prototype vs Production.
- @requirements.md — NFR-11 (observability and evals); NFR-4 (no PII to disk in the prototype, which extends to traces); NFR-1 (latency budget).
- @systemsdesign.md — D4 (model reads / code decides), D5 (code-derived confidence), Production Evolution Path (where the OTLP exporter lands).
- OpenTelemetry JS docs: https://opentelemetry.io/docs/languages/js/
- Langfuse OTel ingest (production target): https://langfuse.com/docs/opentelemetry

### Common gotchas

1. **Never trace the image bytes or applicant PII.** Image dimensions and token counts are fine; the actual base64 or buffer must never enter a span attribute (observability.md: Privacy). Make this a typed wall: `redact.ts` is the only path into span attributes for any field touched by applicant data.
2. **Prototype vs production exporter.** The prototype writes to console or a local JSONL file; production ships to a self-hosted Langfuse or Phoenix in-boundary (observability.md: Tooling Stack). Cloud-only SaaS like LangSmith or Datadog LLM are explicitly OUT — they break the in-boundary constraint (assumption A21).
3. **Span the model call separately from the request.** The observability doc requires end-to-end latency AND model-call latency as separate attributes; without the child span you cannot tell whether a slow verification was the model or the surrounding work.
4. **Store the code-derived confidence, not the model's self-reported number.** D5 explicitly forbids trusting the model's confidence; the trace must reflect the same discipline so calibration analysis in P5-2 reads the right column.

### Definition of Done

Code complete when:
- [ ] Verification and assistant calls each emit one structured trace per invocation with the attribute set above.
- [ ] PII redaction unit tests pass; raw applicant data does not appear in any span attribute.
- [ ] Exporter swap by env var works for console and file; the OTLP seam is in place.
- [ ] Metrics (request rate, latency, lane distribution) emit alongside traces.
- [ ] No console errors; no test failures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Manual checks above ticked.
- [ ] TICKETS.md and DEV-LOG updated; `docs/PRIVACY-IN-TRACES.md` published.
- [ ] Committed to feat/otel, pushed, merged to main.

### Expected output

Every verification and every assistant turn produces a structured, PII-redacted OpenTelemetry trace visible at the console (or in a local JSONL file). The trace carries everything needed to reconstruct what the model saw, what the code decided, and how long each stage took. The OTLP exporter is config-swappable, so when P6-6 stands up Langfuse or Phoenix in-boundary, no call site changes.

### Dependencies to install

```
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-metrics @opentelemetry/exporter-metrics-otlp-http
```
