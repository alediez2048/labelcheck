# P5-7 — Deployment plan (reviewable take-home)

Make the take-home reviewable. Ship the running app as a live URL behind the existing access-gate spend shield (P0-6), and publish a `docs/DEPLOYMENT.md` that explains the prototype deploy, the env vars, the in-memory-by-design persistence choices (NFR-4), and how Phase 6 (`P6-2` persistence, `P6-3` auth, `P6-4` COLA, `P6-6` self-hosted observability) would close the gaps in production.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @requirements.md, @techstack.md, @assumptions.md, @TICKETS.md, and @docs/00-build/DEV-LOG.md (the Phase 5 entries explain the surfaces that need env vars).
Also read @docs/00-build/tickets/P0-6-access-gate.md (the access gate is already the spend shield this deploy relies on).

I'm working on TICKET-P5-7: Deployment plan.

Current state: (at start)
- [list what is DONE so far, with checks: the app builds and tests clean on `main`; the CI workflow runs lint/build/test/guardrails/eval-gate; the access gate (P0-6) is in place; the bake-off + eval-gate CLIs work locally; no live deploy yet]

What's NOT done yet:
- [list with crosses: no hosting target chosen and wired; no env-var inventory published; no README deployment section; no Phase 6 gap doc; no decision recorded about the corrections-corpus + KB filesystem writes that no-op under serverless]

TICKET-P5-7 Goal:
Deliver two things: (1) a reviewable live URL of the prototype behind the access-gate passcode (or, if the user prefers, a fully-documented one-command local run with a Loom-style script as the fallback), and (2) `docs/DEPLOYMENT.md` — a single doc that explains the prototype deploy decisions, the env-var inventory, the deliberate "nothing persisted" choice (NFR-4), and the Phase 6 tickets that close the production gaps. This ticket is a plan + thin wiring, NOT a full Phase 6 stand-up.

Check `.github/workflows/ci.yml`, `middleware.ts` (the access gate), `next.config.ts`, `package.json`, `lib/kb/**` (the KB writes to disk), `lib/feedback/corpus.ts` (corrections corpus writes to disk), and any existing README before starting.
Follow @PRD.md (Phases 0–3 are the take-home, Phases 4–6 are the credible path to production), @assumptions.md A21 (production cannot call public APIs), and @requirements.md NFR-4 (prototype persists nothing sensitive) and NFR-8 (access gate is a spend shield, not security).

After completion, follow the testing checklist below.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts. Most likely P5-6 — the mockup-aligned design pass. The deploy ships whatever's on `main`; the design ticket should land first so the live URL shows the polished app.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-7 Scope

- Phase: Phase 5 — Evals, observability, and design close-out
- Time budget: 3h (target tier 1; tier 2 + 3 are stretch)
- Dependencies: P0-6 (access gate), P5-5 (CI eval gate — the deploy uses the same workflow), P5-6 (the design pass — the live URL should show the polished app)
- Branch: feat/deployment-plan

### Acceptance criteria

**Tier 1 — the plan + the gap doc (must ship):**

- [ ] `docs/DEPLOYMENT.md` published, structured as: **why a deploy at all** (reviewability for the take-home) → **what's in scope** (prototype, NFR-4 still applies) → **chosen target** (Vercel, with rationale: managed Next.js + free tier + access-gate-compatible — OR if the user redirects, the rationale for whatever target is chosen) → **env-var inventory** (every variable the app reads, its purpose, whether it's required, where it lives in CI vs. the deploy) → **the "nothing persisted" gap** (KB ingestion + corrections corpus both write to disk; on Vercel's ephemeral filesystem they silently no-op across invocations — this is CORRECT per NFR-4; the doc explains so a reviewer doesn't file a bug) → **how Phase 6 closes the gap** (links to P6-2 Persistence and audit, P6-3 Authentication and RBAC, P6-4 COLA integration, P6-6 Self-hosted observability — explains which gap each ticket closes) → **what a reviewer should try** (the nine sample applications, the bulk-approve, the review-detail flow, the assistant, the disagreement queue).
- [ ] Env-var inventory captures at least: `ANTHROPIC_API_KEY` (required for live extraction; mock works without), `ACCESS_PASSCODE` + `ACCESS_COOKIE_SECRET` (the spend shield), `EVAL_PROVIDER` (CI uses `mock`), `EVAL_BASELINE_PATH` if introduced, `FEEDBACK_SAMPLER_RATIO` + `FEEDBACK_SAMPLER_CAP_PER_DAY` + `FEEDBACK_AGREEMENT_WINDOW` (P5-3 corpus tuning), and any others the agent finds by grepping `process.env`. Each entry: name, purpose, required-vs-optional, default if any, where it's set in CI vs. the deploy.
- [ ] **Phase 6 gap matrix** in `docs/DEPLOYMENT.md`: a small table — column 1 the prototype's deliberate gap (no real auth, no persistence, no COLA integration, no in-boundary model, no self-hosted observability), column 2 the Phase 6 ticket that closes it (P6-3, P6-2, P6-4, P6-1, P6-6), column 3 a one-line "what the prod answer is" (PIV/CAC + SSO; PostgreSQL + JSONB + pgvector + object storage; ingestion + write-back adapters; Azure OpenAI in Azure Government, with olmOCR as the air-gapped fallback; Langfuse + OTel + Prometheus/Grafana in-boundary).
- [ ] README updated with a top-level "Live demo" section (or a "Run locally" section if no live deploy is chosen): the URL (when live), the passcode delivery channel, the sample-application path, the assistant entry point, and a pointer to `docs/DEPLOYMENT.md` for the longer story.
- [ ] `.env.example` exists (or is updated) listing every env var from the inventory above with safe placeholder values.

**Tier 2 — the live deploy on Vercel (target):**

- [ ] `vercel.json` (or equivalent platform config) committed: explicit `framework: "nextjs"`, `regions` pinned, `buildCommand: "pnpm build"`, `installCommand: "pnpm install --frozen-lockfile"`, `outputDirectory: ".next"`; any function-level memory or timeout overrides documented.
- [ ] Vercel project linked to the GitHub repo's `main` branch; auto-deploys on `main` push, preview deploys on PR.
- [ ] Production env vars set in the Vercel dashboard (NOT in the repo): `ANTHROPIC_API_KEY`, `ACCESS_PASSCODE`, `ACCESS_COOKIE_SECRET`. Documented in `docs/DEPLOYMENT.md` (with the secrets-channel guidance — i.e., do not commit them).
- [ ] Live URL works behind the access-gate passcode; reviewer can hit it, enter the passcode, and walk the nine sample applications + the assistant.
- [ ] The KB-ingestion and corrections-recorder paths gracefully no-op on a read-only filesystem — verify by attempting an upload on the live URL and confirming the UI surfaces a clear "ingestion succeeded for this session only" message (or the equivalent), NOT a 500. The recorder already wraps its write in try/catch (P5-3 DEV-LOG); apply the same pattern to KB ingestion (P4-1) if it doesn't already.
- [ ] CI workflow unchanged in CI behavior, but a short note added to `docs/DEPLOYMENT.md` clarifying that CI runs the eval gate (P5-5) and the deploy only proceeds when CI is green — i.e. a regression that fails the gate cannot reach production.

**Tier 3 — production-leaning extras (stretch, document only if not built):**

- [ ] `docs/DEPLOYMENT.md` includes a short ADR-style section: "Why we chose Vercel for the prototype and why production goes in-boundary." Names the trade-off (managed reviewability now vs. in-boundary requirement later) and links to assumption A21.
- [ ] A pre-seeded KB option: a small set of source documents committed under `kb-seed/` and a `pnpm kb:seed` script that loads them at boot if the filesystem is writable. Documented as a demo-only convenience; the production answer is P6-2.
- [ ] A "what to demo" script in `docs/DEPLOYMENT.md`: the exact click-path for a 5-minute reviewer walkthrough (Operations funnel → bulk approve → one mismatch in review detail → return for correction → check the disagreement queue → ask the assistant a question).

### Implementation details

- **Inventory the env vars by grepping the code, not by recalling them.** `grep -RIn "process\.env\." app lib middleware.ts scripts` is the source of truth. Cross-check against `.env.example` if one exists.
- **Vercel-specific gotchas to document (and de-fuse):**
  - Edge vs. serverless: the access-gate middleware runs on Edge; long-running Anthropic calls run on the serverless function path. Default function timeout on hobby is 10s — for safety, pin a longer maxDuration on the verification route. Document in `docs/DEPLOYMENT.md`.
  - Filesystem is read-only outside `/tmp`; `/tmp` is per-invocation. The KB and corrections corpus writes both currently target the repo-relative `kb/` and `eval-data/` paths. On Vercel they will fail. The recorder (P5-3) already swallows the error gracefully; verify the KB ingestion (P4-1) does too — if it returns a 500, wrap the write in try/catch and surface a user-facing "session-only" message.
  - `pnpm` is supported but Vercel sometimes defaults to npm; set `installCommand: "pnpm install --frozen-lockfile"` explicitly.
- **The access gate is a spend shield, not security** (NFR-8). Document that explicitly. A reviewer who shares the passcode is sharing demo access, not federal data — there isn't any.
- **The live model path needs an Anthropic key** (A11). For the live URL, you have two choices: ship with `EVAL_PROVIDER=mock` so the demo runs against the mock (cheap, deterministic, no key risk) and document that switching to `live` requires a key set in the Vercel dashboard, OR ship with the live provider and accept the budget envelope. The doc should name the choice explicitly.
- **CI does not deploy.** Vercel watches `main` and deploys on push. CI's job is to keep `main` deployable (`pnpm lint`, build, test, eval-gate). Document this division clearly in `docs/DEPLOYMENT.md`.
- **Don't commit secrets, ever.** `.env.example` carries placeholders; the actual values live in Vercel's dashboard. The doc says so in bold.

### Key constraints

1. **NFR-4 still applies in the prototype deploy.** Nothing sensitive is persisted. The KB and the corrections corpus are filesystem-backed by design; the live deploy's ephemeral-filesystem behaviour is consistent with NFR-4, not a bug. The doc explains.
2. **NFR-8 — access gate is a spend shield.** Not security. Frame it that way in the doc; do not over-promise.
3. **Phase 6 is gated on a decision to proceed.** The deployment plan does NOT silently stand up Phase 6 infrastructure (no Postgres, no PIV/CAC, no in-boundary model). It points at the tickets that would.
4. **A21 — production cannot call public APIs.** The Vercel deploy DOES call a public model API; that is acceptable for a prototype demo (A11), but the doc names the constraint and points at P6-1 (in-boundary model adapter) as the answer.
5. **The eval gate (P5-5) is the deploy gate.** Document the chain: PR → CI runs the gate → green main → Vercel deploys. A failing gate does not reach prod.

### Files to modify

- `README.md` — add the "Live demo" or "Run locally" section.
- `middleware.ts` (only if env-var rename is needed; otherwise leave alone).
- `lib/kb/parse.ts` (or the KB writer) — if the write is unguarded, wrap it in try/catch and surface a session-only state.

### Files to create

- `docs/DEPLOYMENT.md` — the main deliverable.
- `vercel.json` (Tier 2) — explicit platform config.
- `.env.example` — env-var template (if it doesn't already exist; update if it does).

### Config / schema / store updates

- No schema changes. The deploy uses the existing in-memory React stores + filesystem-backed corpus + KB; nothing migrates.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm eval --gate       # the deploy gate; must be green for prod to proceed
```

Manual (Tier 1 — plan only):
- [ ] Re-read `docs/DEPLOYMENT.md` with fresh eyes. Does a reviewer who has never seen the repo understand: what they're looking at, how to access it, why it doesn't persist, and what production would look like? If not, fix.
- [ ] Confirm every `process.env.X` reference in the code maps to a row in the env-var inventory.

Manual (Tier 2 — live deploy):
- [ ] Open the live URL incognito; confirm the access-gate prompt fires.
- [ ] Enter the passcode; land on the Operations page; confirm the funnel renders (live or mock-seeded data).
- [ ] Walk one mismatch through Review detail → Return for correction; confirm the auto-advance works.
- [ ] Open the Disagreement queue; confirm the row appears (even if the recorder no-ops on the writable-fs check, the UI should be navigable).
- [ ] Open the assistant; confirm it answers a "how does verification work" question and shows the guardrail footer.
- [ ] Attempt a KB upload (Knowledge Base page); confirm a friendly session-only message rather than a 500.

Update docs: mark P5-7 done in TICKETS.md; add a DEV-LOG entry recording the chosen deploy target (and the URL, in a private/secure-channel note); cross-link `docs/DEPLOYMENT.md` from the README.

### Reference

- @PRD.md — "Phases 0 to 3 are the take-home prototype scope; Phases 4 to 6 are the credible path to production"; "Out of scope (prototype, documented as production): COLA integration, real authentication, a production datastore, an in-boundary model, and the full self-hosted observability platform."
- @assumptions.md — A11 (hosted model in prototype), A21 (production cannot call public APIs), A6/A7 (no real COLA integration in prototype).
- @requirements.md — NFR-4 (prototype persists nothing sensitive), NFR-8 (access gate is a spend shield).
- @TICKETS.md Phase 6 — P6-1 in-boundary model adapter, P6-2 persistence and audit, P6-3 auth + RBAC, P6-4 COLA integration, P6-6 self-hosted observability.
- @techstack.md — Hosting + cost + model-selection framing.

### Common gotchas

1. **Don't accidentally stand up Phase 6.** The deploy plan points at Phase 6 tickets; it does NOT silently start them. A reviewer who reads `docs/DEPLOYMENT.md` should see "here's what's in the prototype + here's the credible production path," not "here's a half-done auth system."
2. **Don't commit secrets.** `.env.example` carries placeholders; the real keys live in Vercel's dashboard. Audit the diff before committing.
3. **Don't promise persistence the prototype doesn't have.** The Vercel ephemeral filesystem makes the KB and corrections-corpus writes session-only. That's correct per NFR-4. The doc says so plainly.
4. **Don't break CI.** The eval gate is the deploy gate. A change that regresses the headline metric blocks the deploy by failing the gate — that's the contract.
5. **The access gate is a spend shield, not security.** Frame it that way in `docs/DEPLOYMENT.md` and in any reviewer-facing copy. A passcode keeps the spend bounded; it is not a federal access control.

### Definition of Done

Code complete when:
- [ ] `docs/DEPLOYMENT.md` is published with the env-var inventory + the Phase 6 gap matrix.
- [ ] `.env.example` is committed and matches the inventory.
- [ ] README "Live demo" or "Run locally" section is added and points at the deployment doc.
- [ ] If Tier 2: `vercel.json` is committed; the live URL is accessible behind the passcode; the demo flow works end-to-end.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm eval --gate` pass.
- [ ] Manual checks above ticked.
- [ ] TICKETS.md and DEV-LOG updated; the live URL (if any) recorded out-of-band.
- [ ] Committed to `feat/deployment-plan`, pushed, merged to main.

### Expected output

A reviewer can either: (a) open a live URL, enter the passcode, and walk the nine-sample demo through Operations → review → disposition → assistant → disagreement queue; OR (b) clone the repo, run `pnpm install && pnpm dev`, and do the same locally. Either way, they leave understanding what's in the prototype, what's deliberately not, and which Phase 6 ticket closes each gap. The Phase 5 close-out reads as one coherent story: the architecture, the evals, the design, and the deployment all match.

### Dependencies to install

```
(none — no new runtime deps; Vercel CLI is optional and used out-of-band, not in the repo)
```

### Why

Phase 5 ends with a polished prototype: traced runs, gated evals, an aligned design (after P5-6). But a reviewer who can't actually click around forms opinions from screenshots and prose, which is a strictly weaker artefact than a working demo. P5-7 makes the take-home reviewable — either as a live URL (the higher-credibility move) or as a one-command local run with documented deploy decisions. The doc deliverable (`docs/DEPLOYMENT.md`) is independently valuable: it spells out the env vars, the deliberate "nothing persisted" choice, and the Phase 6 gap matrix in one place, so the prototype's deliberate gaps read as architectural discipline rather than oversights. The chosen target is Vercel by default because it matches Next.js naturally, the access-gate spend shield is already built (P0-6), and the live URL is the cheapest credibility-per-hour move available at this stage. Production goes in-boundary on Azure Gov per A21 and P6-1; the doc names that gap explicitly so a procurement reviewer sees the production answer next to the prototype's expedient choice.
