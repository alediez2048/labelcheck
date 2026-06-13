# P0-1 — Repo scaffold

Stand up a TypeScript + Next.js (App Router) + Tailwind project with strict TS, ESLint/Prettier, and pnpm scripts, so every later ticket has a clean, lintable, buildable home. No verification logic yet — this is purely the runnable shell.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-1: Repo scaffold.

Current state: (at start)
- [Empty repo. No package.json, no Next.js app, no tsconfig.]

What's NOT done yet:
- [P0-1] Next.js (App Router) + TypeScript strict + Tailwind not initialised.
- [P0-1] ESLint/Prettier not configured.
- [P0-1] pnpm scripts (dev, build, lint, test) not defined.
- [P0-2..P0-7] Domain types, provider adapter, config store, image preproc, access gate, CI all blocked on this scaffold.

TICKET-P0-1 Goal:
Create a Next.js App Router project in TypeScript strict mode, with Tailwind, ESLint, and Prettier wired up. The app must boot on `pnpm dev`, lint clean on `pnpm lint`, and build clean on `pnpm build`. No business logic. Set the seam for everything that follows in Phase 0.

Check the repo root before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (D8 swappable adapter seam) and the stack in @techstack.md (Language and Runtime, Frontend, Developer Tooling). Match the cross-cutting rules in @PRD.md §6.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-1 Scope

- Phase: Phase 0 — Foundations
- Time budget: 2h
- Dependencies: none
- Branch: `feat/scaffold`

### Acceptance criteria

- [ ] App boots on `pnpm dev` (Next.js App Router, default route renders).
- [ ] TypeScript strict mode on (`"strict": true`, `"noUncheckedIndexedAccess": true`); `any` is disallowed by lint.
- [ ] ESLint (eslint-config-next) and Prettier configured; `pnpm lint` exits 0 on a clean tree.
- [ ] Tailwind CSS installed and a sample utility class renders in the default page.
- [ ] pnpm scripts defined: `dev`, `build`, `start`, `lint`, `test` (test can be a stub that exits 0 until P0-7).
- [ ] Maintainability: project structure leaves room for `lib/`, `config/`, `types/`, `middleware.ts`, `app/api/` (NFR-6).

### Implementation details

1. Initialise repo: `pnpm init`; commit `.gitignore` (Node, Next, env).
2. Install Next.js / React / TypeScript (see Dependencies to install below). Initialise App Router scaffold under `app/` with `app/layout.tsx`, `app/page.tsx`, `app/globals.css`.
3. Create `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `moduleResolution: "Bundler"`, path alias `@/*`.
4. Install Tailwind, postcss, autoprefixer; generate `tailwind.config.ts` and `postcss.config.js`; wire `app/globals.css` with `@tailwind base/components/utilities`.
5. Add `.eslintrc.cjs` extending `next/core-web-vitals` and a Prettier config (`.prettierrc`) with project conventions.
6. Add `eslint-plugin` rule blocks for `@typescript-eslint/no-explicit-any: "error"`.
7. Add `package.json` scripts: `dev`, `build`, `start`, `lint`, `test` (`echo "no tests yet" && exit 0` placeholder; P0-7 replaces with Vitest).
8. Verify `pnpm dev`, `pnpm build`, `pnpm lint` all succeed on the empty scaffold.
9. Add a `README.md` stub that names the project and the run command.

### Key constraints

1. The model reads, the code decides — D4/D5 (no runtime impact here, but folder layout must keep adapter / matching / triage separable; NFR-6).
2. p95 under 5s for verification — NFR-1 (project must be a long-running container, not a serverless cold-start trap; no work here beyond not closing future doors).
3. WCAG AA, colour + icon + text — NFR-2 (Tailwind is the chosen styling layer per techstack Frontend).
4. TypeScript strict, no `any`.
5. Rules in config — FR-25 (leave a `config/` directory placeholder; P0-4 fills it).
6. NFR-4: no persistence; no DB clients, no `prisma init`, no SQLite.

### Files to modify

_(none — this is a greenfield scaffold)_

### Files to create

1. `package.json` — pnpm scripts, deps.
2. `pnpm-lock.yaml` — generated.
3. `tsconfig.json` — strict TS, path alias `@/*`.
4. `next.config.mjs` — minimal Next config.
5. `tailwind.config.ts`, `postcss.config.js` — Tailwind plumbing.
6. `.eslintrc.cjs` — extends `next/core-web-vitals`, bans `any`.
7. `.prettierrc` — Prettier config.
8. `.gitignore` — Node, Next, `.env*`.
9. `app/layout.tsx`, `app/page.tsx`, `app/globals.css` — App Router shell with a Tailwind smoke-test class.
10. `README.md` — run/deploy stub.
11. Empty placeholder directories (with `.gitkeep`): `lib/`, `config/`, `types/`.

### Config / schema / store updates

_(not applicable — P0-4 introduces the config files)_

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] `pnpm dev` opens at `http://localhost:3000` and renders the default page.
- [ ] Open DevTools — no console errors.
- [ ] Run `pnpm lint` against a deliberately-bad file containing `const x: any = 1;` — confirm lint fails.
- [ ] Confirm `.env*` is ignored by git.

Eval: (not applicable in Phase 0).

Update docs: Mark P0-1 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- techstack.md — Language and Runtime; Frontend; Developer Tooling.
- systemsdesign.md — Architecture Overview (component layout the folder structure must leave room for).
- PRD.md §6 — cross-cutting NFR-6 (separation of concerns), NFR-2 (accessibility), NFR-4 (no persistence).

### Common gotchas

1. The App Router (`app/`) is required, not the older `pages/` router — every later ticket (P1-7 result API, P0-6 middleware) assumes route handlers under `app/api/`.
2. `strict: true` alone is not enough — set `noUncheckedIndexedAccess: true` so the matching engine in P1-3 cannot silently bypass index safety.
3. Do not add a serverless adapter (Vercel-only optimisations). Hosting is a single always-warm container per techstack Hosting; per-request cold starts violate NFR-1.
4. Do not install a database client, ORM, or session store. NFR-4 forbids persistence; the prototype is stateless.

### Definition of Done

Code complete when:
- [ ] `pnpm dev` boots and serves the default page with a Tailwind class visibly applied.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm lint` succeeds on the clean tree and fails on an `any`.
- [ ] No console or test errors.
- [ ] Folder layout leaves seams for `lib/provider`, `lib/matching`, `lib/triage`, `config/`, `types/` (NFR-6).

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/scaffold`, pushed, merged to main.

### Expected output

A bootable Next.js App Router project in TypeScript strict mode with Tailwind, ESLint, and Prettier. `pnpm dev`, `pnpm build`, `pnpm lint`, and `pnpm test` (stub) all succeed. The repo is ready for P0-2 to drop in domain types.

### Dependencies to install

```
pnpm add next react react-dom
pnpm add -D typescript @types/node @types/react @types/react-dom
pnpm add -D tailwindcss postcss autoprefixer
pnpm add -D eslint eslint-config-next prettier
```
