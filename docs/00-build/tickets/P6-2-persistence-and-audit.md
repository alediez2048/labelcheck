# P6-2 — Persistence and audit

Implement the production data architecture from schema.md against a governed PostgreSQL datastore inside the FedRAMP boundary, with object storage for label images, pgvector for the knowledge base, and append-only disposition and audit tables. This is the ticket that reverses the prototype's no-persistence rule (NFR-4) with governance.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @schema.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P6-2: Persistence and audit.

Current state: (at start)
- [Prototype Phase 0–5 complete. The system has held nothing durably: applications, verifications, dispositions, and batch state were all in-memory or session-scoped (NFR-4, D2). P6-1 has put an in-boundary model behind the adapter.]

What's NOT done yet:
- [P6-2] No relational store, no object storage for images, no append-only audit, no rule_config table, no metric_rollup, no knowledge_base.
- [P6-3..P6-7] Auth, COLA integration, correction lifecycle, self-hosted observability, and compliance hardening all depend on this datastore existing.

TICKET-P6-2 Goal:
Stand up the production data architecture from schema.md: PostgreSQL inside Azure FedRAMP (Azure Database for PostgreSQL), JSONB columns for per-beverage-type form_extra and the model's raw extraction, Azure Blob for label images (the database stores the reference + checksum, never the bytes), and pgvector for knowledge_base chunks. Disposition and audit_event tables are append-only — the application database role gets no UPDATE/DELETE on them. All eleven tables from schema.md migrate cleanly; the verification, matching, and triage code is unchanged behind a persistence seam.

Check @schema.md (read end-to-end — that document IS the spec for this ticket). Don't drift from the column names, types, or relationships there.
Follow systemsdesign Production Evolution Path and the schema.md PII/Retention/Append-only rules.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste P6-1's real output: provider adapter selection, bake-off result, production model default, and confirmation that the prototype's stateless behaviour still runs.)_

### TICKET-P6-2 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 6h
- Dependencies: P1-7 (result API shape), P6-1 (in-boundary model so a real verification can write a real row)
- Branch: `feat/persistence`

### Acceptance criteria

- [ ] PostgreSQL connection from the app to Azure Database for PostgreSQL inside the FedRAMP boundary (in production); local dev runs against a Docker Postgres for parity (techstack alignment).
- [ ] All eleven tables from schema.md migrated: `agent`, `application`, `label_face`, `verification`, `field_result`, `disposition`, `correction_cycle`, `intake_batch`, `rule_config`, `audit_event`, `metric_rollup`, `knowledge_base`. Column names, types, FKs, and enums match schema.md exactly (FR-13, FR-14, FR-26, FR-27, FR-28, FR-29, FR-31; NFR-4 production reversal).
- [ ] `application.form_extra` is JSONB (per-beverage-type fields without column explosion).
- [ ] `verification.raw_extraction` is JSONB (the model's text-only per-face transcription, D4).
- [ ] `label_face.image_uri` references Azure Blob; the database stores the storage key and `checksum`, never the image bytes (schema.md Technology Choice).
- [ ] `knowledge_base.embedding` is `vector` (pgvector); extension enabled in the migration.
- [ ] **Append-only enforcement:** the application's database role has `INSERT, SELECT` on `disposition` and `audit_event` and **no UPDATE, no DELETE**. A migration test asserts this (schema.md Append-only audit). A separate admin role exists for the rare corrective action and is itself audited.
- [ ] Indexes per schema.md: unique on `application.ttb_id`; composite on `(assigned_agent_id, status)`, `(status, submitted_at)`, `(lane)`; `(verification_id)` and `(field_name, verdict)` on `field_result`; `(application_id, is_current)` on `verification`.
- [ ] The verification pipeline (P1-7) now writes one `application` (when ingested), one `verification`, N `field_result` rows, and an `audit_event(verified)` per run — without changing the extraction / matching / triage modules (NFR-6).
- [ ] Reverses prototype NFR-4 with governance — encryption at rest (Azure TDE for PostgreSQL, addressed end-to-end in P6-7), retention TBD per federal records schedule (P6-7), audit_event captures every meaningful action.

### Implementation details

1. Pick the data-access library. Recommended: `pg` plus `drizzle-orm` (typed, migration-friendly) or `kysely` (typed query builder, lighter). Either is fine; the codebase convention is whichever the team uses elsewhere. Document the choice in the DEV-LOG.
2. Write migrations in `db/migrations/` numbered sequentially:
   - `0001_extensions.sql` — `CREATE EXTENSION IF NOT EXISTS vector;` `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
   - `0002_agent.sql` — `agent` table with the role / availability / specialization enums per schema.md.
   - `0003_application.sql` — `application` table; FK to `agent` and `intake_batch`; JSONB `form_extra`; the `parent_application_id` self-FK; enums for `beverage_type`, `source`, `status`, `lane`.
   - `0004_label_face.sql` — `label_face`; FK to `application`; `image_uri`, `content_type`, `checksum`.
   - `0005_verification.sql` — `verification`; FK to `application`; JSONB `raw_extraction`; `is_current` boolean.
   - `0006_field_result.sql` — `field_result`; FK to `verification`; enum `verdict`.
   - `0007_disposition.sql` — `disposition`; FK to `application` and `agent` (nullable for `auto_reject`); JSONB `return_reason`; enum `decision` includes `auto_reject`.
   - `0008_correction_cycle.sql` — `correction_cycle`; FKs to `application` and `resubmitted_application_id`.
   - `0009_intake_batch.sql`, `0010_rule_config.sql`, `0011_audit_event.sql`, `0012_metric_rollup.sql`, `0013_knowledge_base.sql`.
   - `0014_indexes.sql` — every index listed in schema.md Indexing for the Load Profile.
   - `0015_append_only_grants.sql` — grant the application role `INSERT, SELECT` on `disposition` and `audit_event` and explicitly **revoke** `UPDATE`, `DELETE`.
3. Create `lib/db/client.ts` — the connection pool, SSL on, configured via env. In production, prefer Azure managed identity / token-based auth over a password.
4. Create `lib/db/repositories/` with one repository per aggregate root: `applicationRepo.ts`, `verificationRepo.ts`, `dispositionRepo.ts`, `auditRepo.ts`, etc. The matching/triage code calls these; it does not write SQL inline (NFR-6).
5. Create `lib/storage/blob.ts` — Azure Blob client (managed identity) for label images. `uploadFace(applicationId, faceType, bytes)` returns `{ image_uri, checksum }`; `getFaceStream(imageUri)` streams bytes back. The database stores only the reference.
6. Wire the verification pipeline (`app/api/verify`) to persist: when a verification runs, write `application` (if new), upload faces to Blob, write `label_face` rows, write `verification`, write each `field_result`, write `audit_event(verified)`. The matching/triage modules remain pure (they take inputs, return outputs; persistence is at the edges).
7. Mark prior verifications `is_current = false` and the new one `is_current = true` (schema.md verification row note).
8. Add a `pnpm db:migrate` script (drizzle-kit or node-pg-migrate) and a `pnpm db:reset` for local dev.

### Key constraints

1. The model reads, the code decides — D4. Persistence does not move that line; `verification.raw_extraction` stores text only, and `field_result.verdict` is code-derived.
2. p95 under 5s for verification — NFR-1. Persistence writes must be small and indexed; the verification + field_result writes happen inside the same request. Profile under load.
3. TypeScript strict, no `any`. Repositories return typed rows.
4. **Production-specific:** PostgreSQL runs **inside the Azure FedRAMP boundary** (Azure Database for PostgreSQL). No public-internet PostgreSQL endpoint. Connections use TLS and prefer managed identity (A21).
5. **Append-only is enforced by the database, not by application code** (schema.md). The application role has no UPDATE/DELETE on `disposition` and `audit_event`. A failing app cannot rewrite history.
6. **PII columns** (`applicant_name`, `producer_name`, `producer_address`, plus label images) are governed by encryption at rest (P6-7), role-based access (P6-3), and the audit log (this ticket). NFR-4 is reversed in production **with governance**, not abandoned.
7. Image bytes go to object storage, not the database (schema.md Technology Choice). The database stores the reference and checksum.

### Files to modify

Primary: `app/api/verify/route.ts` (P1-7) — wrap the existing in-memory result return with persistence calls (`applicationRepo.upsert`, `verificationRepo.insert`, `fieldResultRepo.insertMany`, `auditRepo.insert(verified)`). The verification logic itself does not change.

Also: `package.json` — add `db:migrate`, `db:reset`, `db:generate` scripts.

### Files to create

1. `db/migrations/0001_extensions.sql` through `db/migrations/0015_append_only_grants.sql` — every table, index, and grant from schema.md.
2. `db/schema.ts` (if Drizzle) — typed schema mirror.
3. `lib/db/client.ts` — connection pool with TLS, managed identity in production.
4. `lib/db/repositories/applicationRepo.ts` — `upsert`, `findById`, `findByTtbId`, `listForQueue(role, agentId, filters)`.
5. `lib/db/repositories/verificationRepo.ts` — `insert`, `markPreviousNotCurrent`, `getCurrentForApplication`.
6. `lib/db/repositories/fieldResultRepo.ts` — `insertMany`, `listForVerification`.
7. `lib/db/repositories/dispositionRepo.ts` — `insert` only (no update, no delete; relies on grant).
8. `lib/db/repositories/auditRepo.ts` — `insert` only; helper to redact PII per observability.md.
9. `lib/db/repositories/correctionCycleRepo.ts`, `intakeBatchRepo.ts`, `ruleConfigRepo.ts`, `metricRollupRepo.ts`, `knowledgeBaseRepo.ts` — one per aggregate root.
10. `lib/storage/blob.ts` — Azure Blob upload/get for label faces.
11. `tests/db/migrations.test.ts` — schema migrations apply cleanly on an empty DB.
12. `tests/db/append-only.test.ts` — UPDATE/DELETE on `disposition` and `audit_event` from the application role fail.

### Config / schema / store updates

Env additions:
- `DATABASE_URL` (with `sslmode=require`) or the broken-out `PGHOST`/`PGUSER`/etc.; in production prefer `AZURE_PG_USE_MANAGED_IDENTITY=true`.
- `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER_LABELS`.
- `DB_ROLE_APP` (the application role with no UPDATE/DELETE on `disposition`/`audit_event`) vs `DB_ROLE_ADMIN` (the corrective role; itself audited).

Schema: every table from schema.md, exact column names.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm db:migrate            # apply all migrations against a fresh DB
pnpm test:integration      # repository round-trip tests against a Docker Postgres
```

Manual:
- [ ] **Schema migrations apply cleanly on an empty database**, then rolling them back and forward stays idempotent.
- [ ] From the application role: `UPDATE disposition SET decision='approve' WHERE ...` fails with a permissions error. Same for `DELETE`. Same for `audit_event`.
- [ ] From the application role: `INSERT INTO disposition (...)` succeeds.
- [ ] A verification through `/api/verify` writes one `application`, one `verification`, N `field_result`, N `label_face`, and one `audit_event(verified)`, and the image bytes land in Azure Blob (or local equivalent) — not in the database.
- [ ] `verification.is_current = true` is set on the new row and the previous row for the same application is flipped to `false`.
- [ ] p95 under 5s preserved with persistence enabled.

Eval: re-run the P5-2 golden set with persistence on; assert no behavioural regression.

Update docs: mark P6-2 done in TICKETS.md; add a DEV-LOG entry recording the data-access library choice (Drizzle vs Kysely).

### Reference

- schema.md — the authoritative spec for this ticket (read end-to-end).
- systemsdesign.md — Production Evolution Path; the persistence seam.
- requirements.md — NFR-4 (production reversal with governance), NFR-6 (separation), NFR-8 (audit).
- techstack.md — Azure FedRAMP context.

### Common gotchas

1. **PostgreSQL + JSONB + object storage + pgvector** is the deliberate split: relational integrity for the ACID parts, JSONB for per-beverage-type `form_extra` and the raw model extraction (which would otherwise force a column explosion), object storage for image bytes (their own retention and encryption), and pgvector for knowledge_base chunks (semantic retrieval lives where the data lives, not in a separate vector DB). Do not "simplify" by putting images in BYTEA or moving JSONB into a separate document store — both reverse a deliberate schema decision.
2. **`disposition` and `audit_event` are APPEND-ONLY in production.** The application's database role gets `INSERT, SELECT` and is explicitly **denied** `UPDATE, DELETE`. This is enforced by `GRANT`/`REVOKE` at migration time, not by application code that a future bug could remove. A regulatory system most needs an unalterable trail (schema.md).
3. This ticket **reverses the prototype NFR-4** (no persistence) with governance: encryption at rest (P6-7), RBAC (P6-3), the audit log (this ticket), retention per federal records schedule (P6-7, still TBD per schema.md Open Questions). NFR-4 is not abandoned — it is replaced by a governed regime.
4. PII lives in named columns (`applicant_name`, `producer_name`, `producer_address`) and in `label_face.image_uri`-referenced images. The audit log's `detail` JSONB must redact applicant PII per observability.md; do not paste raw form values into audit detail.

### Definition of Done

Code complete when:
- [ ] All eleven tables (plus extensions and indexes) migrated; `pnpm db:migrate` succeeds against an empty DB.
- [ ] Append-only grants enforced and tested (UPDATE/DELETE on `disposition`/`audit_event` fails from the app role).
- [ ] The verification pipeline writes `application`, `verification`, `field_result`, `label_face`, and `audit_event(verified)` rows per run, with image bytes in Blob.
- [ ] `verification.is_current` flips correctly on re-runs.
- [ ] No `any`; no console errors; p95 under 5s preserved.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, integration, migrations).
- [ ] TICKETS.md and DEV-LOG updated (data-access library choice recorded).
- [ ] Committed to `feat/persistence`, pushed, merged to main.

### Expected output

The system persists applications, label-face references, verifications, per-field results, dispositions, audit events, batches, rule configs, metric rollups, and knowledge-base chunks in PostgreSQL inside the FedRAMP boundary; image bytes go to Azure Blob by reference. Disposition and audit are append-only at the database grant level. The verification, matching, and triage code is unchanged behind the persistence seam.

### Dependencies to install

```
pnpm add pg drizzle-orm
pnpm add -D drizzle-kit
pnpm add @azure/storage-blob @azure/identity
pnpm add pgvector            # pgvector client helper if Drizzle support is needed
```
_(If the team prefers Kysely, swap `drizzle-orm` + `drizzle-kit` for `kysely` + `kysely-codegen` and record the choice in DEV-LOG.)_
