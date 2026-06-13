# Requirements: AI-Powered Alcohol Label Verification

Status: draft for review
Owner: solo developer
Last updated: 2026-06-10

This document states what the system must do (functional requirements), how well it must do it (non-functional requirements), and how we will know it is done (acceptance criteria). It is the basis for systems design.

How to read this:
- FR is a functional requirement, NFR a non-functional one, AC an acceptance criterion.
- Each requirement carries a priority: Must, Should, or Could, consistent with the Priority section in constraints.md.
- Where a fact already lives in constraints.md or assumptions.md, this document references it rather than repeating it, so each fact has a single home. References look like (see constraints: Review Model) or (assumption A14).

## Functional Requirements

### Input

FR-1 (Must). The system accepts one or more label face images for an application (front, back, neck), the unit of verification being the application (see CONTEXT.md, systemsdesign D13). Supported formats include common photo formats (JPEG, PNG). Each image may be a photo of a bottle or a flat artwork proof.

FR-2 (Must). The system accepts the application's form field values as structured input: beverage type, brand name, class/type designation, alcohol content, net contents, bottler/producer name and address, and country of origin for imports. These values are entered by the user or pre-filled, standing in for a COLAs Online record (assumption A4). The system does not read the application form by OCR (assumption A2).

FR-3 (Must). The selected beverage type (wine, distilled spirits, or malt beverage) determines which fields are mandatory and which checks apply. The prototype may demonstrate primarily on distilled spirits (assumption A10).

### Extraction

FR-4 (Must). From the label image, the system extracts the fields that correspond to the form: brand name, class/type designation, alcohol content, net contents, bottler/producer name and address, country of origin when present, and the government health warning including its text and visual styling.

FR-5 (Must). Extraction returns a confidence signal, per field and overall, so results can be triaged rather than treated as binary (see constraints: Review Model).

FR-6 (Should). The system tolerates moderately imperfect images, including mild angle, glare, and uneven lighting (assumption A13). Images too degraded to read reliably are not force-processed; they are routed to the unreadable lane (FR-16).

### Matching and Verification

FR-7 (Must). For each field, the system compares the extracted value against the form value and produces a per-field verdict: match, mismatch, not found on label, or low confidence.

FR-8 (Must). Brand name and class/type matching tolerates differences of case, punctuation, and spacing, so cosmetic variation such as "STONE'S THROW" versus "Stone's Throw" is treated as a match, while genuine differences are flagged (assumption A16).

FR-9 (Must). Alcohol content is matched as stated-equals-stated for the prototype. Real TTB tolerance allowances are acknowledged but not implemented, and this simplification is documented (assumption A19).

FR-10 (Must). Net contents matching normalizes units and formatting before comparison, so "750 mL" and "750ML" are treated as equal.

FR-11 (Must). The government health warning is verified exactly against a canonical text loaded from configuration (assumptions A17, A18). Verification covers three things: that the warning is present, that its wording matches the canonical text verbatim, and that "GOVERNMENT WARNING:" is rendered in all capitals and bold.

FR-12 (Must). The system detects the common warning defects called out in discovery: the heading in title case instead of all caps, altered or substituted wording, and a missing warning. Detecting an excessively small or illegible warning font is a Could-level extension.

### Triage and Output

FR-13 (Must). Each verification is classified into one of three lanes (see constraints: Review Model): high-confidence match, clear mismatch, or low-confidence or ambiguous.

FR-14 (Must). The system returns a structured result containing the overall lane, an overall confidence signal, a per-field breakdown (form value, extracted value, verdict, confidence), and a list of specific flags.

FR-15 (Must). For any mismatch, the result identifies the specific field or fields that differ, so the agent's attention goes straight to the problem.

FR-16 (Must). An unreadable or unusable image returns a structured "needs a better image" result in the low-confidence lane. This is a normal outcome, not an error response (consistent with current practice, where agents request a better image).

### Batch

FR-17 (Should). The system accepts a batch of many applications with their associated form data and label faces, targeting the peak-season case of up to roughly 300 in one submission (assumption A29).

FR-18 (Should). Batch processing is asynchronous with bounded parallelism, and the system reports job progress. Bounded parallelism absorbs the burst without breaking single-label latency or exceeding API rate and cost limits (see constraints: Scale and Load Profile).

FR-19 (Should). Batch results are grouped by lane so the agent reviews exceptions and ambiguous cases first and skims the matches.

FR-20 (Should). The supervisor can bulk-confirm the high-confidence-match group in one action (see constraints: Review Model). The match lane is not routed to agents; only supervisors see and act on it.

### Workflow and Interface

FR-21 (Must). Starting a verification is a single, obvious primary action, with no hunting for controls (assumption A28).

FR-22 (Must). The results screen conveys each verdict with color, an icon, and a plain-text label together, never color alone, and makes the three lanes obvious at a glance (see NFR-2).

FR-23 (Should). Bulk confirmation of high-confidence matches is effortless and prominent for the supervisor. The page above the action serves as an aggregate review surface: count of matches, bottom-quartile-confidence match applications surfaced inline and tap-expandable to the per-field breakdown, any match-lane application with a single flagged field highlighted, and deltas vs. the rolling baseline match rate. This makes the supervisor's review of the aggregate (not per-app) explicit and auditable.

FR-24 (Must). The agent can expand any result to see the per-field breakdown in order to resolve a flag or judgment case.

### Configuration

FR-25 (Must). The canonical government warning text and the per-field match tolerances are data-driven configuration, not values buried in code, so a compliance reviewer can inspect and adjust them (assumption A20).

### Disposition

FR-26 (Must). After reviewing an exception, a specialist agent records one of two dispositions: Approve (which also covers a false positive, where the AI flagged something that is actually fine) or Return for correction. Disposition is whole-application only — the agent cannot approve one face while returning another, and cannot approve some fields while rejecting others. There is no manual reject; rejection is automatic when a returned application's 30-day window lapses (FR-27). The clean match lane is approved by a supervisor in bulk, not by individual agents. The prototype UI offers these actions and records the choice in-session. This is distinct from the AI lane and the per-field verdicts (see CONTEXT.md; flowchart.md, section 5).

FR-26a (Must). A Return-for-correction disposition must carry a structured reason summary derived from the latest verification's per-field results: the list of fields that failed matching, the system's read of each, the form value, and any free-text agent note. This is what the applicant sees and acts on. Without it, applicants resubmit blind, which churns the correction loop. Stored as part of the disposition record (schema.md: disposition.return_reason).

FR-26b (Must). When extraction fails on one or more label faces (image unreadable, no text detected, or model decline), the system explicitly recommends "Return — unreadable image" in the agent's review surface, citing the affected face(s). The agent may still override, but the default recommendation is deterministic, not a judgment call. Distinct from a low-confidence reading: extraction failure is a system signal, not a triage ambiguity.

FR-27 (Should, production). The Needs-Correction lifecycle, a 30-day correction window, queue priority for corrected resubmissions, and automatic rejection after 30 days, together with writing the disposition back to COLAs Online (which then notifies the applicant and publishes approved COLAs to the Public Registry), are production behaviors. They are represented in the UI and the flowcharts but are out of scope for the prototype, which persists nothing and integrates with nothing (assumptions A6, A8; NFR-4; constraints: Compliance). The tool itself never emails applicants; COLAs Online owns all applicant notification (flowchart.md, System Context).

### Routing and Assignment

FR-28 (Should, production). The tool routes work over the triaged exceptions only. The match lane is bulk-confirmed and is not assigned to an individual. Mismatch and review applications enter a single prioritized shared work pool; an agent pulls the next item, which claims it to them; a supervisor can hand-assign or reassign (see systemsdesign D15). Because triage clears the clean majority first, routing covers only the roughly 30 percent exception volume, not all applications. The prototype is single-user, so routing is effectively simulated; a round-robin push assignment is a documented configurable alternative. Routing is specialization-aware: each agent has a beverage specialization (wine, distilled spirits, malt beverage), and exceptions are routed to a matching specialist so specialized teams handle only their label types, with overflow to any available agent to prevent backlog. Admins assign specializations in the Team view.

### Roles and Access

FR-29 (Should, production). The interface presents two role-based shells (systemsdesign D16). The Admin shell exposes the global views (Operations, All Applications, Analytics, Team) and the admin-only actions (bulk-confirm the match lane, distribute and reassign). The Agent shell exposes the agent's own work and account (My Queue, My Stats, Profile), with data scoped to that agent (row-level access). The agent's Profile carries an availability state that governs whether the pull router sends them work (FR-28). Identity-driven role enforcement is a production concern (NFR-8, RBAC); the prototype simulates the split with a role switcher.

### Assistant

FR-30 (Should). The product includes a read-only chat assistant at the bottom right of the experience. It answers basic questions, onboards new users, summarizes the user's own analytics scoped to their role (an agent sees their own numbers, an admin sees the division), and shares best practices. It is grounded in product help content and the user's data. It never approves, disposes, reassigns, or otherwise changes records, declines legal advice and out-of-scope requests, and points users to the human process. Its groundedness, helpfulness, and role-scope isolation are evaluated per observability.md.

FR-31 (Should). Admins manage the assistant's grounding source from a Knowledge Base tab in the Admin shell: they upload documents (PDF, DOCX, Markdown, TXT), which are chunked, embedded, and indexed into the knowledge_base (schema.md), with an indexing status shown per document. The assistant answers only from this curated, versioned source, so the knowledge base is the lever admins use to control what it can cite. Available to Admin only.

## Non-Functional Requirements

NFR-1 (Must). Single-application verification (one model call carrying all of its faces) meets the latency budget defined in constraints.md (target p95 under five seconds end to end). This is the hard acceptance bar that sank the prior vendor.

NFR-2 (Must). The interface meets WCAG 2.1 AA: large touch and click targets, full keyboard navigation, status never conveyed by color alone, and readable type sizing. Driven by a low-tech-comfort user base (assumption A28).

NFR-3 (Must). The system stays within the cost ceiling in constraints.md by making one model call per application and gating access to prevent unattended spend (see NFR-8).

NFR-4 (Must). No applicant PII is persisted. Images and extracted values are processed in memory and not written to durable storage (assumption A8).

NFR-5 (Should). Availability is business-hours best-effort. No high-availability target applies to the prototype (see constraints: Team Constraints).

NFR-6 (Must). The codebase separates extraction, matching, and presentation, places the vision model behind a swappable interface, keeps rules in configuration, and has automated tests on the matching logic (see constraints: Maintainability).

NFR-7 (Should). The system absorbs a burst of up to roughly 300 labels through bounded parallelism without degrading latency for concurrent single-label users (see constraints: Scale and Load Profile).

NFR-8 (Should). Prototype security is limited to a shared access gate whose purpose is spend protection, not real security. Production identity needs (PIV/CAC, SSO, role-based access, audit logging within a FedRAMP boundary) are documented as out of scope (assumptions A7, A21).

NFR-9 (Must). The application runs locally with documented setup and deploys to a single host, so the reviewer can both run and access it (deliverable requirement from the brief).

NFR-10 (Could). The interface functions on the browsers a government office is likely to run, which may be older than current consumer defaults. Treated as a Could because the target environment is unconfirmed.

NFR-11 (Should). Both AI components, label verification and the chat assistant, are observable and evaluable per observability.md: traces with applicant PII redacted, offline evaluation against a golden set, the agent-correction feedback loop as ground truth, online drift monitoring, and guardrail evals (including zero role-scope leakage for the assistant and a measured false-negative rate on real mismatches for verification). The tooling is self-hostable and OpenTelemetry-based so it runs in-boundary in production; the prototype runs a lightweight version.

## Acceptance Criteria

These are concrete, testable checks. The test set combines real approved pairs from the Public COLA Registry for the passing cases and synthesized defects for the failing cases (assumptions A24, A25, A26).

AC-1. A known-good registry pair (form and label that genuinely agree) returns the high-confidence-match lane with no field flagged. Proves the tool does not cry wolf.

AC-2. A label whose alcohol content differs from the form returns a mismatch with alcohol content identified as the differing field.

AC-3. A label whose government warning uses title case instead of all caps for "GOVERNMENT WARNING:" is flagged as a warning defect.

AC-4. A label with no government warning is flagged for the missing warning.

AC-5. A brand that differs from the form only by case or punctuation ("STONE'S THROW" versus "Stone's Throw") returns a match, not a mismatch.

AC-6. A blank, unreadable, or non-label image returns the "needs a better image" result in the low-confidence lane, not an error.

AC-7. Single-application verification on representative inputs completes within the five-second budget.

AC-8. A batch of roughly 300 applications completes, reports progress while running, and groups results by lane.

AC-9. Every verdict is distinguishable without relying on color, verified by an accessibility check.

AC-10. No verification request writes applicant PII to disk or a database, verified by inspection.

## Out of Scope

Restated briefly for clarity; rationale lives in the referenced docs. Direct integration with COLA (assumption A6). Real authentication and authorization (assumption A7). OCR of scanned paper application forms (assumption A3). Full per-beverage-type rule coverage (assumption A10). Implementation of TTB alcohol-content tolerance tables (assumption A19). A production in-boundary model deployment (assumption A21).

## Open Dependencies

These must be resolved to complete design and build:
- Vision model provider and API key (deferred; needed for FR-4 and NFR-1).
- Ephemeral versus persistent batch state (open architecture decision; affects FR-18 and the data layer).
- The verbatim canonical government warning text (assumption A18; needed to implement FR-11).
