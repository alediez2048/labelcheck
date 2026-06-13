# P6-3 — Authentication and RBAC

Replace the prototype's shared-passcode spend shield with real federal identity (PIV/CAC + SSO), drive the Agent / Admin role split from that identity, enforce row-level access server-side so an agent only ever sees their own claimed items and stats, and audit every access event.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @schema.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P6-3: Authentication and RBAC.

Current state: (at start)
- [Prototype Phase 0–5 plus P6-1 (in-boundary model) and P6-2 (PostgreSQL + audit) are in place. Identity is currently simulated by the P2-5 role switcher; the live access gate is the P0-6 shared passcode (a spend shield, NOT security — NFR-8).]

What's NOT done yet:
- [P6-3] No real identity, no PIV/CAC, no SSO, no server-side row-level enforcement. The role switcher must be removed in production.
- [P6-4..P6-7] COLA integration, correction lifecycle, self-hosted observability, and compliance hardening still to come.

TICKET-P6-3 Goal:
Wire federal identity (PIV/CAC via the agency IdP, SAML/OIDC SSO) into the app. Map the identity to the `agent.auth_subject` column (schema.md). Derive the Agent / Admin role from the database row, not from a client header. Enforce row-level access on every server-side query: an agent reads ONLY their own claimed applications and their own stats; an admin reads the division. Log every access event to `audit_event` (event_type=viewed). Retire the role switcher in the production build.

Check @lib/db/repositories/* (P6-2) and @middleware.ts (P0-6 access gate) before starting. The repository layer is where row-scoping lives; do not push role checks into matching or triage.
Follow systemsdesign D16 (role-based shells) and requirements NFR-8 (PIV/CAC, SSO, RBAC, audit).
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste P6-2's real output: migrations applied, repositories in place, audit_event writing, append-only grants confirmed.)_

### TICKET-P6-3 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 5h
- Dependencies: P2-5 (the two shells), P6-2 (the `agent` table and `audit_event`)
- Branch: `feat/auth`

### Acceptance criteria

- [ ] PIV/CAC + SSO via the agency IdP (SAML 2.0 or OIDC, depending on the agency's IdP — both supported behind the library seam). On successful auth, the user's identity is mapped to `agent.auth_subject` (schema.md). First-time users without an `agent` row are denied access with a clear "contact your supervisor" message (no JIT self-provisioning).
- [ ] The active role (`agent` or `admin`) is read from the `agent.role` column at the start of every request, not from a client cookie or header an attacker could set (NFR-8; D16).
- [ ] **Row-level access is enforced server-side, in the repositories** (P6-2): an `agent` can only `SELECT` rows where `application.assigned_agent_id = currentAgentId`, plus the items in the shared pool they are eligible to claim per their availability and specialization (D15, D16). An admin sees the division. There is no client-side filter that, if bypassed, exposes another agent's data.
- [ ] My Stats is row-scoped to the logged-in agent; an agent cannot read another agent's `metric_rollup` rows (D16; the assistant's role-scope eval depends on this, observability.md).
- [ ] Admin-only actions — bulk-confirm the match lane, hand-assign/reassign, edit specializations, manage the knowledge base — are gated on `role = admin` at the **route handler**, not just the UI.
- [ ] Every meaningful access writes an `audit_event` (event_type ∈ {`viewed`, `assigned`, `disposition`, `override`, `image_requested`, `config_changed`}). PII redacted in `detail` per observability.md.
- [ ] The P0-6 shared-passcode middleware and the P2-5 role switcher are **removed** from the production build (kept behind a `NODE_ENV !== 'production'` guard for local dev only). A production startup check throws if the switcher is reachable.
- [ ] Session lifetime, idle timeout, and re-auth behaviour follow the agency's policy (set by config; defaults documented).

### Implementation details

1. Pick the auth library:
   - **OIDC** path: `openid-client` (server-side OIDC relying party). Works against most modern federal IdPs (Login.gov, Okta, Entra ID Gov).
   - **SAML** path: `@node-saml/passport-saml` or `samlify`. Common for older agency IdPs still on SAML.
   - The agency's IdP capability decides which goes live; both are wired behind a `lib/auth/provider.ts` seam.
2. Create `lib/auth/provider.ts` exposing `getCurrentIdentity(req)` returning `{ authSubject, displayName, email }` after a successful auth handshake. Implementations: `oidc.ts`, `saml.ts`, and `dev-switcher.ts` (the existing P2-5 simulator, **not** for production).
3. Create `lib/auth/session.ts` — server-side session backed by encrypted cookies or a database-backed session table (no localStorage; PIV/CAC artifacts are not for the browser). Idle timeout, absolute timeout, secure + httpOnly + sameSite=strict cookies.
4. Create `lib/auth/current-agent.ts` — `getCurrentAgent(req): Promise<Agent>`. Looks up the `agent` row by `auth_subject`. Throws `UnauthorizedError` if missing or `agent.active = false`. This is the **only** way the rest of the app gets the current actor's role; repositories take an `Agent` argument, not a request.
5. Update every repository in `lib/db/repositories/*` (P6-2) to take an `actor: Agent` argument and scope queries by it. Examples:
   - `applicationRepo.listForQueue(actor)` — when actor is agent: WHERE assigned_agent_id = actor.id AND status='assigned'. When admin: no scope.
   - `metricRollupRepo.listForActor(actor, range)` — agent: WHERE agent_id = actor.id. Admin: no scope.
   - `dispositionRepo.insert(actor, applicationId, decision, …)` — sets `disposition.agent_id = actor.id`; refuses if the application is not claimed by `actor` (unless actor is admin doing an override, which writes `audit_event(override)`).
6. Add `middleware.ts` (Next.js) that:
   - In production: invokes the SSO handshake on unauthenticated requests and refuses access if there is no matching `agent` row.
   - In development: still allows the role switcher behind `NODE_ENV !== 'production'`.
   - In all environments: writes an `audit_event(viewed)` on the first access to any application within a session.
7. Gate admin-only routes at the route handler:
   - `POST /api/match-lane/bulk-confirm` → `requireRole('admin', actor)`
   - `POST /api/applications/:id/reassign` → `requireRole('admin', actor)`
   - `POST /api/knowledge-base/upload` → `requireRole('admin', actor)`
   - `PUT /api/team/:id/specialization` → `requireRole('admin', actor)`
8. Remove the P0-6 passcode from the production code path entirely. The README's run instructions are updated to reflect SSO.

### Key constraints

1. The model reads, the code decides — D4. (Unaffected here.)
2. p95 under 5s for verification — NFR-1. Auth must not add a synchronous IdP round trip to the verify endpoint; session lookup is local.
3. TypeScript strict, no `any`.
4. **Production-specific: PIV/CAC + SSO + RBAC + audit.** The federal identity flow is non-negotiable (NFR-8; A21 boundary).
5. **Row-level access is server-side.** Client filters do not count. An agent can never read another agent's claimed items or stats (D16; this also closes the assistant's role-scope-leak attack surface — observability Guardrail evals).
6. **Access events are audited.** Every `viewed`, `assigned`, `disposition`, `override`, `image_requested`, and `config_changed` writes to the append-only `audit_event` table (schema.md).
7. **The role switcher is dev-only.** A `NODE_ENV === 'production'` guard removes it; a startup check throws if it is still routable in production.

### Files to modify

Primary: `middleware.ts` (P0-6) — replace the shared-passcode logic with SSO. Keep a dev fallback for local development behind a NODE_ENV guard.

Also: every repository in `lib/db/repositories/*` from P6-2 — add the `actor: Agent` argument and the row-scope WHERE clauses. Update every route handler that calls a repository.

Also: `app/api/applications/route.ts` and friends — call `getCurrentAgent(req)` first, then pass the actor into the repo.

### Files to create

1. `lib/auth/provider.ts` — the auth-provider seam (OIDC / SAML / dev-switcher).
2. `lib/auth/oidc.ts` — OIDC relying-party implementation (Login.gov / Okta / Entra ID Gov).
3. `lib/auth/saml.ts` — SAML relying-party implementation (for SAML-only IdPs).
4. `lib/auth/dev-switcher.ts` — the P2-5 role switcher, behind a NODE_ENV guard.
5. `lib/auth/session.ts` — server-side encrypted session, idle + absolute timeouts.
6. `lib/auth/current-agent.ts` — `getCurrentAgent(req)`; the single way the rest of the app knows who is acting.
7. `lib/auth/require-role.ts` — `requireRole(role, actor)` helper for route handlers.
8. `tests/auth/row-scope.test.ts` — agent A's repo calls never return agent B's rows (the row-scope guarantee).
9. `tests/auth/admin-gating.test.ts` — admin-only routes refuse agent role.
10. `tests/auth/audit.test.ts` — every access event writes an `audit_event` row.

### Config / schema / store updates

Env additions:
- `AUTH_PROVIDER=oidc|saml|dev-switcher` (dev-switcher refused in production by the startup check).
- OIDC: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`.
- SAML: `SAML_ENTRY_POINT`, `SAML_ISSUER`, `SAML_CERT`, `SAML_PRIVATE_KEY`.
- `SESSION_SECRET` (32+ bytes), `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`.

Schema: `agent.auth_subject` is already in schema.md; no schema change.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm test:integration   # row-scope and admin-gating tests against a real DB
```

Manual:
- [ ] **PIV/CAC test:** with a PIV-equipped browser against a staging IdP, the SSO handshake completes and the user is matched to their `agent` row by `auth_subject`. A user without an `agent` row is denied with the documented message (no JIT provisioning).
- [ ] An authenticated agent issuing `GET /api/applications/queue` receives only their claimed items + eligible-to-claim pool items; SQL log confirms the WHERE clause.
- [ ] An authenticated agent issuing `GET /api/agents/<other-agent-id>/stats` receives 403.
- [ ] An authenticated agent issuing `POST /api/match-lane/bulk-confirm` receives 403.
- [ ] An admin can bulk-confirm and reassign; both write `audit_event` rows.
- [ ] Bypassing the UI by setting a `role: admin` cookie does **not** grant admin access; the role comes from the DB row.
- [ ] Production build with `AUTH_PROVIDER=dev-switcher` fails to start.

Eval: re-run the assistant's role-scope guardrail eval (observability.md) — leak rate must remain zero.

Update docs: mark P6-3 done in TICKETS.md; add a DEV-LOG entry recording the auth library choice (OIDC vs SAML).

### Reference

- requirements.md — NFR-8 (RBAC + audit), FR-29 (role shells).
- systemsdesign.md — D16 (role-based shells; row-level access for agents).
- schema.md — `agent`, `audit_event`, `agent.auth_subject`.
- observability.md — Role-scope isolation (zero leak rate).

### Common gotchas

1. **PIV/CAC + SSO is the federal-identity reality.** The IdP integration is via SAML or OIDC; both are wired behind the `lib/auth/provider.ts` seam so the agency's IdP capability decides which goes live. The browser sees a redirect, not the PIV cert; the cert is presented to the IdP. Do not attempt to parse the PIV cert in the app.
2. **Row-level access is enforced server-side, in the repositories.** An agent can ONLY see their own claimed items + own stats (D16). Client filters do not count. A repository function that does not take an `actor: Agent` argument is a bug.
3. **Access events are audited.** Every `viewed`, `assigned`, `disposition`, `override`, `image_requested`, and `config_changed` writes to the append-only `audit_event` table (schema.md, P6-2). Forgetting to audit a route is a finding in P6-7's security review.
4. **The role switcher is dev-only.** A production startup check throws if `AUTH_PROVIDER=dev-switcher`. Leaving it in production is the single fastest way to ship an authorization bypass.

### Definition of Done

Code complete when:
- [ ] SSO handshake works against a staging IdP; PIV/CAC users land in the right shell.
- [ ] Every repository takes an `actor: Agent` and scopes by it.
- [ ] Admin-only routes refuse agent role at the route handler.
- [ ] Access events write to `audit_event`.
- [ ] Production build refuses `AUTH_PROVIDER=dev-switcher`.
- [ ] No `any`; no console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, integration, manual PIV check).
- [ ] TICKETS.md and DEV-LOG updated (auth library choice recorded).
- [ ] Committed to `feat/auth`, pushed, merged to main.

### Expected output

Production access is gated on PIV/CAC + SSO via the agency IdP. The Agent / Admin role is read from `agent.role`. Row-level access is enforced server-side: an agent sees only their own work and stats; an admin sees the division. Admin-only actions are gated at the route handler. Every access event is audited. The role switcher is removed from production.

### Dependencies to install

```
pnpm add openid-client              # OIDC path
pnpm add @node-saml/node-saml        # SAML path (alternative: samlify)
pnpm add iron-session                # encrypted server-side session cookies
```
