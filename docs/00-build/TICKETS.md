# TICKETS — LabelCheck Build Backlog

Status: ready for build
Companion: PRD.md (phases and rationale), TICKET-TEMPLATE.md (the full per-ticket kickstart primer)

Every phase has a name and a description; every ticket below uses a compact form of the template in TICKET-TEMPLATE.md. When you start a ticket, expand it into a full kickstart primer (fill the "current state" from the previous ticket's real output).

Conventions:
- Ticket ID: P{phase}-{n}. Branch: feat/{area}. Estimates are rough.
- Standard Definition of Done (every ticket, not repeated below): code-complete behaviour met; pnpm lint, build, and test pass; manual check done; TICKETS.md and DEV-LOG updated; committed to the feature branch, pushed, merged to main.
- Cross-cutting always-on: model reads / code decides (D4, D5); p95 under 5s for verification (NFR-1); WCAG AA, colour plus icon plus text (NFR-2); TypeScript strict, no any; rules in config (FR-25). Refs in parentheses point to requirements.md (FR/NFR/AC), systemsdesign.md (D1 to D16), schema.md, observability.md, techstack.md, flowchart.md, CONTEXT.md.

Phase prefix: Phases 0 to 3 are the take-home prototype; Phases 4 to 6 are the path to production.

---

## Phase 0 — Foundations

Description: stand up a runnable skeleton with the seams (provider adapter, config, access gate, CI) in place, so every later phase is additive rather than a rewrite. No verification logic yet.

### P0-1 — Repo scaffold ✅ done 2026-06-15
- Depends: none · Branch: feat/scaffold · Est: 2h
- Goal: TypeScript + Next.js (App Router) + Tailwind project that builds and lints.
- Acceptance: [x] app boots; [x] strict TS, ESLint, Prettier configured; [x] pnpm scripts (dev, build, lint, test).
- Files: create the Next.js app, tsconfig (strict), .eslintrc, tailwind config, package.json.
- Refs: techstack.md.

### P0-2 — Domain types and result contract ✅ done 2026-06-15
- Depends: P0-1 · Branch: feat/types · Est: 1.5h
- Goal: shared types for Application, LabelFace, Field, Verdict, Lane, Disposition, and the verification result.
- Acceptance: [x] one shared result type used by API and UI; [x] enums match CONTEXT.md and schema.md.
- Files: create types/domain.ts.
- Refs: CONTEXT.md; schema.md; D13.

### P0-3 — Vision provider adapter + mock ✅ done 2026-06-15
- Depends: P0-2 · Branch: feat/provider-adapter · Est: 3h
- Goal: a narrow adapter interface (image(s) + field schema in, transcribed fields out) plus a mock adapter returning canned extractions.
- Acceptance: [x] interface defined; [x] mock returns structured per-face extraction for the sample set; [x] runs with no API key.
- Files: create lib/provider/types.ts, lib/provider/mock.ts.
- Constraints/refs: model reads only, no verdicts (D4); swappable by config (D8).

### P0-4 — Configuration store ✅ done 2026-06-15
- Depends: P0-2 · Branch: feat/config · Est: 2h
- Goal: data-file config for the canonical government warning text, per-field tolerances, and per-beverage-type field requirements.
- Acceptance: [x] config loaded at runtime; [x] editable without code changes; [x] warning text slot present (insert verbatim text once confirmed, A18).
- Files: create config/warning.json, config/tolerances.json, config/fields-by-type.json.
- Refs: FR-25; A18, A10.

### P0-5 — Image preprocessing ✅ done 2026-06-15
- Depends: P0-1 · Branch: feat/image-prep · Est: 2h
- Goal: normalize orientation and cap at the provider's max usable resolution; no downscaling below it; in memory.
- Acceptance: [x] EXIF orientation handled; [x] images capped at ~1568px long edge; [x] no temp files persisted.
- Files: create lib/image/preprocess.ts (sharp).
- Refs: D7; NFR-4.

### P0-6 — Access gate ✅ done 2026-06-15
- Depends: P0-1 · Branch: feat/access-gate · Est: 1h
- Goal: shared-passcode middleware as a spend shield, env-configured.
- Acceptance: [x] unauthenticated requests blocked; [x] passcode from env; [x] documented as a spend shield, not security.
- Files: create middleware.ts; env docs.
- Refs: NFR-8.

### P0-7 — CI and test harness ✅ done 2026-06-15
- Depends: P0-1 · Branch: feat/ci · Est: 1.5h
- Goal: Vitest set up, CI runs lint/build/test, and a hook for the eval harness (P5).
- Acceptance: [x] CI green on a trivial test; [x] eval-harness placeholder wired.
- Files: create vitest config, CI workflow.
- Refs: NFR-6.

Phase 0 exit: app boots, mock adapter returns a structured extraction, types compile, CI runs.

---

## Phase 1 — Core single-application verification (MVP)

Description: the headline take-home flow. A label and an application go in; a fast, accessible, triaged result with a per-field breakdown and the two dispositions come out. This phase is the deliverable; ship it well.

### P1-1 — Application input and sample loader ✅ done 2026-06-15
- Depends: P0-2 · Branch: feat/app-input · Est: 3h
- Goal: capture one-or-more label faces and the form fields, manual entry plus preloaded sample applications.
- Acceptance: [x] multi-face upload (front/back/neck); [x] form fields by beverage type; [x] sample picker loads a fixture (AC for demo); [x] input validated (zod).
- Files: create the input UI, lib/validation, fixtures/samples.ts.
- Refs: FR-1, FR-2, FR-3; D9, D12.

### P1-2 — Extraction service ✅ done 2026-06-15
- Depends: P0-3, P1-1 · Branch: feat/extraction · Est: 3h
- Goal: one model call per application carrying all faces; returns transcribed fields per face plus warning structural flags.
- Acceptance: [x] single call, all faces; [x] returns text-only per face; [x] warning flags (presence, caps, bold best-effort, legibility).
- Files: create lib/extraction/service.ts.
- Refs: FR-4, FR-5; D4, D14.

### P1-3 — Matching engine ✅ done 2026-06-15
- Depends: P0-4, P1-2 · Branch: feat/matching · Est: 4h
- Goal: per-field comparison with the right rule each: brand/type fuzzy, ABV and net contents normalized-exact, producer fuzzy, origin, warning exact (presence, verbatim, caps strict, bold best-effort).
- Acceptance: [x] each field rule implemented and unit-tested; [x] tolerances from config; [x] warning caps/wording strict; bold uncertain → review.
- Files: create lib/matching/*.ts.
- Refs: FR-7 to FR-12; D6.

### P1-4 — Confidence derivation ✅ done 2026-06-15
- Depends: P1-3 · Branch: feat/confidence · Est: 2h
- Goal: code-derived confidence from match margin plus the model legibility flag; never the model's self-reported number.
- Acceptance: [x] confidence per field computed in code; [x] near-miss lands low-confidence regardless of model claim.
- Files: lib/matching/confidence.ts.
- Refs: FR-5; D5.

### P1-5 — Triage classifier ✅ done 2026-06-15
- Depends: P1-3, P1-4 · Branch: feat/triage · Est: 2h
- Goal: roll per-field verdicts and confidence into one lane with the priority order (warning failures always surface as mismatch).
- Acceptance: [x] match / mismatch / review assigned correctly; [x] confident mismatch or warning fail → mismatch; [x] uncertain → review.
- Files: lib/triage/classify.ts.
- Refs: FR-13; systemsdesign Decision Logic.

### P1-6 — Multi-face merge ✅ done 2026-06-15
- Depends: P1-2, P1-3 · Branch: feat/multiface · Est: 1.5h
- Goal: a field is satisfied if found on any face; warning checked across faces.
- Acceptance: [x] front-only upload does not false-flag the warning; [x] per-field source face tracked.
- Files: lib/matching/merge.ts.
- Refs: D12.

### P1-7 — Result API ✅ done 2026-06-15
- Depends: P1-5 · Branch: feat/result-api · Est: 2h
- Goal: structured result (lane, confidence, per-field breakdown, flags); unreadable image returns the needs-a-better-image result with an explicit "Return — unreadable image" recommendation, not an error.
- Acceptance: [x] AC-1, AC-2, AC-6 behaviours present at integration-test layer (full AC-1 to AC-6 in P1-10); [x] unreadable → review result with explicit recommendation surfaced (FR-16, FR-26b); [x] validation errors are clean messages.
- Files: app/api/verify route.
- Refs: FR-14, FR-16, FR-26b.

### P1-8 — Review UI and dispositions ✅ done 2026-06-15
- Depends: P1-7 · Branch: feat/review-ui · Est: 5h
- Goal: as-submitted vs application-versus-label, lane banner, the two dispositions (Approve, Return for correction with structured reason summary), auto-advance; accessible.
- Acceptance: [x] per-field table with the bad field highlighted; [x] two dispositions only, no manual reject; [x] Return for correction captures the structured reason summary from the latest field_results (FR-26a); [x] unreadable-image recommendation surfaced when extraction failed (FR-26b); [x] colour plus icon plus text (AC-9); [x] large targets; [x] auto-advance. Automated a11y assertion (axe-core) deferred to P1-10 per the ticket's "Eval" line.
- Files: the review components.
- Refs: FR-14, FR-21, FR-22, FR-24, FR-26, FR-26a, FR-26b; NFR-2; D6.

### P1-9 — Timeout and degrade ✅ done 2026-06-15
- Depends: P1-2 · Branch: feat/timeout · Est: 1.5h
- Goal: ~8s per-call timeout, one retry, graceful low-confidence result on timeout.
- Acceptance: [x] slow call degrades, not hangs; [x] one retry; [x] p95 goal honoured, not a hard per-call kill.
- Files: provider call wrapper.
- Refs: D10; NFR-1.

### P1-10 — Test set and acceptance tests
- Depends: P1-3, P1-5 · Branch: feat/acceptance-tests · Est: 3h
- Goal: green pairs from the Public COLA Registry plus synthesized red cases; assert AC-1 to AC-10.
- Acceptance: [ ] golden set assembled; [ ] AC-1 to AC-10 automated; [ ] false-negative checks on planted mismatches.
- Files: tests/golden/*, tests/acceptance.test.ts.
- Refs: AC-1 to AC-10; A24 to A26; observability.md.

### P1-11 — Latency measurement
- Depends: P1-2, P1-8 · Branch: feat/latency · Est: 1h
- Goal: measure end-to-end p95 on representative inputs against the 5s budget.
- Acceptance: [ ] timing around the model call; [ ] p95 reported; [ ] flag if full-res multi-face exceeds budget (A12).
- Files: a small bench script; log instrumentation.
- Refs: NFR-1; A12.

Phase 1 exit: a reviewer can load/enter an application, verify it, see the lane and field breakdown, record a disposition; acceptance tests pass; latency within budget; works on mock and live model.

---

## Phase 2 — Queue, routing, and roles

Description: build the product around the core, the agent worklist, the supervisor operations view, specialization-aware pull routing, and the two role shells.

### P2-1 — My Queue (agent)
- Depends: P1-8 · Branch: feat/my-queue · Est: 3h
- Goal: the agent's claimed exceptions, problems first, Get-next pull action; opens into the review flow.
- Acceptance: [ ] only the agent's claimed exceptions shown; [ ] Get-next pulls the next item; [ ] auto-advance through the queue.
- Refs: D11, D15; mockup.md.

### P2-2 — Operations view (admin)
- Depends: P1-7 · Branch: feat/operations · Est: 4h
- Goal: intake funnel, match-lane bulk-confirm surface (aggregate review surface for the supervisor), review-distribution board over the exception work pool.
- Acceptance: [ ] funnel (received/verified/match/exceptions); [ ] Approve-all on the match lane preceded by aggregate review surface (count, bottom-quartile-confidence matches surfaced inline, deltas vs. baseline); [ ] distribution board with the waiting exception pool.
- Refs: D11, D15; mockup.md.

### P2-3 — Work router
- Depends: P1-5 · Branch: feat/router · Est: 3h
- Goal: triage to a shared exception pool; match lane bulk-confirmed, not individually routed; claim sets assignment; supervisor hand-assign.
- Acceptance: [ ] only exceptions routed; [ ] claim assigns and timestamps; [ ] supervisor can reassign.
- Refs: FR-28; D15.

### P2-4 — Specialization routing
- Depends: P2-3 · Branch: feat/specialization · Est: 2.5h
- Goal: match each application's beverage type to a specialist, with overflow to any available agent; admin assigns specializations in Team view.
- Acceptance: [ ] exceptions route to matching specialists; [ ] overflow when no specialist free; [ ] admin can edit specialization.
- Refs: FR-28; D15; schema specialization.

### P2-5 — Role-based shells
- Depends: P2-1, P2-2 · Branch: feat/roles · Est: 3h
- Goal: Admin and Agent shells with a role switcher simulating identity, row-scoped data, and admin-only action gating.
- Acceptance: [ ] Admin sees Operations/All Apps/Analytics/Team/Knowledge Base; [ ] Agent sees My Queue/My Stats/Profile; [ ] admin-only actions gated; [ ] agent data scoped to self.
- Refs: FR-29; D16.

### P2-6 — All Applications, Analytics, Team
- Depends: P2-5 · Branch: feat/admin-views · Est: 4h
- Goal: the full record (searchable/filterable), division analytics, per-member performance with specialization.
- Acceptance: [ ] filters (status, range, agent, search); [ ] analytics KPIs + charts; [ ] team table with specialization and rates.
- Refs: mockup.md; schema metric_rollup.

Phase 2 exit: both shells work; exceptions route to specialists with overflow; bulk-approve clears the match lane; the role switcher gates admin-only actions.

---

## Phase 3 — Batch, imperfect images, hardening

Description: the most-requested stretch features and robustness, so the tool holds up at peak season and on bad photos.

### P3-1 — Batch intake
- Depends: P1-7 · Branch: feat/batch · Est: 4h
- Goal: accept many applications, async with bounded concurrency, progress, grouped-by-lane results, bulk-confirm.
- Acceptance: [ ] ~300-app batch completes; [ ] progress reported; [ ] results grouped by lane; [ ] bounded concurrency respects rate limits.
- Refs: FR-17 to FR-20; systemsdesign Batch.

### P3-2 — Imperfect-image robustness
- Depends: P1-2 · Branch: feat/image-robust · Est: 3h
- Goal: handle mild angle/glare; targeted high-resolution re-read of a low-confidence warning region.
- Acceptance: [ ] mildly skewed photos read; [ ] low-confidence warning triggers a region re-read; [ ] severe cases → needs-a-better-image.
- Refs: FR-6; D7, A13.

### P3-3 — Error-handling pass
- Depends: P1-7 · Branch: feat/errors · Est: 2h
- Goal: every expected bad input returns an actionable result; no stack traces; failed batch items isolated.
- Acceptance: [ ] unreadable/invalid inputs handled; [ ] a failed batch item does not abort the run.
- Refs: systemsdesign Error Handling.

### P3-4 — Performance hardening
- Depends: P1-11 · Branch: feat/perf · Est: 2h
- Goal: hold the 5s budget under concurrent single-application load and the burst.
- Acceptance: [ ] warm host, no per-request cold start; [ ] p95 holds under load.
- Refs: NFR-1, NFR-7; constraints Cold start.

Phase 3 exit: a 300-application batch completes with progress and grouped results; degraded inputs handled gracefully; latency holds.

---

## Phase 4 — Assistant and knowledge base

Description: the read-only chat helper and the admin-managed grounding source it answers from.

### P4-1 — Knowledge base store and ingestion
- Depends: P2-5 · Branch: feat/kb-ingest · Est: 4h
- Goal: upload documents, chunk, embed, index; admin Knowledge Base tab with per-document status.
- Acceptance: [ ] upload PDF/DOCX/MD/TXT; [ ] chunked + embedded (pgvector in prod); [ ] status shown; [ ] versioned.
- Refs: FR-31; schema knowledge_base.

### P4-2 — Retrieval-grounded assistant
- Depends: P4-1 · Branch: feat/assistant · Est: 4h
- Goal: read-only chat that answers, onboards, and summarizes the user's role-scoped numbers; grounded in the KB and metric rollups; never decides or changes records.
- Acceptance: [ ] answers retrieved from the KB; [ ] role-scoped summaries (agent vs admin); [ ] no write actions.
- Refs: FR-30; systemsdesign Assistant.

### P4-3 — Assistant guardrails
- Depends: P4-2 · Branch: feat/assistant-guardrails · Est: 2h
- Goal: out-of-scope refusal, no fabricated rules, strict role-scope isolation.
- Acceptance: [ ] declines legal advice / disposition requests; [ ] zero role-scope leakage; [ ] says so when unsure.
- Refs: observability guardrail evals.

Phase 4 exit: the assistant answers from uploaded content with role-scoped summaries; guardrail checks pass (zero role-scope leak).

---

## Phase 5 — Evals and observability

Description: prove and improve AI quality rather than assume it, the backbone that lets every later change ship safely.

### P5-1 — Tracing
- Depends: P1-7 · Branch: feat/otel · Est: 3h
- Goal: OpenTelemetry spans around verification and the assistant, PII redacted.
- Acceptance: [ ] per-verification and per-turn traces; [ ] no PII in traces; [ ] latency and lane captured.
- Refs: observability.md; NFR-11.

### P5-2 — Offline eval harness
- Depends: P1-10 · Branch: feat/evals · Est: 4h
- Goal: run the golden set and report per-field precision/recall, lane accuracy, false-negative rate, warning-check accuracy, confidence calibration.
- Acceptance: [ ] metrics produced; [ ] false-negative rate is the headline; [ ] calibration curve output.
- Refs: observability.md.

### P5-3 — Agent-correction feedback loop
- Depends: P2-1, P5-1 · Branch: feat/feedback-loop · Est: 3h
- Goal: capture every disposition that overrides a lane as labeled ground truth; track tool-versus-agent agreement.
- Acceptance: [ ] overrides logged as labeled examples; [ ] agreement rate tracked; [ ] disagreements sampled for review.
- Refs: observability.md.

### P5-4 — Model bake-off
- Depends: P5-2 · Branch: feat/model-bakeoff · Est: 3h
- Goal: compare candidate extraction models (a frontier API for the prototype; a self-hostable specialized OCR-VL such as olmOCR or GLM-OCR for the in-boundary path) on the golden set; pick on measured accuracy.
- Acceptance: [ ] runs the golden set per model behind the adapter; [ ] reports accuracy/latency/cost; [ ] recommends a default and an in-boundary candidate.
- Refs: techstack Model selection; observability Open Items.

### P5-5 — CI eval gate
- Depends: P5-2 · Branch: feat/eval-gate · Est: 2h
- Goal: a prompt/model/threshold change must not regress the golden set.
- Acceptance: [ ] eval runs in CI; [ ] a regression fails the build.
- Refs: observability Improvement Cycle.

Phase 5 exit: eval runs produce the metrics; agent corrections accumulate as an eval set; a change that regresses the golden set fails CI.

---

## Phase 6 — Production migration (in-boundary)

Description: move the proven prototype into the agency's Azure FedRAMP boundary. Each ticket attaches at a known seam, so it is additive, not a rewrite. Gated on a decision to proceed.

### P6-1 — In-boundary model adapter
- Depends: P0-3, P5-4 · Branch: feat/inboundary-model · Est: 4h
- Goal: production provider adapter targeting Azure OpenAI vision in Azure Government (FedRAMP High, recommended) or a self-hosted open OCR-VL model (US-origin olmOCR for provenance, or a top-accuracy model pending security review).
- Acceptance: [ ] adapter swaps in by config; [ ] no external endpoint; [ ] passes the bake-off bar on TTB labels.
- Refs: techstack Model selection; assumption A21; systemsdesign Production Evolution Path.

### P6-2 — Persistence and audit
- Depends: P1-7 · Branch: feat/persistence · Est: 6h
- Goal: implement the schema against a governed datastore (PostgreSQL + JSONB, object storage for images, pgvector for the KB); append-only disposition and audit.
- Acceptance: [ ] schema migrated; [ ] disposition and audit append-only; [ ] images in object storage by reference.
- Refs: schema.md; NFR-4 (production governance).

### P6-3 — Authentication and RBAC
- Depends: P2-5 · Branch: feat/auth · Est: 5h
- Goal: PIV/CAC and SSO, role-based access, audit logging.
- Acceptance: [ ] identity-driven roles; [ ] row-level access enforced server-side; [ ] access audited.
- Refs: NFR-8; D16.

### P6-4 — COLA integration
- Depends: P6-2 · Branch: feat/cola-integration · Est: 6h
- Goal: ingestion adapter (form values and label images from COLAs Online) and write-back adapter (dispositions back); the tool sends no email.
- Acceptance: [ ] applications ingested from COLAs Online; [ ] dispositions written back; [ ] no applicant notification sent by our tool.
- Refs: flowchart System Context; FR-27; A6.

### P6-5 — Correction lifecycle
- Depends: P6-2 · Branch: feat/correction-cycle · Est: 3h
- Goal: 30-day correction window, priority resubmission, automatic rejection on lapse.
- Acceptance: [ ] return-for-correction opens a 30-day cycle; [ ] resubmission gets priority; [ ] auto-reject job on lapse.
- Refs: FR-27; flowchart.

### P6-6 — Self-hosted observability
- Depends: P5-1, P5-2 · Branch: feat/obs-prod · Est: 4h
- Goal: Langfuse or Phoenix plus OpenTelemetry plus Prometheus/Grafana, in-boundary; live agent-correction pipeline and drift/guardrail alerting.
- Acceptance: [ ] self-hosted backend receiving traces; [ ] dashboards and alerts; [ ] correction pipeline live.
- Refs: observability.md.

### P6-7 — Compliance hardening
- Depends: P6-2, P6-3 · Branch: feat/compliance · Est: 4h
- Goal: encryption at rest, retention per the federal records schedule, security review.
- Acceptance: [ ] encryption at rest; [ ] retention policy applied; [ ] security review checklist passed.
- Refs: schema PII/Retention; constraints Compliance.

Phase 6 exit: the system runs inside the FedRAMP boundary, reads from and writes to COLAs Online, persists with an unalterable audit trail, and is observed and evaluated continuously.

---

## Build order summary

P0 foundations → P1 core verification MVP (the take-home deliverable) → P2 queue/routing/roles → P3 batch/robustness → P4 assistant + knowledge base → P5 evals + observability → P6 production in-boundary. Ship P1 first and well; everything after is the additive path.
