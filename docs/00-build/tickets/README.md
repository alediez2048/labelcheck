# Ticket Files — Index

43 fully-fledged ticket files, one per backlog item in [`../TICKETS.md`](../TICKETS.md), following the structure in [`../TICKET-TEMPLATE.md`](../TICKET-TEMPLATE.md).

**How to use a ticket:** open the file for the ticket you're starting, fill in the `(at start — paste real content from prior ticket)` blocks with the previous ticket's actual output, then paste the `## Copy-Paste Into New Agent` block into a fresh agent session.

**Build order:** complete phases sequentially (P0 → P1 → P2 → P3 → P4 → P5 → P6). Within a phase, follow the dependency edges in each ticket's `Scope` block.

---

## Phase 0 — Foundations (7 tickets)

Runnable skeleton with the seams in place. No verification logic yet.

| # | Ticket | Branch |
|---|---|---|
| P0-1 | [Repo scaffold](P0-1-repo-scaffold.md) | `feat/scaffold` |
| P0-2 | [Domain types and result contract](P0-2-domain-types-and-result-contract.md) | `feat/types` |
| P0-3 | [Vision provider adapter + mock](P0-3-vision-provider-adapter-mock.md) | `feat/provider-adapter` |
| P0-4 | [Configuration store](P0-4-configuration-store.md) | `feat/config` |
| P0-5 | [Image preprocessing](P0-5-image-preprocessing.md) | `feat/image-prep` |
| P0-6 | [Access gate](P0-6-access-gate.md) | `feat/access-gate` |
| P0-7 | [CI and test harness](P0-7-ci-and-test-harness.md) | `feat/ci` |

## Phase 1 — Core single-application verification (MVP) (11 tickets)

The headline take-home flow. Ship this well.

| # | Ticket | Branch |
|---|---|---|
| P1-1 | [Application input and sample loader](P1-1-application-input-and-sample-loader.md) | `feat/app-input` |
| P1-2 | [Extraction service](P1-2-extraction-service.md) | `feat/extraction` |
| P1-3 | [Matching engine](P1-3-matching-engine.md) | `feat/matching` |
| P1-4 | [Confidence derivation](P1-4-confidence-derivation.md) | `feat/confidence` |
| P1-5 | [Triage classifier](P1-5-triage-classifier.md) | `feat/triage` |
| P1-6 | [Multi-face merge](P1-6-multi-face-merge.md) | `feat/multiface` |
| P1-7 | [Result API](P1-7-result-api.md) | `feat/result-api` |
| P1-8 | [Review UI and dispositions](P1-8-review-ui-and-dispositions.md) | `feat/review-ui` |
| P1-9 | [Timeout and degrade](P1-9-timeout-and-degrade.md) | `feat/timeout` |
| P1-10 | [Test set and acceptance tests](P1-10-test-set-and-acceptance-tests.md) | `feat/acceptance-tests` |
| P1-11 | [Latency measurement](P1-11-latency-measurement.md) | `feat/latency` |

## Phase 2 — Queue, routing, and roles (6 tickets)

Worklist, ops view, specialization-aware pull routing, two role shells.

| # | Ticket | Branch |
|---|---|---|
| P2-1 | [My Queue (agent)](P2-1-my-queue.md) | `feat/my-queue` |
| P2-2 | [Operations view (admin)](P2-2-operations-view.md) | `feat/operations` |
| P2-3 | [Work router](P2-3-work-router.md) | `feat/router` |
| P2-4 | [Specialization routing](P2-4-specialization-routing.md) | `feat/specialization` |
| P2-5 | [Role-based shells](P2-5-role-based-shells.md) | `feat/roles` |
| P2-6 | [All Applications, Analytics, Team](P2-6-all-applications-analytics-team.md) | `feat/admin-views` |

## Phase 3 — Batch, imperfect images, hardening (4 tickets)

Stretch features and robustness — peak-season batch, degraded photos, error handling, perf.

| # | Ticket | Branch |
|---|---|---|
| P3-1 | [Batch intake](P3-1-batch-intake.md) | `feat/batch` |
| P3-2 | [Imperfect-image robustness](P3-2-imperfect-image-robustness.md) | `feat/image-robust` |
| P3-3 | [Error-handling pass](P3-3-error-handling-pass.md) | `feat/errors` |
| P3-4 | [Performance hardening](P3-4-performance-hardening.md) | `feat/perf` |

## Phase 4 — Assistant and knowledge base (3 tickets)

Read-only chat helper grounded in admin-uploaded docs and role-scoped metrics.

| # | Ticket | Branch |
|---|---|---|
| P4-1 | [Knowledge base store and ingestion](P4-1-knowledge-base-store-and-ingestion.md) | `feat/kb-ingest` |
| P4-2 | [Retrieval-grounded assistant](P4-2-retrieval-grounded-assistant.md) | `feat/assistant` |
| P4-3 | [Assistant guardrails](P4-3-assistant-guardrails.md) | `feat/assistant-guardrails` |

## Phase 5 — Evals and observability (5 tickets)

Prove and improve AI quality. The backbone for safe shipping.

| # | Ticket | Branch |
|---|---|---|
| P5-1 | [Tracing](P5-1-tracing.md) | `feat/otel` |
| P5-2 | [Offline eval harness](P5-2-offline-eval-harness.md) | `feat/evals` |
| P5-3 | [Agent-correction feedback loop](P5-3-agent-correction-feedback-loop.md) | `feat/feedback-loop` |
| P5-4 | [Model bake-off](P5-4-model-bake-off.md) | `feat/model-bakeoff` |
| P5-5 | [CI eval gate](P5-5-ci-eval-gate.md) | `feat/eval-gate` |

## Phase 6 — Production migration (in-boundary) (7 tickets)

Move the proven prototype into the agency's Azure FedRAMP boundary. Each ticket attaches at a known seam.

| # | Ticket | Branch |
|---|---|---|
| P6-1 | [In-boundary model adapter](P6-1-in-boundary-model-adapter.md) | `feat/inboundary-model` |
| P6-2 | [Persistence and audit](P6-2-persistence-and-audit.md) | `feat/persistence` |
| P6-3 | [Authentication and RBAC](P6-3-authentication-and-rbac.md) | `feat/auth` |
| P6-4 | [COLA integration](P6-4-cola-integration.md) | `feat/cola-integration` |
| P6-5 | [Correction lifecycle](P6-5-correction-lifecycle.md) | `feat/correction-cycle` |
| P6-6 | [Self-hosted observability](P6-6-self-hosted-observability.md) | `feat/obs-prod` |
| P6-7 | [Compliance hardening](P6-7-compliance-hardening.md) | `feat/compliance` |

---

## Open items flagged across tickets

The phase-agents documented interpretation choices and unresolved gaps worth being aware of:

- **A18 verbatim warning text** — placeholder sentinel in P0-4 (`__TODO_VERBATIM_TEXT_A18__`); blocks final acceptance until pinned
- **Default matching thresholds** — P0-4 seeds defaults (brand/class-type 0.92, producer 0.90, address 0.85); tunable in config; P5-2 calibrates against the golden set
- **Image cap** — locked to 1568px long edge (D7); env-overridable for the P6-1 swap
- **Sample fixture set** — P0-3 introduces 3 keyed fixtures (`sample-green-001`, `sample-abv-mismatch-001`, `sample-warning-titlecase-001`); P1-1 expands; P2-6 grows to ~30 for analytics
- **P3-1 `p-limit`** — the only Phase 3 new dependency
- **P6-1 model winner** — gated on P5-4 bake-off; ticket records the bar, not the result
- **P6-2 ORM** — Drizzle vs Kysely deferred to DEV-LOG decision
- **P6-3 IdP transport** — OIDC vs SAML deferred to agency IdP capability
- **P6-4 COLA transport** — internal API / queue / DB feed all stubbed; mechanism agreed with COLA team
- **P6-6 backend** — Langfuse vs Phoenix deferred to a shallow PoC
- **P6-7 retention windows** — federal records schedule values TBD; mechanism ships, values don't

## Conventions

- **Ticket files are pre-filled.** The only fields left blank at session start are `What the previous ticket delivered (at start)` and `Files to modify → current contents`. Fill those with the *real* state from the prior ticket.
- **Cross-references** use bare names (`@PRD.md`, `@CONTEXT.md`, etc.) which resolve via Glob from anywhere in `docs/`.
- **No emoji.** Match the calm, technical style of the source TICKETS.md.
