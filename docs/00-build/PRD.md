# Product Requirements Document: AI-Powered Alcohol Label Verification (LabelCheck)

Status: ready for build
Owner: solo developer
Last updated: 2026-06-12

This is the authoritative build plan. It states what we are building, for whom, and in what order, then breaks the implementation into phases with concrete tickets and exit criteria. It does not restate the design in detail; it references the design docs, which remain the single source of truth for each area:

- constraints.md, assumptions.md, requirements.md (FR/NFR/AC), CONTEXT.md (glossary)
- systemsdesign.md (architecture, decisions D1 to D16), techstack.md, schema.md
- flowchart.md (process), observability.md (evals), business.md (cost/value), mockup.md + mockup.html (UI)

How to read: a phase has a goal, a ticket list, exit criteria, and dependencies. Tickets are identified P{phase}-{n}. Phases 0 to 3 are the take-home prototype scope; Phases 4 to 6 are the credible path to production. Ship the core before the ambitious (the brief rewards a working core over ambitious-but-incomplete).

---

## 1. Problem and Goal

TTB reviews about 150,000 alcohol label applications a year with 47 agents, and verification is manual: an agent eyeballs the label artwork against the typed application, field by field. Half the day is routine matching, not judgment. The goal is a tool that does the routine matching automatically in seconds and routes only the exceptions to a human, so agents spend their time on judgment, not data entry. See constraints.md and business.md.

Primary goal of the prototype: a working, accessible, single-application verification flow that reads a label, compares it to the application, and presents a clear, triaged result fast enough to actually use.

## 2. Scope

In scope (prototype): single-application verification, the three-lane triage, the agent review and disposition flow, an accessible queue UI, batch and imperfect-image handling as stretch, the assistant and knowledge base as stretch, and an evals harness. Standalone; nothing sensitive persisted.

Out of scope (prototype, documented as production): COLA integration, real authentication, a production datastore, an in-boundary model, and the full self-hosted observability platform. See assumptions A6, A7, A21; NFR-4; systemsdesign Production Evolution Path.

## 3. Users and Roles

Two roles (systemsdesign D16): Agent (the specialist who reviews exceptions) and Admin/Supervisor (who approves the clean lane in bulk, distributes work, and manages the team, analytics, and the assistant's knowledge base). The prototype simulates identity with a role switcher; production uses real RBAC (NFR-8).

## 4. Success Metrics (prototype)

- Correctness: passes acceptance criteria AC-1 to AC-10 (requirements.md). The primary safety metric is the false-negative rate on real mismatches (observability.md).
- Latency: single-application verification meets the p95-under-5-seconds budget (NFR-1).
- Accessibility: WCAG 2.1 AA; status never by colour alone (NFR-2, AC-9).
- Cost: prototype API spend stays in low-double-digit dollars (business.md).

---

## 5. Phased Implementation Plan

### Phase 0 — Foundations (prototype)

Goal: a runnable skeleton with the seams in place, so later phases are additive.

Tickets:
- P0-1 Scaffold the repo: TypeScript, Next.js (App Router), Tailwind, ESLint/Prettier, strict TS, pnpm (techstack.md).
- P0-2 Define the domain types and the result contract: Application, LabelFace, Verdict, Lane, Disposition (CONTEXT.md; one shared type for the per-field result and the lane).
- P0-3 Build the vision provider adapter interface (image(s) + field schema in, transcribed fields out) and a mock adapter returning canned extractions (systemsdesign D4, D8; techstack Vision Model).
- P0-4 Configuration store: canonical government warning text, per-field tolerances, per-beverage-type field requirements, as data files (FR-25). Insert the verbatim warning text (assumption A18) once confirmed.
- P0-5 Image preprocessing: orientation normalize and cap at the provider's max usable resolution, no downscaling below it (D7).
- P0-6 Access gate middleware (shared passcode) as a spend shield, env-configured (NFR-8).
- P0-7 CI with the test runner (Vitest) and a placeholder eval harness hook.

Exit criteria: the app boots, the mock adapter returns a structured extraction, types compile, CI runs.
Dependencies: none.

### Phase 1 — Core single-application verification (prototype MVP)

Goal: the headline flow, label in, triaged result out, fast and accessible. This is the take-home's must-have.

Tickets:
- P1-1 Input: accept one or more label face images per application and the form field values, manual entry plus preloaded sample applications (FR-1, FR-2, FR-3; D9, D12).
- P1-2 Extraction service: single model call per application carrying all faces; returns transcribed text per face plus warning structural flags (FR-4, FR-5; D4, D14).
- P1-3 Matching engine: per-field rules, brand and type fuzzy, ABV and net contents normalized-exact, producer fuzzy, origin, and the government warning exact (presence, verbatim, caps strict; bold best-effort) (FR-7 to FR-12; D6). Rules and tolerances from config.
- P1-4 Confidence: code-derived from match margin plus the model legibility flag, not the model's self-reported number (FR-5; D5).
- P1-5 Triage classifier: roll per-field verdicts and confidence into one lane, with the priority order (warning failures always surface) (FR-13; systemsdesign Decision Logic).
- P1-6 Multi-face merge: a field is satisfied if found on any face; warning checked across faces (D12).
- P1-7 Result API: structured result, overall lane, confidence, per-field breakdown, flags; for any mismatch the specific field(s) that differ are identified so the agent's attention goes straight to the problem (FR-15); unreadable image returns the low-confidence "needs a better image" result with an explicit "Return — unreadable image" recommendation, not an error (FR-14, FR-15, FR-16, FR-26b).
- P1-8 Review UI: application-as-submitted on one side, application-versus-label per-field on the other with the differing field(s) visibly flagged (FR-15), lane banner, the two dispositions (Approve, Return for correction with structured reason summary). Disposition is whole-application only — never per-face, never per-field; an agent cannot approve face A while returning face B (FR-26 atomic constraint; CONTEXT.md Disposition). Auto-advance; accessible (colour plus icon plus text, large targets) (FR-15, FR-21, FR-22, FR-24, FR-26, FR-26a, FR-26b; NFR-2).
- P1-9 Timeout and degrade: about 8 seconds per call, one retry, graceful low-confidence on timeout (D10).
- P1-10 Test set and acceptance tests: green pairs from the Public COLA Registry, synthesized red cases; assert AC-1 to AC-8 via the golden set in the Vitest harness, AC-9 (colour + icon + text accessibility) via an automated a11y check (axe-core or @testing-library/jest-dom) plus a manual screen-reader pass, AC-10 (no PII to disk) via static analysis / code review against the no-write-to-storage rule, not via the runtime golden set (requirements; observability golden set; NFR-4).
- P1-11 Latency measurement: confirm p95 under 5 seconds on representative inputs (NFR-1; assumption A12).

Exit criteria: a reviewer can load or enter an application, verify it, see the lane and the field breakdown, and record a disposition; acceptance tests pass; latency is within budget; runs on the mock adapter and on a live model with a key.
Dependencies: Phase 0.

### Phase 2 — Queue, routing, and roles (prototype)

Goal: the product around the core, the worklist, the two shells, and visible routing.

Tickets:
- P2-1 My Queue: the agent's claimed exceptions, problems first, Get-next pull action; review flow with auto-advance (mockup.md; D11, D15).
- P2-2 Operations view (admin): intake funnel, match-lane bulk-confirm surface (the aggregate review surface for the supervisor: count, bottom-quartile-confidence matches surfaced inline and tap-expandable, deltas vs. baseline match rate; effortless and prominent), review-distribution board over the exception work pool (FR-20, FR-23; D11, D15; CONTEXT.md: Bulk confirm, Work pool).
- P2-3 Work router: triage to a shared exception pool; match lane bulk-confirmed and not individually routed; claim sets assignment; supervisor hand-assign (FR-28; D15).
- P2-4 Specialization routing: match each application's beverage type to a specialist, with overflow; admin assigns specializations in Team view (FR-28; D15; schema specialization).
- P2-5 Role-based shells: Admin (Operations, All Applications, Analytics, Team, Knowledge Base — the KB tab is a navigation placeholder here; its upload/index functionality lands in P4-1) and Agent (My Queue, My Stats, Profile), with a role switcher simulating identity and row-scoped data (FR-29; D16).
- P2-6 All Applications, Analytics, Team views (history, division metrics, per-member performance) over the sample/metric data (mockup.md).

Exit criteria: both shells work; exceptions route to specialists with overflow; bulk-approve clears the match lane; the role switcher gates admin-only actions.
Dependencies: Phase 1.

### Phase 3 — Batch, imperfect images, hardening (prototype stretch)

Goal: the most-requested stretch features and robustness.

Tickets:
- P3-1 Batch intake: accept many applications, async with bounded concurrency, progress, grouped-by-lane results, bulk-confirm (FR-17 to FR-20; systemsdesign Batch).
- P3-2 Imperfect-image robustness: mild angle/glare handling; targeted high-resolution re-read of a low-confidence warning region (FR-6; D7, D13/A13).
- P3-3 Error handling pass: every expected bad input returns an actionable result, never a stack trace (systemsdesign Error Handling).
- P3-4 Performance hardening to hold the 5-second budget under load and the burst.

Exit criteria: a ~300-application batch completes with progress and grouped results; degraded inputs handled gracefully; latency holds.
Dependencies: Phase 2.

### Phase 4 — Assistant and knowledge base (stretch / early production)

Goal: the read-only helper and its grounding source.

Tickets:
- P4-1 Knowledge base store and ingestion: upload documents, chunk, embed (pgvector in production), index; admin Knowledge Base tab with status (FR-31; schema knowledge_base).
- P4-2 Retrieval-grounded assistant: read-only chat that answers, onboards, and summarizes the user's role-scoped numbers; grounded in the knowledge base and metric rollups; never decides or changes records (FR-30; systemsdesign Assistant).
- P4-3 Guardrails: out-of-scope refusal, no fabricated rules, and strict role-scope isolation (observability guardrail evals).

Exit criteria: the assistant answers from uploaded content with role-scoped summaries; guardrail checks pass (zero role-scope leak).
Dependencies: Phase 2 (roles); benefits from Phase 5 for evaluation.

### Phase 5 — Evals and observability (early production)

Goal: prove and improve AI quality, not assume it.

Tickets:
- P5-1 Tracing: OpenTelemetry spans around verification and the assistant, PII redacted (observability.md; NFR-11).
- P5-2 Offline eval harness: run the golden set; report per-field precision/recall, lane accuracy, the false-negative rate on real mismatches, warning-check accuracy, and confidence calibration.
- P5-3 Agent-correction feedback loop: capture every disposition that overrides a lane as labeled ground truth; track tool-versus-agent agreement.
- P5-4 Model bake-off: compare candidate extraction models on the golden set of real TTB labels (not public benchmarks). Production-path candidates: Azure OpenAI vision in Azure Government (recommended, FedRAMP High, US vendor) and self-hosted open OCR-VL (olmOCR — Allen Institute, US-origin, Apache 2.0 — as the provenance-safe lead; GLM-OCR / Qwen2.5-VL pending security review). Stakeholder framing rule: lead with the Azure-in-boundary path, present self-hosting as the air-gapped fallback with olmOCR as the lead, never headline a Chinese-origin model for a Treasury audience. Pick on measured accuracy and the false-negative-rate bar (techstack Model selection; observability Production model bake-off).
- P5-5 CI eval gate: a prompt, model, or threshold change must not regress the golden set.

Exit criteria: eval runs produce the metrics above; agent corrections accumulate as an eval set; a change that regresses the golden set fails CI.
Dependencies: Phase 1 (golden set), Phase 4 (assistant evals).

### Phase 6 — Production migration (in-boundary)

Goal: move the proven prototype into the agency's Azure FedRAMP boundary. Each item is additive at a known seam, not a rewrite (systemsdesign Production Evolution Path).

Tickets:
- P6-1 In-boundary model: write the production provider adapter targeting Azure OpenAI vision inside Azure Government (FedRAMP High, recommended) or a self-hosted open OCR-VL model on agency GPUs (US-origin olmOCR for provenance; a top-accuracy model pending security review) (techstack Model selection; assumption A21; systemsdesign Production Evolution Path).
- P6-2 Persistence and audit: implement the schema against a governed datastore (PostgreSQL + JSONB, object storage for images, pgvector for the knowledge base); append-only disposition and audit tables (schema.md; NFR-4 reversed for production with governance).
- P6-3 Real authentication and RBAC: PIV/CAC and SSO, role-based access, audit logging (NFR-8).
- P6-4 COLA integration: ingestion adapter (form values and label images from COLAs Online) and write-back adapter (dispositions back to COLAs Online, which owns applicant notification and Public Registry publishing); the tool sends no email (flowchart System Context; FR-27).
- P6-5 Correction lifecycle: 30-day window, automatic rejection on lapse. A resubmission is a new Application linked to the returned parent via parent_application_id (not a state update on the original); verification re-runs end-to-end on all faces and the form (no per-face caching); the resubmission inherits queue priority from its parent's correction_cycle (FR-27; flowchart; CONTEXT.md: Resubmission).
- P6-6 Self-hosted observability: Langfuse or Phoenix plus OpenTelemetry plus Prometheus/Grafana, in-boundary; live agent-correction pipeline and drift/guardrail alerting (observability.md).
- P6-7 Compliance: encryption at rest, retention per the federal records schedule, security review.

Exit criteria: the system runs inside the FedRAMP boundary, reads from and writes to COLAs Online, persists with an unalterable audit trail, and is observed and evaluated continuously.
Dependencies: a production decision to proceed; Phases 1 to 5.

---

## 6. Cross-Cutting Requirements

These apply to every phase and are not optional:
- Latency: single-application verification p95 under 5 seconds (NFR-1).
- Accessibility: WCAG 2.1 AA; status by colour plus icon plus text (NFR-2).
- Cost: prototype stays within the constraints.md ceiling; production stays within the per-call budget envelope (NFR-3; business.md).
- The model reads, the code decides: no model verdicts; matching and lanes in testable code (D4, D5).
- Privacy: the prototype persists nothing sensitive; production keeps data in-boundary with audit (NFR-4; constraints: Compliance; assumption A8).
- Review-model dial: high-confidence matches are bulk-confirmed by default (one click after the aggregate review surface); true auto-clear without a per-batch human glance is an off-by-default agency policy dial (CONTEXT.md: Auto-clear; D11; constraints Review Model). The system supports either setting; the choice is set by configuration, not code.
- Maintainability: extraction, matching, triage, routing, and the assistant separated; the model behind a swappable adapter; rules in config (NFR-6).

## 7. Risks and Open Questions

These should be resolved with the stakeholders (carried from the design phase):
- The accuracy bar: acceptable false-negative rate and tool-agent agreement (set and enforced via observability).
- The verbatim government warning text (A18) and the confirmed beverage-type scope (A10), both gating the golden set.
- Whether the prototype should honour the in-boundary constraint or may call a public model API (A21, A23).
- Real-world latency of full-resolution multi-face calls (A12), to be measured early in Phase 1.
- ABV tolerance tables (A19), simplified to exact-match in the prototype.

## 8. Build Order Summary

Phase 0 foundations, Phase 1 the core verification MVP (the take-home deliverable), Phase 2 queue/routing/roles, Phase 3 batch and robustness, Phase 4 assistant and knowledge base, Phase 5 evals and observability, Phase 6 production in-boundary. Ship Phase 1 first and well; everything after is the credible, additive path.
