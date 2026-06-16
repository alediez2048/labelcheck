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

### P1-10 — Test set and acceptance tests ✅ done 2026-06-15
- Depends: P1-3, P1-5 · Branch: feat/acceptance · Est: 3h
- Goal: green pairs from the Public COLA Registry plus synthesized red cases; assert AC-1 to AC-10.
- Acceptance: [x] golden set assembled (`tests/golden/index.ts`, 9 fixtures across 5 categories); [x] AC-1 to AC-7 automated (`tests/acceptance.test.ts`); [x] AC-9 automated (`tests/a11y.test.tsx` jest-axe sweep + screen-reader pass logged in `tests/MANUAL-CHECKS.md`); [x] AC-10 automated (`tests/static/no-pii-to-disk.test.ts` static grep + code review logged); [x] AC-8 explicitly deferred to P3-1 (skipped test); [x] false-negative probes assert lane !== match on planted mismatches.
- Files: tests/golden/*, tests/acceptance.test.ts.
- Refs: AC-1 to AC-10; A24 to A26; observability.md.

### P1-11 — Latency measurement ✅ done 2026-06-15
- Depends: P1-2, P1-8 · Branch: feat/latency · Est: 1h
- Goal: measure end-to-end p95 on representative inputs against the 5s budget.
- Acceptance: [x] timing around the model call (extraction.call structured log per request); [x] p95 reported (`scripts/bench-latency.ts` table); [x] flag if full-res multi-face exceeds budget (A12 — `A12_FLAGGED` line + DEV-LOG note). Mock-adapter end-to-end p95 = 2ms (measured); live-adapter measurement awaits an API key + manual run.
- Files: a small bench script; log instrumentation.
- Refs: NFR-1; A12.

Phase 1 exit: a reviewer can load/enter an application, verify it, see the lane and field breakdown, record a disposition; acceptance tests pass; latency within budget; works on mock and live model.

---

## Phase 2 — Queue, routing, and roles

Description: build the product around the core, the agent worklist, the supervisor operations view, specialization-aware pull routing, and the two role shells.

### P2-1 — My Queue (agent) ✅ done 2026-06-15
- Depends: P1-8 · Branch: feat/my-queue · Est: 3h
- Goal: the agent's claimed exceptions, problems first, Get-next pull action; opens into the review flow.
- Acceptance: [x] only the agent's claimed exceptions shown (match-lane filtered, other agents' claims filtered); [x] Get-next pulls the next pool item (mismatch > review > receivedAt ASC) and respects availability; [x] auto-advance through the queue (1.5s timer → next item OR caught-up); [x] color + icon + text on every lane pill.
- Refs: D11, D15; mockup.md.

### P2-2 — Operations view (admin) ✅ done 2026-06-15
- Depends: P1-7 · Branch: feat/operations · Est: 4h
- Goal: intake funnel, match-lane bulk-confirm surface (aggregate review surface for the supervisor), review-distribution board over the exception work pool.
- Acceptance: [x] funnel (received/auto-verified+avg latency/ready-to-approve/needs-review); [x] Approve-all preceded by aggregate review surface (count, bottom-quartile inline + tap-expandable, flagged-field-in-match list, delta-vs-baseline pill); [x] distribution board with shared-pool by beverage + per-agent load + Distribute action (P2-3 router stub); [x] live intake feed with destination strings.
- Refs: D11, D15; mockup.md.

### P2-3 — Work router ✅ done 2026-06-15
- Depends: P1-5 · Branch: feat/router · Est: 3h
- Goal: triage to a shared exception pool; match lane bulk-confirmed, not individually routed; claim sets assignment; supervisor hand-assign.
- Acceptance: [x] only exceptions routed (`admitToPool` rejects match-lane + unverified); [x] claim assigns + timestamps + emits "assigned" audit event; [x] supervisor hand-assign + reassign (admin-only, emits "override" audit event on reassign, `toAgentId: null` returns to pool); [x] Distribute action on `/operations` clears the pool; [x] Get-next on `/queue` delegates to the same router; [x] selection-step strategy seam ready for P2-4 specialization.
- Refs: FR-28; D15.

### P2-4 — Specialization routing ✅ done 2026-06-15
- Depends: P2-3 · Branch: feat/specialization · Est: 2.5h
- Goal: match each application's beverage type to a specialist, with overflow to any available agent; admin assigns specializations in Team view.
- Acceptance: [x] exceptions route to matching specialists (`selectBySpecialization` strategy is now the default in `claim.ts`); [x] overflow when no specialist free (generalists + when no specialty match); [x] admin can edit specialization (`setSpecialization` action + inline `SpecializationEditor` on the per-agent rows in the distribution board). Distribute summary now reports `specialistMatches` + `overflowMatches`.
- Refs: FR-28; D15; schema specialization.

### P2-5 — Role-based shells ✅ done 2026-06-15
- Depends: P2-1, P2-2 · Branch: feat/roles · Est: 3h
- Goal: Admin and Agent shells with a role switcher simulating identity, row-scoped data, and admin-only action gating.
- Acceptance: [x] Admin sees Operations/All Applications/Analytics/Team/Knowledge Base (last four are placeholders for P2-6 / P4-1); [x] Agent sees My Queue/My Stats/Profile (Stats placeholder, Profile has the availability toggle); [x] admin-only actions gated at BOTH UI (hidden in agent shell) and lib (`requireAdmin` in `lib/auth/scope.ts` throws); [x] cross-shell route visits redirect (admin route + agent actor → `/queue`; agent route + admin actor → `/operations`); [x] agent data scoped to self via `state.currentAgentId` + the existing `selectMyQueue` selector; [x] PIV/CAC/SSO production note rendered under the role switcher (NFR-8).
- Refs: FR-29; D16.

### P2-6 — All Applications, Analytics, Team ✅ done 2026-06-15 — Phase 2 complete
- Depends: P2-5 · Branch: feat/admin-views · Est: 4h
- Goal: the full record (searchable/filterable), division analytics, per-member performance with specialization.
- Acceptance: [x] filters (status enum, today/week/month/all_time, multi-agent, free-text search across brand + TTB id); [x] analytics KPIs + 5 charts (KpiCards, VolumeTrend, TriageDonut, TopMismatchReasons, ThroughputByAgent), week/month toggle; [x] Team table with per-member week + month KPIs + 3-segment lane rate bar + the inline SpecializationEditor + Availability toggle; [x] My Stats row-scoped (per-agent KpiCards with hoursSavedHidden + per-agent TriageDonut + recent decisions); [x] Profile with identity, read-only specialization chips, preserved Availability toggle. 25 historical dispositioned applications seeded for analytics density.
- Refs: mockup.md; schema metric_rollup.

Phase 2 exit: both shells work; exceptions route to specialists with overflow; bulk-approve clears the match lane; the role switcher gates admin-only actions.

---

## Phase 3 — Batch, imperfect images, hardening

Description: the most-requested stretch features and robustness, so the tool holds up at peak season and on bad photos.

### P3-1 — Batch intake ✅ done 2026-06-15
- Depends: P1-7 · Branch: feat/batch · Est: 4h
- Goal: accept many applications, async with bounded concurrency, progress, grouped-by-lane results, bulk-confirm.
- Acceptance: [x] ~300-app batch completes (verified end-to-end on the mock provider via the synthetic-batch path); [x] progress reported (GET /api/batch/:id returns `{ pending, running, done, failed, byLane }`); [x] results grouped by lane (LaneGroup buckets per match/mismatch/review; failed items in a dedicated panel); [x] bounded concurrency (p-limit cap of 5, tunable via `config/batch.json`); [x] runVerification pipeline extracted and reused by both /api/verify and the batch orchestrator (no duplication); [x] failed item doesn't abort the run (per-item try/catch).
- Refs: FR-17 to FR-20; systemsdesign Batch.

### P3-2 — Imperfect-image robustness ✅ done 2026-06-15
- Depends: P1-2 · Branch: feat/imperfect-images · Est: 3h
- Goal: handle mild angle/glare; targeted high-resolution re-read of a low-confidence warning region.
- Acceptance: [x] mildly skewed photos read end-to-end on the first pass when legibility is acceptable; [x] low-confidence warning triggers ONE targeted re-read of the cropped region (D7), bounded — no retry, no multi-pass chain; [x] re-read result merged when it returns higher legibility; first-pass kept otherwise; [x] severe cases (re-read also fails) → FR-16 low-confidence lane with the FR-26b "Return — unreadable image" recommendation (no throws, no stack traces); [x] structured `extraction.reread` log (NFR-4 PII-redacted) for observability; [x] crop heuristic (bottom 40% of back face) when the model doesn't return a region hint, documented inline.
- Refs: FR-6; D7, A13.

### P3-3 — Error-handling pass ✅ done 2026-06-15
- Depends: P1-7 · Branch: feat/errors · Est: 2h
- Goal: every expected bad input returns an actionable result; no stack traces; failed batch items isolated.
- Acceptance: [x] `StructuredError` discriminated union (`INVALID_INPUT | UNREADABLE_IMAGE | PROVIDER_TIMEOUT | PROVIDER_RATE_LIMIT | PROVIDER_UNAVAILABLE | INTERNAL`) with `retryable` + optional `recommendation`; [x] `toDegradedResult(applicationId, err)` produces a `VerificationResult`-shaped low-confidence outcome so success + degraded render the same way; [x] verify route, extraction service, batch orchestrator, and provider wrapper all funnel through `StructuredError`; [x] unreadable/invalid inputs handled (8 audit-table scenarios tested); [x] failed batch item is isolated with a `StructuredError`; the run continues; [x] batch UI Retry button on failed items (hidden when `error.retryable === false`).
- Refs: systemsdesign Error Handling.

### P3-4 — Performance hardening ✅ done 2026-06-15 — Phase 3 complete
- Depends: P1-11 · Branch: feat/perf · Est: 2h
- Goal: hold the 5s budget under concurrent single-application load and the burst.
- Acceptance: [x] warm host posture documented in `docs/00-build/HOSTING.md` (vendor-neutral; Render / Railway / Fly / Vercel / Azure Gov mappings); [x] `/api/health` is the keep-warm probe (already existed from P0-6, no provider call); [x] `lib/observability/timing.ts` + `verify.timing` per-request log line (NFR-4 PII-redacted: `{ applicationId, totalMs, extractMs, matchMs, triageMs, faceCount, lane, degraded, rereadTriggered }`); [x] `scripts/load.ts` runs three scenarios (sequential, concurrent for 60s, single-app during a 300-app batch); [x] p95 holds — Scenario A 18ms, B 30ms, C 58ms on the mock adapter, all well under 5000ms; [x] `config/batch.json` concurrency stayed at 5 (Scenario C single-app p95 = 58ms, no starvation observed); [x] live-adapter measurement is the real budget validation and is opt-in / pending the API-key run.
- Refs: NFR-1, NFR-7; constraints Cold start.

Phase 3 exit: a 300-application batch completes with progress and grouped results; degraded inputs handled gracefully; latency holds.

---

## Phase 4 — Assistant and knowledge base

Description: the read-only chat helper and the admin-managed grounding source it answers from.

### P4-1 — Knowledge base store and ingestion ✅ done 2026-06-15
- Depends: P2-5 · Branch: feat/knowledge-base · Est: 4h
- Goal: upload documents, chunk, embed, index; admin Knowledge Base tab with per-document status.
- Acceptance: [x] upload PDF / DOCX / MD / TXT (mime allow-list at the route + parser dispatch); [x] chunked (paragraph-aware, ~500-word target with overlap) + embedded (mock 384-dim FNV-1a hash vectors — production swap to Voyage AI or OpenAI documented at the seam); [x] file-backed prototype store under `.data/kb/` (gitignored; pgvector in prod via the same `KnowledgeBaseStore` interface); [x] per-document status badge transitions queued → indexing → ready → failed; [x] versioned (re-upload bumps version, sets prior version's `effective_to` instead of overwriting); [x] admin-only (route under the `(admin)` shell + UI hide; production server-side auth context replaces the prototype's client-provided `uploadedBy`); [x] smoke-verified end-to-end via curl: upload MD → 202 with `{sourceFilename, version}` → poll shows `ready, v1, 1 chunk`; re-upload bumps to v2 with v1 in history carrying `effectiveTo`.
- Refs: FR-31; schema knowledge_base.

### P4-2 — Retrieval-grounded assistant ✅ done 2026-06-15
- Depends: P4-1 · Branch: feat/assistant · Est: 4h
- Goal: read-only chat that answers, onboards, and summarizes the user's role-scoped numbers; grounded in the KB and metric rollups; never decides or changes records.
- Acceptance: [x] retrieve top-k chunks from the P4-1 KB above a configurable similarity floor (`config/assistant.json` topK=4 minSimilarity=0.55) + cite source filename + version on each answer; [x] role-scoped summary tool `get_my_rollup` reads the caller's identity server-side (NEVER from input) — agent gets self-scope, admin gets division-scope; smoke-verified the two answers DIFFER (agent: "4 processed, 2 mismatch, 2 review" vs admin: "14 processed, 8 match, 4 mismatch, 2 review"); [x] no write actions — the tool registry is exactly `{ get_my_rollup }`, no disposition / router / KB-write / availability tools exposed to the model; [x] decline gracefully when retrieval returns nothing AND the question isn't a numbers question — "I don't have an answer for that yet" instead of falling back to priors; [x] ChatPanel anchored bottom-right in both shells with keyboard-accessibility (Esc closes, aria-live message announcements, role="dialog"); [x] structured `trace.assistantTurn` PII-redacted log for observability (P5-1 seam).
- Refs: FR-30; systemsdesign Assistant.

### P4-3 — Assistant guardrails ✅ done 2026-06-15 — Phase 4 complete
- Depends: P4-2 · Branch: feat/guardrails · Est: 2h
- Goal: out-of-scope refusal, no fabricated rules, strict role-scope isolation.
- Acceptance: [x] 5 fixed-shape refusal templates exported from `lib/assistant/refusals.ts` (legal_advice / disposition_request / cross_user_stats / unsupported_compliance / out_of_scope); [x] deterministic regex-based intent classifier in `lib/assistant/intent.ts` (covers prompt-injection cues like "ignore prior instructions" + "pretend you're admin"); [x] response-side `postcheck` demotes uncited compliance claims AND replaces cross-user mentions (cross-user check runs first — leak is the higher-severity failure); [x] guardrail eval harness `tests/eval/assistant-guardrails.test.ts` runs 17 adversarial questions across 6 categories — all 17 pass (3/3 legal, 3/3 disposition, 4/4 cross-user with zero leak on `mustNotContain` tokens, 2/2 unsupported_compliance, 2/2 out_of_scope, 3/3 control_in_scope); [x] `pnpm test:guardrails` script + CI gate added; [x] refusal messages get amber border-left + ⚠ glyph + collapsible "Why?" rationale in `<ChatPanel>` (NFR-2 color + icon + text); [x] trace shape extended with `intentTags + refusalTemplate + postcheckAction`.
- Refs: observability guardrail evals.

Phase 4 exit: the assistant answers from uploaded content with role-scoped summaries; guardrail checks pass (zero role-scope leak).

---

## Phase 5 — Evals and observability

Description: prove and improve AI quality rather than assume it, the backbone that lets every later change ship safely.

### P5-1 — Tracing ✅ done 2026-06-15
- Depends: P1-7 · Branch: feat/otel · Est: 3h
- Goal: OpenTelemetry spans around verification and the assistant, PII redacted.
- Acceptance: [x] per-verification parent span + `extraction.call` + `matching` child spans on every request; per-turn `assistant.turn` span on every chat turn; [x] no PII in traces — `lib/observability/redact.ts` with salted SHA-256 + `SAFE_ATTRIBUTE_KEYS` allow-list; anything outside the list is hashed before it enters a span attribute; [x] latency captured (span duration + `extraction.duration_ms` + `assistant.total_ms`); lane captured (`verification.lane` attribute + `verificationLaneCounter` metric); [x] exporter swappable via `OTEL_EXPORTER` env (`console` default / `file` JSONL / `otlp` HTTP); [x] `PII_HASH_SALT` env documented (required in prod; dev fallback with `console.warn`); [x] async-flush BatchSpanProcessor — instrumentation does not block the request hot path; [x] `docs/PRIVACY-IN-TRACES.md` auditor-facing redaction policy; [x] smoke-verified: grep for "Marcus"/"Vine St" in the console output returns nothing; only hashes.
- Refs: observability.md; NFR-11.

### P5-2 — Offline eval harness ✅ done 2026-06-16
- Depends: P1-10 · Branch: feat/evals · Est: 4h
- Goal: run the golden set and report per-field precision/recall, lane accuracy, false-negative rate, warning-check accuracy, confidence calibration.
- Acceptance: [x] `pnpm eval` runs end-to-end and writes timestamped reports to `eval-reports/<ISO>/{report.json,report.md}` (gitignored); [x] all six metric families produced — per-field P/R/F1, 3×3 lane confusion, false-negative rate, warning-check sub-metrics (presence/verbatim/ALL CAPS), 10-bucket calibration with ECE, latency distribution with budget breaches; [x] false-negative rate is the headline (printed first in stdout AND first section in `report.md`); [x] calibration curve outputs 10 buckets + ECE number; [x] provider-agnostic via `EVAL_PROVIDER` env (defaults to mock); [x] no PII in the report; [x] **smoke-verified on mock**: 0/7 = 0.0% false-negative rate, 100% overall lane accuracy (2/2 match, 6/6 mismatch, 1/1 review), ECE 0.1111, p50/p95/max 2/10/10ms (well under 5000ms budget).
- Refs: observability.md.

### P5-3 — Agent-correction feedback loop ✅ done 2026-06-16
- Depends: P2-1, P5-1 · Branch: feat/feedback-loop · Est: 3h
- Goal: capture every disposition that overrides a lane as labeled ground truth; track tool-versus-agent agreement.
- Acceptance: [x] every disposition writes a `CorpusRecord` to `eval-data/agent-corrections/<ISO date>.jsonl` (gitignored — captured signal, not source); record carries `applicationIdHash` (sha256:<8 hex>) + brand verbatim + `predictedLane` + `effectiveLane` + `overrideKind` + `predictedFields[]` + optional `returnReasonFields[]` + `confirmation: pending`; [x] override detection in code (pure functions in `lib/feedback/{effectiveLane,override}.ts`); [x] agreement rate computed and surfaced (`GET /api/feedback/agreement` returns rolling + all-time + per-beverage-type breakdown; `<AgreementRateWidget />` polls every 10s on the Operations page); [x] disagreements sampled via `lib/feedback/sampler.ts` (env-tunable ratio/cap) and surfaced via `/disagreement-queue` admin route with Confirm/Reject buttons; [x] `pnpm eval --dataset=corrections` runs the same metric harness over the captured corpus; [x] recorder failures NEVER block disposition writes (try/catch + span event); [x] no applicant PII in the corpus.
- Refs: observability.md.

### P5-4 — Model bake-off ✅ done 2026-06-16
- Depends: P5-2 · Branch: feat/bakeoff · Est: 3h
- Goal: compare candidate extraction models (a frontier API for the prototype; a self-hostable specialized OCR-VL such as olmOCR or GLM-OCR for the in-boundary path) on the golden set; pick on measured accuracy.
- Acceptance: [x] runs the golden set per model behind the adapter (`pnpm bakeoff --providers=<id,id,...>` iterates `lib/provider/registry.ts` entries through the P5-2 eval harness); [x] reports accuracy/latency/cost (per-provider `report.json` + `report.md`, plus top-level `comparison.{json,md}` with metric grid); [x] recommends a default and an in-boundary candidate (framing rule enforced in `lib/eval/bakeoff/comparison.ts`: lead slot reserved for `inBoundary === "via-azure-government"` + `securityReview === "approved"`; air-gapped-fallback slot prefers olmOCR; Chinese-origin candidates NEVER lead regardless of metrics).
- Refs: techstack Model selection; observability Open Items.

### P5-5 — CI eval gate ✅ done 2026-06-16
- Depends: P5-2 · Branch: feat/eval-gate · Est: 2h
- Goal: a prompt/model/threshold change must not regress the golden set.
- Acceptance: [x] eval runs in CI (`.github/workflows/ci.yml` runs `pnpm eval --gate` after the guardrail step on every push and PR, with `EVAL_PROVIDER=mock` for determinism; the gate report uploads as an artifact `if: always()` so failures still ship the diff); [x] a regression fails the build (`lib/eval/gate/compare.ts` enforces `0.0` headline tolerance on the false-negative rate plus per-metric tolerances from committed `eval-baseline.json`; golden-set hash mismatch forces a deliberate re-baseline via `docs/EVAL-BASELINE.md`).
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
