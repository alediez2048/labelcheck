# P0-6 — Access gate

Add a shared-passcode middleware as a SPEND SHIELD (not real authentication) in front of the deployed app, so an open URL cannot drain the model budget (NFR-8). The passcode comes from an env var; production replaces this with PIV/CAC and SSO inside the FedRAMP boundary.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-6: Access gate.

Current state: (at start)
- [Paste P0-1..P0-5 actual output: Next.js + TS strict scaffold; `types/domain.ts`; provider adapter + mock; config store; image preprocessing.]

What's NOT done yet:
- [P0-6] Access gate middleware not built.
- [P0-7] CI still pending.
- [P1+] Verification endpoints land behind this gate.
- [P6-3] Production replaces this with real PIV/CAC + SSO + RBAC + audit logging.

TICKET-P0-6 Goal:
Create `middleware.ts` at the Next.js project root. Read `process.env.ACCESS_PASSCODE`. If unset, the gate is disabled (local dev convenience). If set, requests must present the passcode (via an `x-access-passcode` header, a signed cookie set after a one-time entry, or a query param on the entry page) — otherwise return 401. Apply to all routes except the entry page (`/access`), static assets, and the Next.js internals (`_next`). Document loudly that this is a SPEND SHIELD, not real auth. Make it impossible to confuse with PIV/CAC/RBAC, which is a P6-3 concern.

Check `middleware.ts` does not exist before creating. Don't overwrite existing code.
Follow @requirements.md NFR-8 and @systemsdesign.md Security and Privacy Posture.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-6 Scope

- Phase: Phase 0 — Foundations
- Time budget: 1h
- Dependencies: P0-1
- Branch: `feat/access-gate`

### Acceptance criteria

- [ ] `middleware.ts` exists at the repo root and uses the Next.js Edge middleware API.
- [ ] If `ACCESS_PASSCODE` is unset, the gate is a no-op (local dev convenience), and `pnpm dev` works passcode-free.
- [ ] If `ACCESS_PASSCODE` is set, an unauthenticated request returns 401 (or redirects to `/access` for browser GETs) — confirmed for the root page, an API route, and a deep link.
- [ ] A correct passcode submitted via the entry page sets a signed (HMAC) HttpOnly Secure cookie; the cookie value is verified on every subsequent request.
- [ ] `_next`, `/favicon.ico`, and static asset paths are excluded from the gate (otherwise the entry page cannot load its CSS/JS).
- [ ] `/access` (the entry page) is excluded from the gate so the user can submit the passcode.
- [ ] The README and the `/access` page itself loudly label this as a SPEND SHIELD, not security, citing NFR-8.
- [ ] Passcode comparison is constant-time (`crypto.timingSafeEqual`) — a thoughtless `===` is rejected in review.
- [ ] No passcode value is ever logged.

### Implementation details

1. Create `middleware.ts` at the project root:
   ```ts
   import { NextRequest, NextResponse } from "next/server";
   export const config = { matcher: ["/((?!_next|favicon.ico|access|api/health).*)"] };
   export function middleware(req: NextRequest) {
     const expected = process.env.ACCESS_PASSCODE;
     if (!expected) return NextResponse.next(); // local dev no-op
     const cookie = req.cookies.get("lc_access")?.value ?? "";
     if (verifyCookie(cookie, expected)) return NextResponse.next();
     if (req.headers.get("accept")?.includes("text/html")) {
       const url = req.nextUrl.clone(); url.pathname = "/access"; url.searchParams.set("next", req.nextUrl.pathname);
       return NextResponse.redirect(url);
     }
     return new NextResponse("Unauthorized", { status: 401 });
   }
   ```
2. Create `lib/access/cookie.ts`:
   - `signCookie(passcode: string, secret: string): string` — HMAC-SHA256 over the passcode, base64-url. Use `crypto.subtle` (Edge runtime compatible) or `node:crypto` with a Node-runtime middleware.
   - `verifyCookie(cookieValue: string, expectedPasscode: string): boolean` — recompute and `timingSafeEqual`.
   - Read the HMAC secret from `process.env.ACCESS_COOKIE_SECRET`; require it whenever `ACCESS_PASSCODE` is set.
3. Create `app/access/page.tsx`:
   - A minimal form with a single passcode field and submit button.
   - Top-of-page note: "This is a spend shield, not security. Production uses PIV/CAC and SSO (NFR-8)."
   - On submit, POSTs to `app/api/access/route.ts`.
4. Create `app/api/access/route.ts`:
   - Reads the submitted passcode, compares via `timingSafeEqual` to `process.env.ACCESS_PASSCODE`, on success sets the `lc_access` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, no expiry beyond session) and redirects to the `next` param (sanitised to same-origin paths).
   - On failure, returns to `/access?error=1`.
5. Create `app/api/health/route.ts` — a trivial `{ ok: true }` JSON endpoint excluded from the gate (so a deploy health check works).
6. Document required env vars in `README.md`:
   - `ACCESS_PASSCODE` — set on the deployed instance; UNSET for local dev.
   - `ACCESS_COOKIE_SECRET` — random 32+ byte string; required iff `ACCESS_PASSCODE` is set.
   - Both are loaded from a local `.env` that is git-ignored.
7. Add a one-paragraph note to `middleware.ts` top-of-file: "Spend shield only. Not authentication. Not RBAC. Not audit. Production identity is P6-3 (PIV/CAC + SSO + audit logging within the FedRAMP boundary)."

### Key constraints

1. **NFR-8: this is a SPEND SHIELD, not security.** The README, the `/access` page, and the middleware file all say this explicitly. The risk is that a future agent treats this gate as authentication and skips P6-3.
2. **Production uses PIV/CAC and SSO.** That is P6-3's job. Do not start it here. No user table, no sessions beyond a single cookie, no roles.
3. **Constant-time comparison.** `crypto.timingSafeEqual` (or the WebCrypto equivalent). A naive `===` on a passcode invites timing oracle attacks even if this is "only" a spend shield — fixing it later is cheaper than explaining it.
4. **Never log the passcode or the cookie value.** Logs are fine; the secret material is not.
5. **Edge-compatible.** Next.js middleware runs at the Edge. Use `crypto.subtle` if needed; if Node `crypto` is preferred, set `runtime = "nodejs"` on the middleware.
6. **No PII (NFR-4).** This gate sees no applicant PII; it must not store user identifiers.
7. **`/access` and `api/health` excluded** from the matcher — otherwise the gate locks out its own entry page and any deploy probe.
8. **TypeScript strict, no `any`.**

### Files to modify

- `README.md` (at start — paste real file content from prior ticket) — add the env-var section and the NFR-8 note.
- `.env.example` (create if not present) — list `ACCESS_PASSCODE`, `ACCESS_COOKIE_SECRET` with empty values; document that `.env` is gitignored.

### Files to create

1. `middleware.ts` — the Edge middleware, gate logic, route matcher.
2. `lib/access/cookie.ts` — `signCookie`, `verifyCookie`, HMAC verify with constant-time compare.
3. `app/access/page.tsx` — the passcode entry form with the spend-shield note.
4. `app/api/access/route.ts` — the POST handler that sets the cookie on success.
5. `app/api/health/route.ts` — `{ ok: true }`; excluded from the gate; deploy probe.
6. `.env.example` — env vars listed with empty values.

### Config / schema / store updates

- `.env.example` (NEW) — `ACCESS_PASSCODE`, `ACCESS_COOKIE_SECRET`.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] Unset `ACCESS_PASSCODE`, `pnpm dev` — root page loads without prompting. Gate is a no-op locally.
- [ ] Set `ACCESS_PASSCODE=test123` and `ACCESS_COOKIE_SECRET=<32+ char random>`, `pnpm dev` — hitting `/` redirects to `/access`. Submitting the correct passcode redirects back to `/`. The cookie is `HttpOnly` and `Secure` (in DevTools → Application → Cookies).
- [ ] With the gate enabled, hit `/api/anything` (a non-existent API route) — confirm 401, not the Next.js 404 page.
- [ ] With the gate enabled, hit `/api/health` — confirm 200 (excluded from the gate).
- [ ] Submit the wrong passcode three times — confirm no info leak (same 401 / `/access?error=1` each time) and no log line includes the attempted value.

Eval: (not applicable in Phase 0).

Update docs: Mark P0-6 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- requirements.md — NFR-8 (prototype access gate; production PIV/CAC + SSO + RBAC + audit).
- systemsdesign.md — Security and Privacy Posture; Production Evolution Path; D16 (roles, simulated in prototype).
- techstack.md — Access Control.
- PRD.md §6 — cross-cutting privacy / NFR-4 (no PII persisted).

### Common gotchas

1. **This is a SPEND SHIELD, not real auth (NFR-8).** Production uses PIV/CAC and SSO (P6-3). If anyone reading this thinks "great, we have auth" — the comment-and-README discipline of this ticket has failed.
2. **Excluding `/access`, `api/health`, `_next`, and static assets from the matcher is mandatory** — otherwise the gate locks out its own entry page and the deploy health probe.
3. **Use `crypto.timingSafeEqual` (or the WebCrypto equivalent) — not `===`.** Even on a "just a spend shield" passcode, a `===` invites timing attacks and reviews will fail.
4. **Never log the passcode or the cookie value.** Logs and traces must elide them. Otherwise a debug session leaks the only thing protecting the API budget.

### Definition of Done

Code complete when:
- [ ] `middleware.ts` enforces the gate when `ACCESS_PASSCODE` is set and is a no-op when unset.
- [ ] `/access` entry page + API handler set a signed cookie on correct passcode.
- [ ] Constant-time comparison used; nothing logs the passcode or cookie.
- [ ] `/api/health` reachable while gated.
- [ ] Loud "spend shield, not security" notes in middleware, page, README.
- [ ] `pnpm lint` and `pnpm build` succeed.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/access-gate`, pushed, merged to main.

### Expected output

The deployed prototype cannot be hit by an anonymous URL probe — every request that touches the model budget passes the passcode gate first. Locally, the gate is a no-op for developer convenience. The gate is unambiguously documented as a spend shield, leaving P6-3 free to replace it with real PIV/CAC + SSO without re-litigating the design.

### Dependencies to install

_(none — Next.js middleware + WebCrypto are sufficient)_

### Why

P0-6 is the SPEND SHIELD, full stop. The README says it, the entry page says it, `middleware.ts` says it, `cookie.ts` says it, and this DEV-LOG entry says it — four times — because the risk this ticket carries is that a future operator looks at a passcode-gated URL and concludes "we have auth." We don't. Production identity is PIV/CAC + SSO + RBAC + audit inside the FedRAMP boundary, and that's P6-3. Everything in this ticket is calibrated to make that confusion impossible: the env var is `ACCESS_PASSCODE` not `AUTH_SECRET`; the cookie is `lc_access` not `lc_auth`; the page banner uses the literal phrase "spend shield"; the JSDoc on `cookie.ts` repeats it.

The scheme is HMAC over a fixed payload, not "the cookie IS the passcode." The cookie never carries the passcode in any form, hashed or otherwise — it's a proof-of-knowledge token signed with `ACCESS_COOKIE_SECRET`. We considered a JWT and a session id and rejected both: a JWT brings claims, expiry, refresh logic, none of which fit a spend shield; a session id requires server-side state, which Phase 0 has none of (NFR-4) and an Edge-runtime middleware can't easily reach anyway. The two-env-var split (`ACCESS_PASSCODE` for the human, `ACCESS_COOKIE_SECRET` for the server) means rotating the cookie secret invalidates every active session without changing the passcode users have to remember.

WebCrypto over `node:crypto` because the middleware runs at the Edge runtime by default; `crypto.subtle.verify` is constant-time by spec, preferable to a hand-rolled string compare on the HMAC output. `timingSafeEqualString` is exported for the one place we DO compare strings directly (the passcode submission); a manual constant-time compare there is the standard pattern, and the length leak it carries is not material because the passcode length is operator-known and fixed per deploy. The TypeScript 5.7+ generic typing of `Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>` required explicit typing on `fromBase64Url`'s return and on the `sig` variable in `verifyCookie`; we kept the explicit types rather than casting because the explicit version compiles AND documents the runtime guarantee (these bytes are backed by a regular ArrayBuffer, not a SharedArrayBuffer).

The matcher excludes by design: `_next` (bundled assets including the access page's own CSS), `favicon.ico`, `access` (the entry page can't gate the door against itself), `api/access` (the POST handler, same reason), and `api/health` (the deploy probe must reach without a passcode). A future agent who adds a public asset and forgets to add it to the matcher will see their asset return 401 and immediately understand why — that's the right failure mode. **Fail-closed on misconfiguration**: `ACCESS_PASSCODE` set but `ACCESS_COOKIE_SECRET` unset returns 500, not bypass; half-configured is more dangerous than unconfigured because it suggests the operator INTENDED to gate but the gate is open, so the 500 forces a fix. Trade-off accepted: the cookie has `HttpOnly`, `Secure`, `SameSite=Lax`, no `Expires` — a session-length cookie is the right ergonomic for an "enter once per browser session" spend shield. `Secure` rejects the cookie in pure HTTP local dev, but local dev runs with `ACCESS_PASSCODE` unset so the gate is a no-op and this never bites.
