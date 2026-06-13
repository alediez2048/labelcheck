# P6-5 — Correction lifecycle

Implement the Needs-Correction lifecycle: a 30-day window opened by every Return-for-correction disposition, a scheduled job that auto-rejects on lapse, and a resubmission model where a corrected application is a NEW `application` linked to its parent via `parent_application_id` and re-verifies end-to-end.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @flowchart.md, @schema.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P6-5: Correction lifecycle.

Current state: (at start)
- [Prototype Phase 0–5 plus P6-1 (in-boundary model), P6-2 (PostgreSQL + audit), P6-3 (PIV/CAC + RBAC), and P6-4 (COLA ingest + write-back). Return-for-correction dispositions write the row and call write-back, but nothing closes the 30-day loop and resubmissions have no priority handling.]

What's NOT done yet:
- [P6-5] No correction_cycle rows are opened, no auto-reject job exists, no parent_application_id linking on resubmissions.
- [P6-6, P6-7] Self-hosted observability and compliance hardening still to come.

TICKET-P6-5 Goal:
On every Return-for-correction disposition, open a `correction_cycle` row with `due_at = returned_at + 30 days` and write `audit_event(intake)`-style trail. Run a scheduled job that finds correction_cycles past `due_at` in state=`pending` and writes a system disposition (`decision=auto_reject`, `agent_id=null`) plus `audit_event(auto_rejected)`. On COLAs-Online ingest of a corrected resubmission, create a NEW `application` row linked via `parent_application_id`, re-verify end-to-end (no per-face caching), set the resubmission's queue priority from its parent's `correction_cycle`.

Check @schema.md correction_cycle and @flowchart.md sections 1 and 5 before starting.
Follow FR-27, CONTEXT.md Resubmission, and the flowchart "Needs Correction" branch.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste P6-4's real output: COLA ingest + write-back wired, dispositions transactional with write-back, the agreed COLA transport, stub-based integration test green.)_

### TICKET-P6-5 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 3h
- Dependencies: P6-2 (the `correction_cycle`, `disposition`, `application`, `audit_event` tables), P6-4 (COLA ingest knows when a resubmission arrives)
- Branch: `feat/correction-cycle`

### Acceptance criteria

- [ ] A `return_for_correction` disposition transactionally opens a `correction_cycle` row with `application_id = the returned application`, `returned_at = now`, `due_at = returned_at + 30 days`, `reason = disposition.return_reason` (FR-26a summary), `state = pending` (schema.md correction_cycle).
- [ ] A scheduled job (`pnpm job:auto-reject-lapsed`) runs daily and, for every `correction_cycle` with `state = pending` and `due_at < now`:
  - Writes a `disposition` row with `decision = auto_reject` and `agent_id = NULL` (system-generated; schema.md disposition note).
  - Updates the cycle's `state = auto_rejected`.
  - Writes `audit_event(auto_rejected)` with the cycle id and the parent application id.
  - Calls `ColaWriteBack.submitDisposition(ttbId, 'auto_reject', …)` so COLAs Online learns the outcome and notifies the applicant (the tool itself sends no email — flowchart).
- [ ] **A resubmission is a NEW `application` row** (not a state mutation on the parent). It is linked to its parent via `parent_application_id`. Verification re-runs end-to-end on all faces and the form — no per-face caching, no reuse of the parent's `field_result` rows (CONTEXT.md Resubmission).
- [ ] The resubmission inherits queue priority from its parent's `correction_cycle` — when the work router (P2-3) sorts the shared pool, resubmissions linked to an open cycle land ahead of new applications (FR-27, flowchart Lifecycle).
- [ ] On a resubmission ingest, the parent's `correction_cycle.resubmitted_application_id` is set and the cycle's `state` flips to `resubmitted`.
- [ ] An application whose cycle has been `auto_rejected` cannot receive a late resubmission — late corrections force the applicant to submit a brand-new application with no priority (flowchart §1 final branch).
- [ ] The scheduled job is **idempotent** (running it twice on the same day produces no duplicate auto-rejects).

### Implementation details

1. Extend the dispose endpoint (P6-4) so the `return_for_correction` branch, inside the same transaction that writes the `disposition` row and calls write-back, also inserts the `correction_cycle` row. `due_at = returned_at + interval '30 days'` (clock comes from Postgres `now()` for consistency).
2. Create `lib/jobs/auto-reject-lapsed.ts`:
   ```
   for each correction_cycle where state='pending' and due_at < now:
     begin txn:
       insert disposition(application_id, agent_id=NULL, decision='auto_reject', ...)
       update correction_cycle set state='auto_rejected' where id = cycle.id
       insert audit_event(event_type='auto_rejected', ...)
       call ColaWriteBack.submitDisposition(...)
     commit
   ```
3. Add `pnpm job:auto-reject-lapsed` script. In production, schedule via the chosen runner (Azure Container Apps Jobs, cron in the long-running container, or a scheduled Kubernetes Job — pick whichever the deployment uses; document in DEV-LOG).
4. Extend the COLA ingest (P6-4) so that an incoming application with a `parent_ttb_id` (or whatever COLA's resubmission link is called) is recognized as a resubmission:
   - Look up the parent application by `ttb_id`.
   - Verify the parent has an open `correction_cycle` (state=`pending`, `due_at >= now`).
   - Create the new `application` row with `parent_application_id = parent.id`.
   - Update the parent cycle: `resubmitted_application_id = new.id`, `state = 'resubmitted'`.
   - Trigger the verification pipeline as normal.
5. Update the work router (P2-3) priority sort: resubmissions linked to an open (now `resubmitted`) cycle sort ahead of new applications of the same lane.
6. Add a guard in the ingest: if `state = 'auto_rejected'`, the incoming submission is **not** a resubmission of that parent — it must be ingested as a brand-new application (no priority, no parent link). Log a clear note.
7. Write the integration test in `tests/correction-cycle/lifecycle.test.ts`:
   - Disposition → open cycle (assert due_at).
   - Fast-forward clock 31 days, run job → auto_reject + write-back called.
   - Job idempotency: run the job again → no new rows.
   - Resubmission within 30 days → new application linked, parent cycle updated, queue priority test.

### Key constraints

1. The model reads, the code decides — D4. The verification re-runs on a resubmission; the model produces fresh transcriptions.
2. p95 under 5s for verification — NFR-1. The resubmission re-verifies just like a fresh ingest.
3. TypeScript strict, no `any`.
4. **Production-specific: the auto-reject is system-generated.** `disposition.decision = 'auto_reject'`, `agent_id = NULL` (schema.md). The audit_event captures the lapse. The tool sends no email; COLA notifies the applicant (flowchart).
5. **Resubmission is a new application.** Verification re-runs end-to-end (CONTEXT.md Resubmission). Reusing the parent's `field_result` rows is wrong — the applicant uploaded new images.
6. **Queue priority comes from the cycle.** The router reads the link, not a flag mirrored onto `application` (avoid denormalization that can drift).
7. **The 30-day window is stored on `correction_cycle.due_at`**, not computed lazily on read. The job queries by `due_at`, an indexed column.

### Files to modify

Primary: `app/api/applications/[id]/dispose/route.ts` (P6-4 wiring) — in the `return_for_correction` branch, also insert the `correction_cycle` inside the same transaction.

Also: `lib/cola/ingest.ts` (P6-4) — recognize resubmissions; create new application with `parent_application_id`; update parent cycle.

Also: the work router (P2-3) priority sort — resubmissions linked to open cycles sort ahead.

### Files to create

1. `lib/jobs/auto-reject-lapsed.ts` — the scheduled job logic.
2. `scripts/run-auto-reject-lapsed.ts` — the CLI entry the scheduler invokes.
3. `lib/db/repositories/correctionCycleRepo.ts` (extend, since P6-2 created the file) — `openOnDispose`, `findLapsed`, `markAutoRejected`, `markResubmitted`.
4. `tests/correction-cycle/lifecycle.test.ts` — end-to-end test (disposition → cycle → 31-day clock → auto-reject; in-window resubmission → new app linked; idempotency).
5. `tests/correction-cycle/router-priority.test.ts` — the work router puts resubmissions ahead of new applications of the same lane.

### Config / schema / store updates

No schema additions — `correction_cycle` is defined in schema.md and migrated by P6-2.

Env additions:
- `JOB_SCHEDULER=container-jobs|cron|k8s-job` — documents which runner the deployment uses; the script entry is the same.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm test:integration                   # lifecycle, router priority
pnpm job:auto-reject-lapsed -- --dry    # dry-run logs what it would do
```

Manual:
- [ ] A `return_for_correction` disposition transactionally creates the `correction_cycle` row with `due_at = returned_at + 30 days`.
- [ ] Fast-forwarding the DB clock (or seeding a cycle with `due_at` in the past) and running the job produces exactly one `auto_reject` disposition and one `audit_event(auto_rejected)`, and the write-back stub is called.
- [ ] Running the job a second time on the same data produces no new rows (idempotent).
- [ ] An ingest with a resubmission link creates a NEW `application` row, sets `parent_application_id`, updates the parent cycle to `resubmitted`, and the verification pipeline re-runs end-to-end on the new faces.
- [ ] The work router places the resubmission ahead of new applications of the same lane.
- [ ] An ingest claiming to be a resubmission of an already `auto_rejected` cycle is logged and ingested as a brand-new application instead.

Eval: re-run P5-2 golden set; lifecycle changes do not touch the verification path itself, so numbers should be unchanged. Add a small unit-test golden for the auto-reject job.

Update docs: mark P6-5 done in TICKETS.md; add a DEV-LOG entry recording the scheduler runner the deployment uses.

### Reference

- requirements.md — FR-27 (correction lifecycle).
- flowchart.md — sections 1 and 5 (the lifecycle and the auto-reject branch).
- schema.md — `correction_cycle`, `disposition.decision` includes `auto_reject` (system-generated, agent_id null).
- CONTEXT.md — Resubmission (a new Application linked via parent_application_id; verification re-runs end-to-end).
- systemsdesign.md — D15 (work pool priority).

### Common gotchas

1. **The 30-day window is stored on `correction_cycle.due_at`** — computed once at return time, indexed for the job's query. Do not compute it lazily on read (clock skew + DST) and do not denormalize it onto `application` (drift). The scheduled job auto-rejects on lapse by writing `disposition(decision='auto_reject', agent_id=NULL)` plus an `audit_event(auto_rejected)`. The tool calls COLA write-back; COLAs Online emails the applicant.
2. **A resubmission is a NEW `application`** linked to its parent via `parent_application_id`. Verification re-verifies end-to-end on all faces and the form — **no per-face caching, no reuse of the parent's `field_result`**. The applicant uploaded new images; the prior reads do not apply (CONTEXT.md Resubmission).
3. **`disposition.agent_id` is NULL for auto-rejects** because no agent decided (schema.md). Foreign-key constraints must allow NULL on this column. A non-null `agent_id` for an auto-reject row is wrong and breaks the "who decided" audit chain.
4. **The auto-reject job must be idempotent.** A second run within the same day must produce no new rows. Filter strictly by `state = 'pending'` (not by date alone); the state flip is what closes the loop. Lock the cycle row (`SELECT ... FOR UPDATE`) inside the txn to defend against concurrent runs.

### Definition of Done

Code complete when:
- [ ] Return-for-correction opens a `correction_cycle` row inside the disposition transaction.
- [ ] The auto-reject job runs idempotently; writes the system disposition, the audit event, and the COLA write-back.
- [ ] COLA ingest recognizes a resubmission, creates a new `application` with `parent_application_id`, updates the parent cycle to `resubmitted`.
- [ ] The work router sorts resubmissions ahead of new applications of the same lane.
- [ ] No `any`; no console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, integration, manual lifecycle walk).
- [ ] TICKETS.md and DEV-LOG updated (scheduler runner recorded).
- [ ] Committed to `feat/correction-cycle`, pushed, merged to main.

### Expected output

The Needs-Correction loop closes automatically: returns open a 30-day cycle, lapses auto-reject with a system disposition and an audit trail, and resubmissions are new `application` rows linked to their parent with queue priority. COLAs Online handles all applicant notification.

### Dependencies to install

```
# No new runtime deps required — uses pg / drizzle (P6-2), the COLA write-back from P6-4, and the existing zod schemas.
# If the scheduler runs as a long-process cron inside the same container:
pnpm add node-cron
```
