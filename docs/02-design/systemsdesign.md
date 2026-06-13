# Systems Design: AI-Powered Alcohol Label Verification

Status: draft for review
Owner: solo developer
Last updated: 2026-06-10

This document describes how the system is structured to satisfy requirements.md, within the limits of constraints.md and the open items in assumptions.md. It covers the architecture, the components, the two data flows, the decision logic that powers the three-lane review model, how the latency budget is met, error handling, security posture, and the path to a future production version. Technology choices are justified separately in techstack.md; this document focuses on structure and behavior.

## Resolved Open Dependencies

The requirements doc left three items open. For the design to be complete, they are resolved here with defaults. Each is a recommendation, not a lock, and each is isolated so it can be changed cheaply.

D1. Vision model provider. Default to a single hosted multimodal model accessed through a provider interface, with one concrete provider wired up for the prototype and a second documented as a drop-in alternative. The provider is a configuration and adapter choice, not an architectural one, so the rest of the system is unaffected by which one is used. The API key is still required to run against a live provider; the system runs in a mocked mode without one for local development and tests.

D2. Batch state. Default to ephemeral, in-memory job state. This aligns with the no-PII-persistence requirement (NFR-4), keeps the data layer empty, and is acceptable for a prototype where a restart cancelling an in-flight batch is tolerable. A documented upgrade path swaps the in-memory job store for SQLite if restart resilience is later required, touching only the job store module.

D3. Government warning canonical text. Treated as configuration data (FR-25). The verbatim regulatory text is still to be inserted (assumption A18), but the design does not depend on its exact content, only on it being present in config.

## Design Decisions from Grill Session (2026-06-10)

A structured grilling session (per the grill-me method) walked the design tree and resolved the following. These refine and, where noted, supersede statements elsewhere in this document.

D4. Extraction contract. The model returns raw transcribed text per field and renders no verdicts. The government warning additionally returns structural flags: all-caps (reliable), bold (best-effort), presence, and a legibility signal. All comparison, normalization, and lane logic live in code. This is the concrete form of "the model reads, the code decides," and it keeps regulatory judgment testable and tunable.

D5. Confidence source. The confidence that drives lane assignment is computed in code from model-reported signals (text content, per-region legibility), not taken from the model's overall self-reported confidence (which is poorly calibrated). It is derived from the string-distance margin of each match, whether the field was found, and the model's per-region legibility flag used only as one input. The model produces signals; the code applies the rule and the threshold. A near-miss therefore lands in the ambiguous lane regardless of what the model claims.

D6. Warning bold detection. Presence, verbatim wording, and all-caps are verified strictly in code. Bold is a best-effort flag: when the model is not confidently sure the heading is bold, the result is routed to the ambiguous lane for a human glance rather than auto-passing or auto-rejecting. An unreliable styling read never makes a regulatory decision on its own. This downgrades the risk in assumption A14.

D7. Image resolution. Supersedes the earlier "downscale every image" note. Images are sent at the provider's maximum usable resolution with no downscaling below that cap (around 1568px on the long edge for Claude), because the smallest, highest-stakes text (the warning) must stay legible. Uploading beyond the provider's internal cap is avoided since the provider discards it. If the warning region returns low confidence, a targeted high-resolution re-read of just that cropped region is performed. techstack.md is updated to match.

D8. Provider strategy. A single provider, Claude Sonnet 4.6 as the accuracy-safe default, behind the existing adapter and swappable by config. No runtime fallback or multi-model consensus in the prototype; the adapter already makes a swap a one-line change.

D9. Form input. The prototype ships preloaded sample applications (form-and-label pairs) that double as the test fixtures, plus a manual-entry path for custom inputs. This drives both the demo and the acceptance-criteria test set.

D10. Timeout and degrade. Per-call timeout of about 8 seconds, treating p95-under-5-seconds as the goal rather than a per-request kill switch. On a true timeout the system returns a low-confidence "could not verify in time" result and offers one automatic retry.

D11. Review-model default. The default posture is conservative: high-confidence matches go to a one-click bulk-confirm queue, and nothing auto-approves unseen. The agent owns every approval but clears the green lane in one action. True auto-clear is available by flipping the config dial (see constraints: Review Model).

D12. Multi-label applications. Supersedes assumption A5. The prototype supports multiple label images per application (front, back, neck). A field is satisfied if found on any face, and the government warning in particular is checked across all faces, since it usually lives on the back label. All faces are matched against the single form. This avoids systematically false-flagging the warning on front-label uploads.

D13. Unit of verification (alignment pass). The Application is the unit, made of one Form plus one or more Label faces (see CONTEXT.md). "Label" no longer denotes the whole submission. The 150,000-per-year figure counts applications, and cost is reckoned per image, so an application's cost is its face count times the per-image cost. This corrects a label-versus-application conflation that had crept into the cost model.

D14. Multi-face call structure (alignment pass). One model call per application, with all of the application's label faces attached to that single call. The model transcribes fields per face and the code merges them and applies the "found on any face" rule (D12). One round trip protects the latency budget and keeps cost accounting per-application.

D15. Work distribution and routing (pull-based shared queue). The tool triages every application, and routing applies only to the exception lanes, not to all 600 daily applications. The match lane is bulk-confirmed (or auto-cleared per policy) and is never routed to an individual agent. The mismatch and review lanes, roughly 30 percent of volume (around 180 a day), enter a single prioritized shared work pool. Agents pull the next item when they finish the current one; claiming an item sets its assigned_agent_id and claimed_at. A supervisor can hand-assign or reassign any item. This model self-balances across agents, absences, and uneven speeds without a fairness algorithm, and because triage removes the clean majority first, the routing problem shrinks from about 13 applications per agent per day to under 4 exceptions each. The prototype is single-user, so the shared pool and an agent's claimed queue collapse into one and routing is effectively simulated; this defines the production model. A round-robin push assignment is a documented, configurable alternative. Note that this supersedes the earlier hand-waved position that "assignment comes from COLAs Online": intake comes from COLAs Online, but the tool owns work distribution over the triaged exceptions.

Routing is also specialization-aware. Each agent has a beverage specialization (wine, distilled spirits, or malt beverage), so specialized teams handle only their label types, the wine team takes wine exceptions, the spirits team takes spirits, and so on. The router matches an application's beverage_type to an available specialist; effectively the shared pool is partitioned by type. To avoid starvation when no specialist is free (off-hours, a backlog spike, or a thin team for one type), it overflows to any available agent, which is a configurable safeguard rather than a hard partition. Admins assign specializations in the Team view. This is expected to streamline review further, since a specialist reads their own beverage type's labels faster and more accurately.

D16. Role-based shells (access model). Two effective roles: Agent and Admin (admin is the division supervisor; schema.md agent.role enum is trimmed to these two). The Admin shell exposes Operations, All Applications, Analytics, and Team, all global-scoped (the admin sees the whole division). The Agent shell exposes My Queue, My Stats, and Profile, scoped to the logged-in agent by row-level access (an agent sees only their own claimed items and their own stats, never others'). Admin-only actions, bulk-confirming the match lane and distributing or reassigning exceptions, are gated to Admin; agents only pull from the pool and dispose their own items. This is an access-control and navigation layer over the existing components and data: it adds no tables (agent.role already exists; metric_rollup already keys by agent_id) and changes no part of the verification or routing pipeline. Identity drives the role (production: real RBAC per NFR-8; the prototype simulates it with a role switcher). Profile carries the agent's availability, which feeds the pull-routing eligibility in D15.

## Decisions That Look Wrong But Are Deliberate

A few choices here are counterintuitive enough that a future reader may try to "fix" them and break something intentional. They are flagged together so they are not reversed by accident. Each is hard to reverse, surprising without context, and the result of a real trade-off.

- The model only reads; the code makes every match decision, and confidence is computed in code rather than taken from the model (D4, D5). It is tempting to let the model judge matches directly. Do not: that judgment cannot be unit-tested or tuned by configuration, and the model's self-reported confidence is poorly calibrated, which is exactly what would let a confident misread auto-clear.
- Images are sent at full usable resolution, not downscaled for speed (D7). It is tempting to shrink them to cut latency and cost. Do not: the government-warning text is the smallest and highest-stakes content on a label, and shrinking it would make the most important check illegible. The provider caps oversized images internally anyway.
- The prototype persists nothing and has no database (see Security and Privacy Posture; NFR-4). It is tempting to add storage. Do not for this prototype: the data is applicant PII and IT required that nothing sensitive be stored. The named upgrade path, if state is later needed, is the job-store interface against SQLite.
- The prototype calls a public vision API, but production cannot (D8; assumptions A21, A23). Do not assume this approach ships to production as-is: the agency firewall blocks external ML endpoints, the failure that killed the prior vendor, so production needs an in-boundary model behind the same adapter seam.

## Architecture Overview

The system is a single deployable web application with a thin client, a small API layer, and three internal services behind it: extraction, matching, and triage. A batch orchestrator wraps the same per-application pipeline for bulk jobs. There is no database; all state is either in the request, in the client, or in ephemeral in-memory job tracking.

Text diagram of the components and the single-label path:

    Browser (React client)
        |
        |  1. POST /api/verify  (label image + form fields)
        v
    API layer  (request validation, access gate)
        |
        |  2. preprocess image (resize, normalize, in memory)
        v
    Extraction service  --->  Vision provider adapter  --->  hosted model
        |                          (swappable)
        |  3. structured fields + per-field confidence
        v
    Matching engine  (per-field rules + config: warning text, tolerances)
        |
        |  4. per-field verdicts
        v
    Triage classifier  (rolls verdicts + confidence into one of three lanes)
        |
        |  5. structured result
        v
    API layer  --->  Browser renders result (color + icon + text, per-field breakdown)

The batch path reuses steps 2 through 5 per application, wrapped by an orchestrator:

    Browser
        |  POST /api/batch  (many labels + form data)
        v
    Batch orchestrator  (bounded-concurrency queue, in-memory job state)
        |  fan out, N at a time
        v
    [ per-application pipeline ] x N  ---> results collected, grouped by lane
        ^
        |  GET /api/batch/:id  (poll progress and results)
    Browser

## Component Breakdown

Client (React). Renders two flows: single-label and batch. Its responsibilities are input capture (image upload, form fields), submitting requests, rendering the per-field result and the three-lane outcome accessibly, and providing effortless bulk confirmation of the high-confidence-match lane. It holds results in memory only; nothing is written back to a server store. The client is deliberately plain and large-targeted for low-tech-comfort users (NFR-2).

API layer. A small set of route handlers: one synchronous verify endpoint, and three batch endpoints (create, poll, and the bulk-confirm acknowledgment which is a client-side state action that need not hit the server). It validates and normalizes input against a schema, enforces the access gate, sets timeouts, and shapes errors into structured results rather than raw failures. It is stateless aside from delegating batch jobs to the orchestrator.

Extraction service. Takes a preprocessed image and asks the vision provider, through the adapter interface, for a structured set of label fields plus a per-field confidence. The prompt and the expected response schema live here. This service knows nothing about matching; it only reads the label. Swapping providers means writing a new adapter, not changing this service's contract.

Vision provider adapter. The single seam to the outside world. It implements a narrow interface (given an image and a field schema, return structured fields with confidences) and hides provider-specific request and response formats. A mock adapter returns canned results for local development and tests, so the system runs and the matching logic is testable without a live key or network.

Matching engine. The correctness core. For each field it applies the right rule: fuzzy, case-and-punctuation-tolerant comparison for brand and class/type; normalized exact comparison for alcohol content and net contents; and exact verbatim-plus-styling verification for the government warning. All thresholds and the canonical warning text come from configuration, not code (FR-25). It emits a per-field verdict (match, mismatch, not found, low confidence) with a short reason.

Triage classifier. Turns the set of per-field verdicts and confidences into exactly one lane (FR-13): high-confidence match when every field matches with high confidence; clear mismatch when any field is a confident mismatch; low-confidence or ambiguous when extraction confidence is low, the image is unreadable, or a match is a near-miss judgment case. This is the component that operationalizes the review model, and its rules are explicit and inspectable rather than emergent.

Batch orchestrator. Accepts a batch, assigns a job id, and runs the per-application pipeline with bounded concurrency (a fixed worker count, for example five to ten in flight) so a 300-application burst is absorbed without exceeding provider rate limits, blowing the cost ceiling, or starving single-application users. It tracks per-item status in memory and exposes progress. Results are grouped by lane for exception-first review.

Work router. Distributes the triaged exceptions (mismatch and review lanes) into a single prioritized shared pool that agents pull from, sets assigned_agent_id and claimed_at on claim, respects agent availability, and supports supervisor hand-assign and reassign (D15). The match lane does not pass through the router; it is bulk-confirmed. This is a thin coordination component, not part of the verification path. The prototype is single-user, so it is effectively inert.

Access and roles. Not a runtime service but a cross-cutting layer: the role on the agent identity selects the Admin or Agent shell and scopes queries (Admin global, Agent row-scoped to self) and gates admin-only actions (D16). Enforced by real RBAC in production (NFR-8); simulated by a role switcher in the prototype.

Configuration store. Plain data files (in the prototype) holding the canonical government warning text, the per-field match tolerances, and the per-beverage-type field requirements. Editable by a compliance reviewer without touching application code. In production this is replaced by the versioned rule_config table (schema.md); the editing surface is the same — only the persistence layer changes.

Assistant. A read-only chat helper at the bottom right that answers questions, onboards new users, and summarizes the user's own role-scoped analytics. It grounds its answers by retrieving from a versioned knowledge base (schema.md knowledge_base) for help and rules, and from the user's role-scoped metric rollups for summaries, rather than from the model's general knowledge. Admins populate that knowledge base from a Knowledge Base tab by uploading documents, which an ingestion step (off the chat path) chunks, embeds, and indexes; the assistant can only cite what has been uploaded, which is the deliberate control on what it says. It runs behind the same LLM provider adapter and the same access scoping as the rest of the app, takes no actions, and changes no records (FR-30). It adds one application table (the knowledge base) and nothing else: its conversation traces and feedback go to the observability backend, not the application database. It is a second, smaller use of an LLM in the product, evaluated per observability.md, where groundedness and zero role-scope leakage are the hard bars.

Observability and evaluation. A cross-cutting layer, not a runtime service: OpenTelemetry traces around both AI components (verification and the assistant), offline golden-set evaluations, the agent-correction feedback loop as ground truth, online drift monitoring, and guardrail evals (including zero role-scope leakage). Self-hostable and in-boundary, so it runs within the FedRAMP boundary in production. Full detail in observability.md.

## Data Flow: Single-Application Verification

1. The agent uploads the application's label face image or images (front, back, neck) and supplies the form field values, then triggers the one primary action.
2. The API layer validates input, enforces the access gate, and preprocesses each image in memory: normalize orientation and cap at the provider's maximum usable resolution without downscaling below it (D7), so the small warning text stays legible.
3. The extraction service sends all of the application's faces and the field schema through the provider adapter in a single call (D14) and receives the transcribed fields per face. The model returns text only; it renders no verdicts (D4).
4. The matching engine merges the faces, then compares each field to the form value using its per-field rule and the configured tolerances, producing per-field verdicts with code-derived confidence (D5).
5. The triage classifier rolls the verdicts and confidences into one lane.
6. The API returns a structured result: overall lane, overall confidence, per-field breakdown (form value, extracted value, verdict, confidence, reason), and the list of flags.
7. The client renders it: the lane is unmistakable through color plus icon plus text, mismatched fields are called out, and the agent can expand the per-field breakdown to resolve a judgment case.

The whole path is one model call (carrying all of the application's faces) plus light local work, which is what keeps it inside the five-second budget (NFR-1).

## Data Flow: Batch Verification

1. The agent submits many applications with their form data and label faces. The API hands the set to the orchestrator, which returns a job id immediately.
2. The orchestrator runs the per-application pipeline with bounded concurrency, updating in-memory per-item status as each completes.
3. The client polls the job endpoint for progress and partial results, showing a running count.
4. On completion, results are grouped by lane. The agent reviews the clear-mismatch and low-confidence groups first, then bulk-confirms the high-confidence-match group in one action.

Because batch is asynchronous, cold start and per-item latency are not user-facing pressures here; throughput and not breaking the single-label path are what matter.

## Decision Logic: How Verdicts Become a Lane

The triage classifier is the heart of the product, so its logic is stated explicitly rather than left to a model.

Per-field verdicts feed in. Confidence here is the code-derived signal from D5 (match margin plus the model's legibility flag), never the model's self-reported confidence. A field is a match if its rule passes and the derived confidence is above the field's threshold. It is a mismatch if the rule fails with high confidence. It is not found if the field is absent from every face. It is low confidence if the derived confidence is below threshold, regardless of apparent match.

The lane is then determined by priority:
- If any field is a confident mismatch, or the government warning fails verification, the lane is clear mismatch. Warning failures always surface here because they are the highest-stakes check.
- Otherwise, if any field is not found, low confidence, or a near-miss on a fuzzy comparison, the lane is low-confidence or ambiguous. Unreadable images land here too.
- Otherwise (every field a confident match), the lane is high-confidence match.

This priority ordering encodes the agency's risk posture: a real problem is never hidden behind an otherwise-clean result, and anything uncertain is escalated to a human rather than waved through. The thresholds that govern confident-versus-uncertain are configuration, so the agency can tune how aggressive auto-clearing is (see constraints: Review Model).

## Meeting the Latency Budget

The five-second budget is the hard requirement, so the critical path is kept minimal. The budget is spent roughly as: input validation and image preprocessing in well under a second; one vision model call as the dominant cost, typically a couple of seconds; matching and triage in milliseconds since they are local computation; and serialization and render overhead small. The design choices that protect the budget: exactly one model call per application carrying all its faces (no multi-pass chains on the critical path), images sent at the provider's maximum usable resolution rather than downscaled (D7), since the provider caps oversized images internally anyway, an always-warm host so there is no per-request cold start (see constraints: Cold start tolerance), and an approximately eight-second request timeout (D10) that converts a slow provider response into a graceful low-confidence result with one retry rather than an indefinite hang. Any heavier work, such as image enhancement for badly degraded photos, or the targeted high-resolution re-read of a low-confidence warning region (D7), is kept off the synchronous critical path. The multi-face call adds image tokens but remains a single round trip, so the latency profile is unchanged.

## Error Handling and Degraded Cases

The system treats expected bad inputs as normal outcomes, not errors. An unreadable, blank, or non-label image returns a structured needs-a-better-image result in the low-confidence lane (FR-16), mirroring what agents do today. A provider timeout or transient failure on a single label returns a low-confidence result with a retry affordance, never a raw error page. In a batch, a single failed item is marked failed within the job and does not abort the whole run; the agent sees which items need resubmission. Input that fails validation (missing required field for the beverage type, unsupported file) is rejected at the API boundary with a clear, plain-language message. The guiding principle is that an agent should never see a stack trace, only an actionable result.

## Security and Privacy Posture

For the prototype: a single shared access gate sits in front of the app, present to protect against unattended spend rather than as a real security control (NFR-8). No applicant PII is persisted; images and extracted values live only in the request lifecycle and in ephemeral batch state, and are never written to durable storage (NFR-4). The only external network destination is the vision provider, which keeps the attack and compliance surface to a single endpoint and matches the firewall-minimization theme from discovery. Transport is over HTTPS via the host.

For production (documented, not built): real identity within the agency's FedRAMP boundary, almost certainly PIV/CAC and SSO with role-based access and audit logging; an in-boundary model service because the agency firewall blocks external ML endpoints (the failure mode that killed the prior vendor); and a governed datastore with retention and encryption if any record-keeping is required. These are called out because they change the architecture materially and should not be discovered late (assumptions A8, A21).

## Failure Modes and Resilience

The notable failure modes and the design's response: provider rate limiting under a large batch is bounded by the fixed concurrency limit, so the system self-throttles rather than tripping limits; provider latency spikes are capped by the per-request timeout that degrades to a low-confidence result; a provider outage degrades the whole system to returning low-confidence results, which is safe because nothing auto-approves and agents simply fall back to manual review for the duration; a restart loses in-flight batch state by design (D2), which is acceptable for the prototype and signposted as the trigger for the SQLite upgrade. There is no data to corrupt because there is no persistence.

## Observability

Minimal and privacy-preserving. Structured logs capture per-request latency, the lane outcome, provider call duration, and error categories, but never the image or the applicant PII. A simple latency timing around the model call makes it easy to confirm the five-second budget is being met in practice, which is the single most important operational metric given the project's history.

## Production Evolution Path

The prototype is deliberately shaped so the expensive future changes are localized. Moving to an in-boundary model means writing one new provider adapter behind the existing interface; the two concrete production paths are Azure OpenAI vision in Azure Government (recommended, FedRAMP High, US vendor, no external endpoint) and a self-hosted open OCR-VL model on agency GPUs (the air-gapped fallback, with olmOCR as the provenance-safe lead). Both are documented in techstack.md (Model Selection and the In-Boundary Production Path), and the choice is settled by the bake-off on real TTB labels in observability.md. Adding persistence and audit means implementing the job store interface against a real datastore and adding a write path that the prototype simply omits. Adding real auth means replacing the access-gate middleware. Connecting to COLA means adding an ingestion adapter that supplies form values and label images in place of manual entry, and a write-back adapter that returns the agent's disposition to COLAs Online. COLAs Online remains the system of record and owns all applicant notification and Public Registry publishing; our tool sends no email and publishes nothing itself (see flowchart.md, System Context). None of these touch the matching engine or the triage classifier, which is where the domain correctness lives and which is the part worth preserving. That separation is the main architectural bet of the design.
