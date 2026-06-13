# Project Constraints: AI-Powered Alcohol Label Verification

Status: draft for review
Owner: solo developer
Last updated: 2026-06-10

This document records the constraints that shape every technical decision on the project. It is written against the real TTB rollout as the production target, while being explicit that the immediate deliverable is a standalone proof-of-concept prototype. Where a number is an assumption rather than a given, it is labeled as such.

## Scale and Load Profile

The production system is low-throughput, latency-sensitive, and bursty. That combination, not raw volume, is what drives the architecture.

Production reference numbers (from the discovery interviews):
- 150,000 label applications reviewed per year.
- 47 compliance agents handling the full queue.
- Offices in at least Washington DC and Seattle, so usage spans US Eastern through Pacific business hours.
- Peak-season behavior: large importers submit 200 to 300 applications at once.

Derived load:
- 150,000 / ~250 business days is roughly 600 applications per working day across the whole agency.
- 600 / 47 agents is roughly 13 applications per agent per day.
- Sustained request rate is well under 1 request per second even with all agents active. This is not a high-QPS system.
- The real stress is the burst: a single 300-application batch dropped in at once. The system must absorb bursts through parallelism, not sustain high steady throughput.

Users at launch (prototype): 1 to 5. The reviewer evaluating the take-home, plus the developer. No real agent traffic.

Users at 6 months (if the POC is taken forward internally): up to ~50 named users (the 47 agents plus supervisors and IT). Concurrency stays low; realistically fewer than 10 simultaneous active sessions at any moment. Plan for ~50 seats, not 50 concurrent heavy requests.

Traffic pattern: weekday, business-hours, US time zones. Effectively zero overnight and weekend load. Predictable daytime ramp with seasonal spikes tied to import cycles. Batch dumps are the defining event to design for.

Real-time requirement: this is the single hardest constraint and the reason the prior vendor pilot failed. Results must come back in about 5 seconds per application or agents abandon the tool. The earlier scanner took 30 to 40 seconds and agents reverted to manual review.
- Decision: target p95 end-to-end latency under 5 seconds for a single application. Treat 5 seconds as a hard budget, not an aspiration.
- Implication: one vision model call per application (all faces in one call), no multi-pass pipelines on the critical path, and any enhancement or retry logic must fit inside the budget or run asynchronously.

Cold start tolerance: agents work in sessions, so a one-time warm-up of a few seconds when they first open the tool is acceptable. A cold start on every request is not, because it would routinely blow the 5-second budget. Decision: avoid scale-to-zero serverless for the inference path, or keep a warm instance, so per-application latency is consistent. For batch jobs, cold start is irrelevant because they run asynchronously and the agent does not watch a spinner.

Overall scaling decision: optimize for per-request latency and burst parallelism. Do not over-invest in sustained-throughput infrastructure that this workload will never use.

## Review Model

This is the core product principle, and it defines what the tool is actually for. The tool does not replace the agent's approval. It replaces the agent's manual verification of the obvious matches.

Today the verification work and the approval act are fused: an agent checks every field by eye and then approves. The pain is the verification grind, not the approval click. So the tool's job is to take over the verification and sort every application by confidence, so the agent's attention goes only where it is needed.

The verification produces a triage result that places each application in one of three lanes:
- High-confidence match: every field agrees and confidence is high. This is cleared, or queued for a one-click bulk confirmation. The agent does not re-verify it field by field.
- Clear mismatch: one or more fields disagree. The application is flagged with the specific field that is wrong and routed to the agent.
- Low-confidence or ambiguous: unreadable or poor-quality images, near-miss matches, and judgment calls like "STONE'S THROW" versus "Stone's Throw." Routed to the agent to decide.

The agent spends their time almost entirely in the second and third lanes. That is the time saving, and it is what makes 47 agents against 150,000 applications tractable.

Two boundaries on this principle:
- A human remains accountable for the final approval. The agency carries legal liability for what it approves, and judgment cases are where a person outperforms any threshold. Removing the human from approval entirely is a policy decision the agency makes later, not an assumption the prototype builds in. The human's decision (the disposition) is one of two: approve or return for correction; rejection is automatic if a returned application is not corrected within 30 days. The clean match lane is approved by a supervisor in bulk (see flowchart.md and CONTEXT.md).
- Whether high-confidence matches auto-clear without a human glance, or require a lightweight bulk confirmation, is a dial the agency sets based on how much liability it will accept. The tool's responsibility is to output a trustworthy verdict plus a confidence signal and a specific flag. The workflow built on top of that output is configurable, and the tool is designed to support either setting.

Design implication: every result must carry a confidence signal and a per-field breakdown, not just a binary pass or fail. The UI must make the three lanes obvious at a glance and must make bulk confirmation of high-confidence matches effortless.

## Budget and Cost Ceiling

Monthly spend limit: not yet fixed by the stakeholder. Working assumption for the prototype is a ceiling of $25 per month, covering hosting plus metered vision-API usage during development and the demo. This is flagged as an assumption to confirm; the design keeps spend near zero and degrades gracefully if the ceiling is lower.

Hosting: free or near-free tier (single small managed instance). The traffic profile does not justify paid capacity for the prototype.

Tokens and API credits:
- Cost model is per-application inference: roughly two full-resolution label-face images plus a small structured text response per verification (one call per application, all faces attached).
- Estimated cost per application is on the order of $0.01 to $0.04 across models, about $0.026 with the default Claude Sonnet 4.6. Used as a planning figure, not a guarantee.
- Prototype usage is dozens to a few hundred calls total, so expected API spend for the entire take-home is low-double-digit dollars at most.
- Production projection for context only: 150,000 applications per year runs roughly $3,800 with the default Sonnet 4.6, up to about $6,400 with the most expensive model, before batch discounts. Modest relative to 47 agent salaries, which is the relevant comparison for the business case.

Cost-control decisions: cap output token size by asking the model for a tight structured response; do one call per application (all faces attached), not several; cache nothing sensitive; and keep the option to swap to a cheaper model without code changes.

A full per-model breakdown with daily, monthly, and yearly projections across Claude, GPT-4o, and Gemini, together with the labor-savings business case, is maintained separately in business.md. The short version: prototype API spend is low-double-digit dollars regardless of model, even at full national volume with the most expensive model inference runs on the order of $6,400 per year, and that cost is set against an estimated $690,000 to $960,000 per year in agent labor saved.

## Time to Ship and MVP Timeline

Target: working MVP in about one week.

Indicative day-by-day:
- Day 1: scope lock, this constraints doc, test-data strategy, project skeleton, field schema for the form.
- Day 2: single-label flow end to end. Image in, fields extracted, raw result out. Prove the 5-second budget is achievable.
- Day 3: per-field matching logic, including fuzzy matching for brand and type and the exact government-warning check.
- Day 4: agent-facing UI. Clean, large-target, plain-language results screen aimed at low-tech-comfort users.
- Day 5: batch upload (the most-requested stretch feature) and graceful handling of unreadable images.
- Day 6: test set assembly, both green cases from the public registry and synthesized red cases, plus correctness checks on the matching logic.
- Day 7: deploy, write the README and approach notes, document trade-offs and limitations.

This sequence front-loads the riskiest requirement (latency) and treats batch and bad-image handling as stretch goals that can be cut without breaking the core.

## Priority

Prioritized with MoSCoW. The brief is explicit that a clean working core beats ambitious-but-incomplete, so the Must list is deliberately small.

Must have:
- Upload an application's label face image or images and enter the form field values.
- Extract the corresponding fields from the label image.
- Compare per field and present a clear pass or flag result for each.
- Exact verification of the government health warning, including all-caps and bold treatment of "GOVERNMENT WARNING:".
- A results screen a non-technical agent can read at a glance.

Should have:
- Batch upload for many labels at once, processed asynchronously.
- Confidence signaling and graceful handling of low-quality or unreadable images.

Could have:
- Image enhancement for glare and skew.
- Export or print of the verification result.

Will not have (explicitly out of scope for the prototype):
- Direct integration with the COLA system.
- Authentication, SSO, or role management.
- Any persistence of applicant PII.

## Iteration Cadence

Solo developer, so cadence is built for tight, low-ceremony loops:
- A deployable build at the end of each day.
- Commit early and often with a working main branch.
- Continuous deployment of the prototype so the live URL always reflects the latest stable state.
- Trade-offs and assumptions recorded as they are made, not reconstructed at the end.

## Maintainability

Decisions made now so a future team (or future me) can extend this without re-learning everything:
- Single primary language and stack to minimize context-switching and tooling surface.
- Clear separation between extraction (reading the label), matching (comparing to the form), and presentation (the agent UI), so any one can change without disturbing the others.
- The verification rules, especially the exact government-warning text and the per-field match tolerances, live in configuration or data, not buried in code, so a compliance person can review and adjust them.
- Automated tests focused on the matching logic, which is where correctness actually matters and where regressions would be silent.
- Minimal dependencies. Prefer boring, well-supported libraries over novel ones.
- The vision model is treated as a swappable component behind a small interface, so the provider or model can change without touching the rest of the app.

## Compliance and Regulatory Needs

For the prototype:
- No storage of sensitive data. Images and form values are processed in memory and not persisted. IT was explicit that nothing sensitive is stored for this exercise.
- No PII retention, no document retention obligations triggered, because nothing is kept.
- Standalone POC only. No connection to COLA or any system of record, which avoids inheriting their authorization requirements.

For any future production path (documented now because it changes the architecture, not built now):
- The agency runs on Azure inside a FedRAMP boundary. A production system would have to live within that boundary and clear the certification process.
- The network blocks outbound traffic to many external domains, and the prior vendor pilot broke because the firewall blocked its external ML endpoints. This is the most consequential production constraint: a production version likely cannot call public vision APIs and would instead need an in-boundary model service, for example a model hosted within Azure under the agency tenant. The prototype uses an external API for speed of development, and this gap is called out as a known migration cost.
- Production would carry real PII (applicant names and addresses), so document retention policy, access controls, and audit logging would all apply.
- The tool assists the agent; it does not make the final regulatory decision. The human agent remains the decision-maker, which keeps the prototype out of the territory of automated regulatory determinations.

## Team Constraints

This is a solo project. One person covers engineering, design, testing, and documentation, with no separate QA, design, or ops support.

Implications that follow directly from being solo:
- Keep scope lean and protect the Must-have list above all else.
- Favor managed services and a hosted vision model over any custom infrastructure or model training. There is no capacity to operate complex systems.
- No on-call and no high-availability target for the prototype. Business-hours best-effort is sufficient.
- Choose well-documented, mainstream tools so that help is searchable and the developer is never blocked on niche knowledge.
- Documentation is part of the deliverable, not an afterthought, because the reviewer's understanding depends on it and there is no one else to explain the system.
