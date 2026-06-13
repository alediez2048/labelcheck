# P6-4 — COLA integration

Wire the production tool to COLAs Online: an ingestion adapter that reads new and assigned applications (form values + label images) from COLAs Online, and a write-back adapter that returns the agent's disposition. COLAs Online remains the system of record and owns all applicant notification — the tool sends no email.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @flowchart.md, @schema.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P6-4: COLA integration.

Current state: (at start)
- [Prototype Phase 0–5 plus P6-1 (in-boundary model), P6-2 (PostgreSQL + audit), and P6-3 (PIV/CAC + RBAC). Intake is currently manual entry or the bundled sample set; dispositions are recorded in the DB but go nowhere.]

What's NOT done yet:
- [P6-4] No ingestion from COLAs Online; no write-back of dispositions. The tool is still standalone.
- [P6-5..P6-7] Correction lifecycle, self-hosted observability, and compliance hardening still to come.

TICKET-P6-4 Goal:
Build the ingestion adapter (form values + label images from COLAs Online into `application` + `label_face` rows + Azure Blob) and the write-back adapter (the agent's `disposition` back to COLAs Online). The exact transport (internal API, message queue, or DB feed) is a production decision to be agreed with the COLA team — define it behind a `ColaIntakeSource` / `ColaWriteBack` interface so the transport can be set by config without disturbing the rest of the system. COLAs Online owns all applicant notification and Public Registry publishing; OUR TOOL SENDS NO EMAIL.

Check @flowchart.md (System Context — the diagram that pins this) and the existing intake path before starting.
Follow flowchart System Context, FR-27, and assumption A6.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste P6-3's real output: SSO live, the `agent` table populated with real identities, row-scope tests green, audit log writing access events.)_

### TICKET-P6-4 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 6h
- Dependencies: P6-2 (the `application`, `label_face`, `disposition`, `intake_batch`, `audit_event` tables)
- Branch: `feat/cola-integration`

### Acceptance criteria

- [ ] Ingestion adapter pulls new and assigned applications from COLAs Online with their form data and label image references, **inside the Azure FedRAMP boundary** (no public-internet hop; A21). For each application it writes one `application` row (status=`received`), one `intake_batch` row when batched, one `label_face` row per face with the image stored in Azure Blob, and an `audit_event(intake)` (schema.md End-to-End Data Flow §1).
- [ ] The transport is **defined behind an interface** (`ColaIntakeSource`) with concrete implementations the team can swap by config once the integration mechanism is agreed with the COLA team. The candidate transports — internal API, message queue, or DB/event feed — all share the same adapter shape (flowchart System Context).
- [ ] Write-back adapter returns each agent disposition (approve, return_for_correction, auto_reject) to COLAs Online with the structured `disposition.return_reason` (FR-26a) when applicable. Confirms write-back success or fails the disposition transaction (i.e. a write-back failure does not silently drop the result).
- [ ] **The tool sends NO email and publishes NOTHING.** COLAs Online owns: applicant status emails (Approved, Needs Correction with the 30-day clock, Rejected), the COLA download link, and Public Registry publication on approval (flowchart.md System Context). The tool's responsibility ends at the write-back call.
- [ ] Ingestion writes `audit_event(intake)`; write-back writes `audit_event(disposition)` linked to the same `application_id`.
- [ ] Idempotency: ingesting the same COLA application twice does not create duplicates; the COLA TTB ID is the natural key (`application.ttb_id` UNIQUE — schema.md).
- [ ] Image bytes pulled from the COLAs Online document store land in agency Blob storage **by reference** with checksum (schema.md). The database stores the storage key, not the bytes.
- [ ] An integration test against a `ColaIntakeSource` / `ColaWriteBack` **stub** runs end-to-end: ingest 5 applications, verify them, record dispositions, confirm write-back calls fired with the right payloads.

### Implementation details

1. Define the interfaces in `lib/cola/types.ts`:
   - `ColaIntakeSource.pollNewAssignments(): Promise<ColaIncomingApplication[]>`
   - `ColaIntakeSource.fetchFaceImage(faceRef): Promise<{ bytes, contentType }>`
   - `ColaWriteBack.submitDisposition(ttbId, decision, returnReason?, note?): Promise<{ ok: true, receivedAt }>`
   - `ColaIncomingApplication` carries `ttbId`, `beverageType`, `source`, all form fields, and a list of face refs (face_type + opaque ref to fetch).
2. Implement three concrete `ColaIntakeSource` stubs, each behind a config selector:
   - `internal-api.ts` — HTTPS GET against an internal endpoint exposed by COLAs Online; mTLS or service-to-service token.
   - `message-queue.ts` — consumer for an Azure Service Bus / Event Hub / equivalent topic that COLAs Online publishes new assignments to.
   - `db-feed.ts` — read-only access to a COLAs-Online-exposed view or replication slot.
   - **None of these are committed as production wiring yet** — the actual mechanism is "TBD with the COLA team" (flowchart System Context). Ship them as documented adapters so the production decision is a config flip, not a refactor.
3. Implement `cola-writeback-internal-api.ts` and `cola-writeback-message-queue.ts` for the write-back side. Same "TBD" caveat applies.
4. Create `lib/cola/ingest.ts` — the orchestrator:
   - Calls `pollNewAssignments()` (or subscribes, depending on transport).
   - For each application: dedupe by `ttb_id`, write `application`, fetch each face image, upload to Blob, write `label_face`, write `audit_event(intake)`. Group into `intake_batch` when the source signals a batch.
   - Hand the application to the existing verification pipeline (P6-2 wired) once images are in place.
5. Create `lib/cola/writeback.ts` — called from the disposition transaction in `app/api/applications/:id/dispose` (extending P1-8 / P6-2 wiring):
   - Inside the same DB transaction that writes the `disposition` row, post the disposition to `ColaWriteBack`. If the write-back fails, **roll back the disposition** — the human is informed and re-tries. The audit_event records the attempt either way.
6. Define the `ColaIncomingApplication` validation in `lib/cola/schema.ts` (zod) so a malformed incoming application is rejected at the boundary, not deep in matching.
7. Create the integration test stubs in `tests/cola/stub.ts` (an in-memory implementation of both interfaces, used by the integration test).

### Key constraints

1. The model reads, the code decides — D4. (Unchanged.)
2. p95 under 5s for verification — NFR-1. The COLA fetch is an **ingestion** step, off the verify-endpoint's critical path; verify still runs in under 5s once the row is in place.
3. TypeScript strict, no `any`.
4. **Production-specific: in-boundary.** All COLA transport stays inside the Azure FedRAMP boundary — no public-internet hop (A21).
5. **The tool sends no email and publishes nothing.** COLAs Online owns applicant notification and Public Registry publishing (flowchart System Context). Any "send email" code in this ticket is a finding.
6. **Idempotency by TTB ID.** Re-ingesting the same application must not duplicate rows; `application.ttb_id` is UNIQUE (schema.md).
7. **Write-back is part of the disposition transaction.** A disposition is not "committed" from the agent's POV until COLAs Online has acknowledged it.

### Files to modify

Primary: `app/api/applications/[id]/dispose/route.ts` — wrap the existing `disposition.insert` in a transaction that also calls `ColaWriteBack.submitDisposition`. On write-back failure, roll back.

Also: `app/api/health/route.ts` — add a check that the configured `ColaIntakeSource` and `ColaWriteBack` are reachable.

### Files to create

1. `lib/cola/types.ts` — `ColaIntakeSource`, `ColaWriteBack`, `ColaIncomingApplication` types.
2. `lib/cola/sources/internal-api.ts` — HTTPS pull stub.
3. `lib/cola/sources/message-queue.ts` — queue consumer stub.
4. `lib/cola/sources/db-feed.ts` — DB feed stub.
5. `lib/cola/writeback/internal-api.ts` — HTTPS write-back stub.
6. `lib/cola/writeback/message-queue.ts` — queue producer write-back stub.
7. `lib/cola/ingest.ts` — orchestrator that calls source → DB + Blob + audit + verification.
8. `lib/cola/writeback.ts` — dispatcher for the disposition path.
9. `lib/cola/schema.ts` — zod for incoming applications.
10. `tests/cola/stub.ts` — in-memory `ColaIntakeSource` + `ColaWriteBack`.
11. `tests/cola/ingest.test.ts` — end-to-end test against the stub.

### Config / schema / store updates

Env additions:
- `COLA_INTAKE_TRANSPORT=internal-api|message-queue|db-feed|stub`
- `COLA_WRITEBACK_TRANSPORT=internal-api|message-queue|stub`
- Per-transport endpoints / queue names / connection strings.

Schema: none. `application`, `intake_batch`, `label_face`, `disposition`, `audit_event` from schema.md already cover this.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm test:integration   # ingest 5 apps through the stub → verify → dispose → write-back called
```

Manual:
- [ ] **Integration test with COLAs Online stub:** start the app with `COLA_INTAKE_TRANSPORT=stub` and `COLA_WRITEBACK_TRANSPORT=stub`; the stub yields 5 fake applications with face images, the system ingests, verifies, an agent disposes one, and the stub records the write-back payload. Assert the payload matches the FR-26a structured `return_reason`.
- [ ] Re-ingesting the same TTB ID does not create duplicate `application` rows (idempotency).
- [ ] A write-back failure (stub configured to throw) rolls back the disposition; the agent sees a clear retry message; no orphan disposition row.
- [ ] No outbound email from the tool under any path — grep for any mail library imports must come back empty (or only in tests).
- [ ] `audit_event(intake)` and `audit_event(disposition)` rows are written for each round trip.

Eval: re-run the P5-2 golden set; COLA ingestion is upstream of verification, so the golden numbers should be unchanged.

Update docs: mark P6-4 done in TICKETS.md; add a DEV-LOG entry recording which transport the COLA team agreed on (TBD at time of writing).

### Reference

- flowchart.md — System Context (the integration model this ticket realizes; the "no email" rule).
- requirements.md — FR-27 (correction lifecycle write-back), FR-26a (structured return reason).
- schema.md — `application`, `intake_batch`, `label_face`, `disposition`, `audit_event`, `application.ttb_id` UNIQUE.
- assumptions.md — A6 (COLA integration is a production concern, not the prototype).
- systemsdesign.md — Production Evolution Path.

### Common gotchas

1. **The ingestion adapter reads form values + label images from COLAs Online; the write-back adapter returns dispositions.** The exact mechanism — internal API, message queue, or DB/event feed — is TBD with the COLA team (flowchart System Context); TTB does not publish it. Ship all three behind a `ColaIntakeSource` / `ColaWriteBack` interface so the production wiring is a config flip, not a refactor.
2. **The tool sends NO email.** COLAs Online owns applicant notification: status emails (Approved, Needs Correction with the 30-day clock, Rejected), the COLA download link on approval, and Public Registry publication. Any `nodemailer` / SendGrid / SES import in this ticket is a bug. The flowchart System Context is explicit (flowchart.md).
3. **Idempotency by `application.ttb_id` UNIQUE.** Re-ingest must be safe — message-queue redeliveries and pull-loops are normal. Wrap the ingest in an `ON CONFLICT (ttb_id) DO NOTHING` (or equivalent) so a duplicate is a no-op, not a 500.
4. **Write-back is part of the disposition transaction.** If COLAs Online does not acknowledge, the disposition does not commit — the agent retries. A silent drop here is a regulatory accountability failure; the human owns the disposition, the system must make sure COLA owns the disposition record before reporting "saved" to the agent.

### Definition of Done

Code complete when:
- [ ] `ColaIntakeSource` and `ColaWriteBack` interfaces defined; three intake transports and two write-back transports stubbed behind config; the stub implementation runs the integration test green.
- [ ] Ingest orchestrator writes `application`, `label_face`, `audit_event(intake)`, uploads images to Blob; idempotent by `ttb_id`.
- [ ] Dispose endpoint writes the disposition and calls write-back inside one transaction; rollback on write-back failure.
- [ ] No email-sending code anywhere in the tool.
- [ ] No `any`; no console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, integration with the COLA stub).
- [ ] TICKETS.md and DEV-LOG updated; TBD-with-COLA-team note recorded.
- [ ] Committed to `feat/cola-integration`, pushed, merged to main.

### Expected output

In production, applications arrive automatically from COLAs Online with their form data and label images, land in PostgreSQL + Azure Blob, and the verification pipeline runs on them. The agent's disposition flows back to COLAs Online inside the same transaction. COLAs Online emails the applicant and publishes approved COLAs to the Public Registry. The tool sends no email.

### Dependencies to install

```
pnpm add @azure/service-bus       # message-queue transport (if Azure Service Bus is the chosen mechanism)
pnpm add undici                   # internal-api transport HTTP client (if not already pulled by P6-1)
pnpm add zod                      # ColaIncomingApplication validation (likely already present)
```
