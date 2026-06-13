# P6-7 — Compliance hardening

Bring the production deployment up to the regulatory bar: encryption at rest for every store, retention per the federal records schedule, governance over the named PII columns, and a security review against an explicit checklist.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @schema.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P6-7: Compliance hardening.

Current state: (at start)
- [Prototype Phase 0–5 plus P6-1..P6-6 in production. The in-boundary model is live, persistence + audit are append-only, PIV/CAC + RBAC enforced server-side, COLA ingest + write-back wired, correction lifecycle automated, self-hosted observability running with PII redaction.]

What's NOT done yet:
- [P6-7] Encryption at rest not explicitly verified across every store; retention per the federal records schedule not applied; PII column inventory and governance not documented; security review checklist not run.

TICKET-P6-7 Goal:
Verify and document encryption at rest end-to-end (Azure TDE for PostgreSQL, Azure Storage Service Encryption for Blob, the observability DB), apply retention policies per the federal records schedule (the exact schedule is TBD per schema.md Open Questions — block on stakeholder decision but configure the mechanism), inventory and govern the named PII columns (applicant_name, producer_name, producer_address, label images), and run a security review against an explicit checklist before production sign-off.

Check @schema.md PII / Retention / Security section and the Open Questions before starting.
Follow systemsdesign Security and Privacy Posture (production), schema.md PII rules, observability Privacy and Compliance.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste P6-6's real output: self-hosted observability live, dashboards and alerts wired, agent-correction pipeline feeding the review queue, PII redaction asserted in exported spans.)_

### TICKET-P6-7 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 4h
- Dependencies: P6-2 (persistence), P6-3 (auth + audit)
- Branch: `feat/compliance`

### Acceptance criteria

- [ ] **Encryption at rest** verified and documented for every store:
  - PostgreSQL: Azure TDE on Azure Database for PostgreSQL (the default; verified and recorded).
  - Azure Blob (label images): Storage Service Encryption with customer-managed keys (CMK) where the agency requires CMK.
  - The Langfuse/Phoenix observability DB: same standard — encrypted at rest, in-boundary.
  - Session secrets, OIDC/SAML client secrets, DB passwords, OCR-VL service tokens: stored in Azure Key Vault, retrieved via managed identity (no plaintext in env files).
- [ ] **Retention policy applied** per the federal records schedule (schema.md note: the exact schedule applies per the applicable federal records schedule rather than being deleted ad hoc). Implementation:
  - The retention windows themselves are **configuration**, not code constants. They land in `config/retention.json` so a compliance reviewer can adjust without a deploy.
  - The mechanism — scheduled retention jobs per table that mark records for archive / deletion past their window — is wired and tested with a placeholder window. The **specific window values are blocked on a stakeholder decision** (schema.md Open Questions); the ticket ships with placeholders and a clear TBD note.
  - Object-storage lifecycle rules in Azure Blob handle image retention separately (schema.md: "Image lifecycle rules live in object storage").
  - The `disposition` and `audit_event` tables are **excluded from the retention/deletion job** — they are append-only and the unalterable record (schema.md). Retention for these follows the records schedule as a whole-corpus archive policy, not row-level delete.
- [ ] **PII column inventory** documented in `docs/02-design/pii-inventory.md`:
  - The named PII columns are `application.applicant_name`, `application.producer_name`, `application.producer_address`, and the label images (Blob, referenced via `label_face.image_uri`). The model's `raw_extraction` JSONB may contain transcribed PII and is treated as PII.
  - For each: encryption regime, access regime (RBAC from P6-3), audit regime (the access events from P6-3), and retention regime.
  - The nuance from schema.md is preserved: once a COLA is approved it is public record on the Public COLA Registry, so approved label and brand data is not secret. But applicant contact details, internal review notes, agent dispositions, and raw model extractions remain internal and sensitive.
- [ ] **Security review checklist** run and passed before production sign-off (`docs/00-build/security-review-checklist.md`):
  - [ ] No public-internet egress from production pods (verify with a network-policy or NSG check; A21).
  - [ ] PIV/CAC + SSO is the only production auth path; the role switcher is not reachable.
  - [ ] Row-level access enforced server-side in every repository (P6-3).
  - [ ] `disposition` and `audit_event` are append-only at the DB grant level (P6-2).
  - [ ] PII redaction verified in OTel exports (P6-6).
  - [ ] All secrets in Azure Key Vault; no plaintext in env or repo.
  - [ ] Encryption at rest on every store.
  - [ ] Encryption in transit on every connection (TLS, mTLS where applicable).
  - [ ] Backup and restore tested for PostgreSQL and Blob.
  - [ ] Dependency vulnerabilities at zero high/critical (npm audit / Snyk).
  - [ ] Bake-off bar still met (false-negative rate, p95 latency) — P5-4.
  - [ ] Self-hosted observability still in-boundary (no external SaaS endpoints; P6-6).
- [ ] The retention job and the security review checklist are runnable in CI / on demand (`pnpm job:retention-sweep -- --dry`, `pnpm security:checklist`).

### Implementation details

1. **Inventory the encryption-at-rest configuration** for every store and document it in `docs/02-design/encryption-at-rest.md`. For each store, name the encryption mechanism, the key-management regime (platform-managed vs CMK), and the responsible owner.
2. **Move every secret into Azure Key Vault** (P6-3 and P6-4 introduced env-based secrets; this ticket finishes the migration). The app reads secrets at startup via managed identity. `process.env.*_SECRET` reads are wrapped in a `lib/secrets/load.ts` that pulls from Key Vault in production and from `.env` in development.
3. **Configure object-storage lifecycle rules** for label images: transition to cool / archive tier after N days, delete after the records-schedule window. Per schema.md, image retention is governed in object storage.
4. **Create `config/retention.json`** with placeholder windows per table:
   ```
   {
     "application": { "archive_after_days": "TBD", "delete_after_days": "TBD" },
     "verification": { "archive_after_days": "TBD", "delete_after_days": "TBD" },
     "field_result": { "archive_after_days": "TBD", "delete_after_days": "TBD" },
     "disposition": { "policy": "append_only_no_row_delete" },
     "audit_event":  { "policy": "append_only_no_row_delete" },
     "intake_batch": { "archive_after_days": "TBD" },
     "correction_cycle": { "archive_after_days": "TBD" },
     "metric_rollup": { "archive_after_days": "TBD" }
   }
   ```
5. **Write `lib/jobs/retention-sweep.ts`** that reads the config and, per table, marks rows for archive / deletion past their window. The job is idempotent. It **never** touches `disposition` or `audit_event` (those have `policy: append_only_no_row_delete` — the policy is enforced both in the job and at the DB grant level from P6-2).
6. **Write `docs/02-design/pii-inventory.md`** — the named PII columns, their encryption / access / audit / retention regimes, and the public-once-approved nuance.
7. **Write `docs/00-build/security-review-checklist.md`** — the checklist above with run instructions. Wire `pnpm security:checklist` to run the automatable items (Key Vault reachable, no plaintext secrets in env, encryption settings present, append-only grants in place, no public egress per the NSG check).
8. **Block the production release on the stakeholder decision** for the actual retention windows. The ticket ships with a clear TBD; the mechanism is in place.

### Key constraints

1. The model reads, the code decides — D4. (Unaffected.)
2. p95 under 5s for verification — NFR-1. The retention sweep runs off-hours; encryption at rest is transparent to the app.
3. TypeScript strict, no `any`.
4. **Production-specific: encryption at rest on every store + retention per the federal records schedule + a security review.** All three are non-negotiable for FedRAMP boundary operation.
5. **`disposition` and `audit_event` are append-only.** The retention job never deletes from these tables (schema.md). Retention for the unalterable record is a whole-corpus archive policy, not row-level delete.
6. **PII columns are `applicant_name`, `producer_name`, `producer_address`, label images, and the `verification.raw_extraction` JSONB.** These are governed by encryption (this ticket), RBAC (P6-3), audit (P6-3), retention (this ticket), and PII redaction in observability exports (P6-6).
7. **Secrets in Key Vault, not env files.** No plaintext secret survives this ticket.

### Files to modify

Primary: app startup (`lib/secrets/load.ts` shim wired into the bootstrap path) — every previously env-based secret is now Key-Vault-retrieved in production.

Also: existing object-storage configuration (P6-2) — add lifecycle rules.

### Files to create

1. `config/retention.json` — per-table retention policy (placeholder windows, append-only excluded).
2. `lib/secrets/load.ts` — Key Vault retrieval shim; falls back to `.env` only in development.
3. `lib/jobs/retention-sweep.ts` — scheduled archive / deletion job; skips append-only tables.
4. `scripts/run-retention-sweep.ts` — CLI entry.
5. `scripts/security-checklist.ts` — runs the automatable items in the checklist.
6. `docs/02-design/pii-inventory.md` — the named PII columns and their governance regime.
7. `docs/02-design/encryption-at-rest.md` — encryption-at-rest inventory per store.
8. `docs/00-build/security-review-checklist.md` — the explicit checklist; pass/fail before production sign-off.
9. `tests/compliance/retention.test.ts` — the sweep skips `disposition` and `audit_event`, is idempotent, and respects the config.
10. `tests/compliance/secrets.test.ts` — production startup with a plaintext-secret env throws.

### Config / schema / store updates

- `config/retention.json` — new.
- Azure Blob lifecycle rules — applied via infra.
- Azure Key Vault — every previously env-based secret moved.
- No relational-schema changes.

Env additions:
- `AZURE_KEY_VAULT_URL` (production).
- `RETENTION_CONFIG_PATH` (defaults to `config/retention.json`).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm test:compliance              # retention + secrets tests
pnpm security:checklist           # runs the automatable items
pnpm job:retention-sweep -- --dry # dry-run logs what it would do
```

Manual:
- [ ] **Security review checklist passed:** every item ticked, evidence linked in the DEV-LOG. This is the production sign-off gate.
- [ ] **Azure TDE confirmed** on the PostgreSQL instance (Azure Portal / CLI).
- [ ] **Azure Storage Service Encryption confirmed** on the labels container; CMK in place where required.
- [ ] **Key Vault retrieval works** in production startup; the app refuses to start if a secret is missing.
- [ ] **No plaintext secrets in the repo** (gitleaks / trufflehog scan clean).
- [ ] **Retention sweep dry-run** logs what it would do; `disposition` and `audit_event` are absent from the action list.
- [ ] **Object-storage lifecycle rules applied** for label images; verified in the Azure Portal.
- [ ] **PII inventory reviewed** by the agency's privacy / records officer; sign-off recorded.
- [ ] **No public egress** from production pods (NSG / network-policy verified).
- [ ] **Bake-off bar still met** (P5-4 false-negative rate + p95 latency) — re-run on the production deployment.

Eval: re-run P5-2 golden set on production-equivalent infra; assert no regression.

Update docs: mark P6-7 done in TICKETS.md; add a DEV-LOG entry recording the checklist run, sign-offs, and the still-TBD retention windows (carried as a Phase 6 exit blocker).

### Reference

- schema.md — PII, Retention, and Security section; the append-only rules; the Open Questions on the records schedule.
- systemsdesign.md — Security and Privacy Posture (production).
- observability.md — Privacy and Compliance of the Observability Itself.
- requirements.md — NFR-4 (production reversal with governance), NFR-8 (RBAC + audit).

### Common gotchas

1. **Encryption at rest:** Azure TDE for PostgreSQL is the baseline; CMK where the agency requires customer-managed keys. Azure Storage Service Encryption covers label images. The observability DB (Langfuse/Phoenix) gets the same treatment. Secrets live in Azure Key Vault, not env files.
2. **Retention follows the federal records schedule** — the exact windows are TBD per schema.md Open Questions and require a stakeholder decision. Ship the **mechanism** (config-driven, runnable job, append-only tables excluded) with placeholder windows and a clear TBD note; the production release blocks on the decision, not on the code.
3. **The PII columns are `applicant_name`, `producer_name`, `producer_address`, label images, and the `verification.raw_extraction` JSONB.** All are governed by encryption (this ticket), RBAC (P6-3), audit (P6-3), retention (this ticket), and PII redaction in observability exports (P6-6). The nuance: once a COLA is approved it is public record on the Public Registry, but applicant contact details, internal review notes, agent dispositions, and raw model extractions remain internal and sensitive. The schema does not assume binary public/private.
4. **`disposition` and `audit_event` are append-only and the retention sweep MUST NOT delete from them** (schema.md). They are the unalterable record. The job skips them by policy; the DB grants from P6-2 enforce the same property at the engine level.

### Definition of Done

Code complete when:
- [ ] Encryption at rest verified and documented for every store; secrets in Key Vault.
- [ ] Retention mechanism wired and tested with placeholder windows; append-only tables excluded.
- [ ] PII inventory written; encryption-at-rest inventory written.
- [ ] Security review checklist runnable; automatable items pass; manual items have evidence.
- [ ] No `any`; no console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, compliance, security checklist).
- [ ] TICKETS.md and DEV-LOG updated; the still-TBD retention windows are tracked as a Phase 6 exit blocker.
- [ ] Committed to `feat/compliance`, pushed, merged to main.
- [ ] **Production sign-off recorded** (the checklist is the gate).

### Expected output

The production deployment is compliance-hardened: encryption at rest on every store, secrets in Key Vault, retention policy mechanism wired and configurable, PII inventory and governance documented, security review checklist passed. The Phase 6 exit blocker is the stakeholder decision on the actual retention windows; everything else is in place.

### Dependencies to install

```
pnpm add @azure/keyvault-secrets @azure/identity
# Static analysis for secrets in dev:
pnpm add -D gitleaks
```
