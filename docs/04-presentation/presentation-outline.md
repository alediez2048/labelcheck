# Presentation Outline: AI-Powered Alcohol Label Verification

Status: outline for review (precedes the .pptx build)
Audience: evaluation / hiring reviewers
Length: concise, ~14 slides plus optional appendix
Goal: a balanced problem-to-solution story that shows the thinking, the trade-offs, and the decisions

Narrative arc: Problem → Discovery → Reframe → Solution → How it works → Agent experience → Process and integration → Architecture → Data → Constraints and requirements → Key decisions → Business case → Scope and roadmap → Close. Detail lives in the source docs; the deck carries the story.

---

## Slide 1 — Title

Goal: set the frame.
- Title: AI-Powered Alcohol Label Verification
- Subtitle: Verifying that a label matches its application, in seconds, at TTB scale
- Candidate name, date, "Approach and Design"
- Visual: clean title; a single label-with-checkmark motif.

## Slide 2 — The Problem

Goal: state the pain in numbers.
- TTB reviews about 150,000 COLA applications a year with 47 agents.
- Verification is manual: an agent eyeballs the label artwork against the typed application, field by field.
- Roughly half an agent's day is routine matching, not judgment.
- The prior scanning vendor failed because it took 30 to 40 seconds per label.
- Visual: the 150,000 / 47 ratio, big and stark.

## Slide 3 — Discovery: What the Stakeholders Told Us

Goal: show the solution is grounded in the interviews, not assumptions.
- Sarah (Deputy Director): under ~5 seconds or agents abandon it; batch uploads matter at peak season.
- Marcus (IT): standalone proof-of-concept, no COLA integration; the firewall blocks external ML endpoints.
- Dave (28-yr agent): judgment is real, "STONE'S THROW" vs "Stone's Throw" is the same product.
- Jenny (junior agent): the government warning must be exact, caps and bold; photos are often imperfect.
- Visual: four quote chips, one per stakeholder.

## Slide 4 — The Reframe: Remove the Grind, Not the Decision

Goal: the key product insight.
- Today, verification and approval are fused; the pain is the verification grind.
- The tool takes over the routine matching and triages every application by confidence.
- The agent's effort shifts from checking every match to resolving the exceptions.
- The human still owns the decision; the agency keeps legal accountability.
- Visual: before/after of an agent's day.

## Slide 5 — Solution Overview: The Three-Lane Review Model

Goal: the heart of the product in one picture.
- Auto-verify on intake; every application arrives already tagged.
- High-confidence match (clear it / bulk-confirm), clear mismatch (flagged with the field), low-confidence or ambiguous (sent to a human).
- The agent works a pre-sorted queue: bulk-approve the clean ones, step through the rest.
- Visual: the three-lane triage diagram.

## Slide 6 — How It Works: The Model Reads, the Code Decides

Goal: show the engineering judgment.
- The vision model only transcribes the label text; all matching and lane logic live in code (testable, tunable).
- Per-field rules: brand and type fuzzy, ABV and net contents normalized-exact, the government warning exact.
- Confidence is computed in code (match margin plus legibility), not the model's self-reported number.
- The government warning is the hardest check: presence, verbatim wording, all-caps strict; bold is best-effort and routes uncertainty to a human.
- Visual: the triage/warning sub-check flowchart.

## Slide 7 — The Agent Experience

Goal: make the UX concrete.
- One worklist, like a smart inbox: "18 today, 13 clean and ready, 5 need your review."
- Bulk-confirm the matches in one click; auto-advance through the flagged ones.
- Dispositions match the real process: Approve, Return for correction (30-day window), Reject.
- Accessibility is first-class: status is color plus icon plus text, large targets (the 73-year-old benchmark).
- Visual: queue and review-detail mockup screenshots.

## Slide 8 — How It Fits the TTB Process

Goal: provenance and destinations, the system context.
- Applications come from COLAs Online (the system of record); our tool reads them in-boundary.
- The agent's disposition is written back to COLAs Online.
- COLAs Online owns all applicant notification and Public Registry publishing; our tool sends no email.
- The Needs-Correction 30-day lifecycle and resubmission priority are the real flow.
- Visual: the system-context data-flow diagram (sources in, decisions out).

## Slide 9 — Architecture and Tech Stack

Goal: show appropriate, boring-on-purpose choices.
- One always-warm container; extraction, matching, and triage as separate modules; the vision model behind a swappable adapter.
- TypeScript end-to-end (Next.js), Claude Sonnet 4.6 default (swappable), a mock adapter for offline dev and tests.
- Optimized for the real load profile: low sustained throughput, bursty batches, a hard 5-second latency budget.
- Visual: a simple component diagram.

## Slide 10 — Data Architecture

Goal: show the production thinking and the honest prototype line.
- The prototype persists nothing (PII, IT's instruction); this is the production data model.
- PostgreSQL with JSONB, images in object storage, append-only disposition and audit tables for regulatory accountability.
- Supports the queue, history, dispositions, the correction lifecycle, analytics, and team views.
- Visual: a trimmed ER diagram (application at the center).

## Slide 11 — Constraints and Requirements

Goal: show the box we built within.
- Hard constraints: 5-second latency, accessibility (WCAG AA), in-boundary model for production (firewall), no PII persistence.
- Requirements captured as functional, non-functional, and testable acceptance criteria (AC-1 through AC-10).
- Test strategy: real approved pairs from the Public COLA Registry for passes, synthesized defects for fails.
- Visual: constraints as four icons; a few sample acceptance criteria.

## Slide 12 — Key Design Decisions

Goal: the rigor highlight; this is what reviewers want.
- The model reads, the code decides (and confidence is code-derived).
- Full-resolution images, no downscaling, to protect the tiny warning text.
- Single vision provider behind an adapter; no persistence in the prototype; in-boundary model for production.
- Each decision is a real trade-off, recorded as an ADR.
- Visual: a decisions table (decision, why, trade-off).

## Slide 13 — The Business Case

Goal: it pays for itself many times over.
- Operating cost is trivial: about $3,800/year at full national volume on the default model.
- Labor saved is large: roughly $690,000 to $960,000/year, about seven agents' worth of capacity freed.
- Operating cost is well under one percent of the benefit; the return is dominated by reclaimed agent time.
- Caveat honestly: realized savings depend on adoption, accuracy, and the agency's auto-clear policy.
- Visual: cost-vs-savings bar, wildly asymmetric.

## Slide 14 — Scope, Assumptions, and Roadmap

Goal: honest boundaries and a credible path forward.
- Prototype scope: a standalone proof-of-concept, no COLA integration, no auth, nothing stored.
- Key assumptions flagged (digital intake, beverage-type coverage, ABV exact-match simplification).
- Production path: in-boundary model, COLA ingestion and write-back adapters, real auth and audit, a governed datastore, all isolated to known seams.
- Visual: now / next / later.

## Slide 15 — Close

Goal: land it.
- One sentence: a second set of eyes that does the boring matching in seconds so agents focus on judgment.
- What gets built first: the core single-application verify flow, then batch and bad-image handling.
- Visual: the one-line value statement.

---

## Optional Appendix (backup slides, not presented)

- A1: Full requirements list (functional, non-functional, acceptance criteria).
- A2: Full schema ER diagram and table catalog.
- A3: Cost model tables (per-application and projections across models).
- A4: Complete assumptions register with confidence tags.
- A5: The full lifecycle and disposition flowcharts.

## Notes for the Build

- One idea per slide; the source docs carry the detail.
- Reuse the existing diagrams: three-lane triage, lifecycle, system context, ER.
- Pull real numbers from business.md and constraints.md so the deck and docs never disagree.
- Keep the visual language consistent with the mockup (the lane colors, color-plus-icon-plus-text).
