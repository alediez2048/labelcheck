# P0-7 — CI and test harness

Wire Vitest into the project, replace the placeholder `pnpm test` script with the real runner, add a GitHub Actions workflow that runs lint + build + test on every push and PR, and stage a hook for the eval harness (P5-2) so a future model/prompt/threshold change can fail CI on a golden-set regression (P5-5).

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P0-7: CI and test harness.

Current state: (at start)
- [Paste P0-1..P0-6 actual output: Next.js + TS strict scaffold; `types/domain.ts`; provider adapter + mock; config store; image preproc; access gate.]

What's NOT done yet:
- [P0-7] Vitest not installed, `pnpm test` is a stub, no GitHub Actions workflow.
- [P1+] Acceptance tests (AC-1..AC-10) live in this harness.
- [P5-2] Offline eval harness plugs into the hook this ticket stages.
- [P5-5] CI eval gate (a regression fails the build) builds on the workflow this ticket creates.

TICKET-P0-7 Goal:
Replace the placeholder `pnpm test` with a real Vitest runner. Make existing test files from P0-2..P0-5 (`lib/provider/__tests__`, `lib/config/__tests__`, `lib/image/__tests__`) actually execute and pass. Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs `pnpm install`, `pnpm lint`, `pnpm build`, `pnpm test` on `push` and `pull_request`. Add a `pnpm test:eval` placeholder script and a `scripts/eval-harness.ts` stub that prints "Eval harness wired by P5-2" and exits 0, so the seam is named and reserved.

Check `package.json` test script and `.github/workflows/` before changes. Don't overwrite existing code.
Follow @techstack.md Testing and @PRD.md §6 (maintainability NFR-6, no PII / NFR-4 in test fixtures).
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P0-7 Scope

- Phase: Phase 0 — Foundations
- Time budget: 1.5h
- Dependencies: P0-1
- Branch: `feat/ci`

### Acceptance criteria

- [ ] Vitest installed (`vitest`, `@vitest/ui`); `vitest.config.ts` at repo root configures path alias `@/*` to mirror `tsconfig.json`.
- [ ] `pnpm test` runs Vitest (`vitest run`), exits 0 on green, non-zero on failure. `pnpm test:watch` runs `vitest`.
- [ ] At least one trivial passing test exists at `tests/smoke.test.ts` to prove the runner is wired (`expect(1 + 1).toBe(2)`).
- [ ] Existing test files in `lib/provider/__tests__`, `lib/config/__tests__`, `lib/image/__tests__` (from P0-3..P0-5) are discovered and pass (or are skipped with `it.todo` if their fixtures are not yet in place; the goal is a clean run, not a forced green).
- [ ] `.github/workflows/ci.yml` runs on `push` and `pull_request` against all branches; uses pnpm (`pnpm/action-setup`), Node 20 LTS, caches `~/.pnpm-store`; runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, `pnpm test`.
- [ ] The workflow runs end-to-end on a sample push and goes green.
- [ ] `pnpm test:eval` script exists and invokes `node --import tsx scripts/eval-harness.ts` (or `tsx scripts/eval-harness.ts`), which prints "Eval harness wired by P5-2" and exits 0.
- [ ] No applicant PII is committed in any test fixture (NFR-4); fixtures are synthetic or from the Public COLA Registry (A24).
- [ ] `pnpm lint`, `pnpm build`, `pnpm test` all succeed locally and in CI.

### Implementation details

1. Install Vitest: `pnpm add -D vitest @vitest/ui tsx`.
2. Create `vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";
   import path from "node:path";
   export default defineConfig({
     test: { environment: "node", include: ["{lib,tests,app}/**/*.{test,spec}.ts"], passWithNoTests: false },
     resolve: { alias: { "@": path.resolve(__dirname, ".") } },
   });
   ```
3. Update `package.json` scripts:
   - `"test": "vitest run"`
   - `"test:watch": "vitest"`
   - `"test:ui": "vitest --ui"`
   - `"test:eval": "tsx scripts/eval-harness.ts"`
4. Create `tests/smoke.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   describe("smoke", () => { it("runs", () => { expect(1 + 1).toBe(2); }); });
   ```
5. Audit `lib/provider/__tests__`, `lib/config/__tests__`, `lib/image/__tests__` — confirm they import from `vitest`, use the `@/` alias, and run green. If an image fixture is missing, mark the test `it.todo("...")` with a TODO comment; do NOT delete the test file.
6. Create `scripts/eval-harness.ts`:
   ```ts
   // Placeholder for P5-2 offline eval harness.
   // The hook this script stages will iterate the golden set, run the verification path
   // against the mock or live adapter, and assert per-field precision/recall, lane accuracy,
   // false-negative rate, warning-check accuracy, and confidence calibration (observability.md).
   console.log("Eval harness wired by P5-2 — not implemented in Phase 0.");
   process.exit(0);
   ```
7. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: { push: { branches: ["**"] }, pull_request: {} }
   jobs:
     verify:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: "pnpm" }
         - run: pnpm install --frozen-lockfile
         - run: pnpm lint
         - run: pnpm build
         - run: pnpm test
   ```
   Confirm the workflow runs on a sample PR and goes green.
8. Add a one-paragraph note to the README "Testing" section: how to run tests locally, what `pnpm test:eval` is (a P5-2 hook), and that no applicant PII is allowed in fixtures.
9. Confirm the access-gate env vars (`ACCESS_PASSCODE`, `ACCESS_COOKIE_SECRET`) are UNSET in CI so the gate is a no-op during `pnpm build` — otherwise build-time route checks may fail.

### Key constraints

1. **NFR-6: maintainability.** Tests must be runnable in one command; the runner must be standard (Vitest per techstack Testing).
2. **NFR-4: no PII.** No applicant PII in fixtures. Synthetic images from P0-5 and Public COLA Registry samples (A24) are the only legitimate sources.
3. **Eval harness is a STAGED HOOK, not an implementation.** Phase 0 names the seam; P5-2 fills it. Do not start the golden-set runner here — that ticket has its own scope.
4. **CI green on a trivial test** is the bar — the acceptance criterion explicitly says "CI green on a trivial test; eval-harness placeholder wired".
5. **TypeScript strict, no `any`** — applies to test files too.
6. **Do not skip lint or build in CI** — both are part of the standard DoD (TICKETS.md preamble).
7. **Pin pnpm + Node versions in CI** — `pnpm 9`, Node 20 LTS. A drift here causes spurious failures.

### Files to modify

- `package.json` (at start — paste real file content from prior ticket) — replace the `test` script stub, add `test:watch`, `test:ui`, `test:eval`.
- `README.md` (at start — paste real file content from prior ticket) — add the Testing section.
- Existing `__tests__/` files from P0-3, P0-4, P0-5 — confirm imports use `vitest` and the `@/` alias; mark `it.todo` for any test whose fixture is not yet committed.

### Files to create

1. `vitest.config.ts` — runner config with `@/` alias.
2. `tests/smoke.test.ts` — trivial passing test proving the runner is wired.
3. `scripts/eval-harness.ts` — placeholder stub for P5-2.
4. `.github/workflows/ci.yml` — lint + build + test on push/PR.

### Config / schema / store updates

_(not applicable — runner + CI only)_

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] `pnpm test` locally — Vitest runs and the smoke test plus the P0-3..P0-5 tests pass.
- [ ] `pnpm test:watch` — Vitest watches and reruns on edit.
- [ ] `pnpm test:eval` — prints the "wired by P5-2" message and exits 0.
- [ ] Push a branch with a failing test (`expect(true).toBe(false)`) — CI workflow runs and fails red. Revert.
- [ ] Open the GitHub Actions page — the most recent push shows the CI run green and the steps named `pnpm lint`, `pnpm build`, `pnpm test`.

Eval: (Phase 0 stages the hook; P5-2 implements the harness — confirm `pnpm test:eval` is callable and prints the placeholder message).

Update docs: Mark P0-7 done in TICKETS.md; add a DEV-LOG entry. With this, the Phase 0 exit criteria are met — note the exit in the DEV-LOG.

### Reference

- techstack.md — Testing (Vitest, focused on matching/triage logic, run against the mock).
- requirements.md — NFR-6 (maintainability), AC-10 (no PII to disk, verified by inspection).
- PRD.md §6 — cross-cutting maintainability; phase 5 ticket P5-2 (offline eval harness) + P5-5 (CI eval gate) build on this.
- observability.md — the golden-set evaluation surface that lives behind the `test:eval` script.

### Common gotchas

1. **The eval harness is a STAGED HOOK, not an implementation.** Phase 0 names the seam (`pnpm test:eval` → `scripts/eval-harness.ts`); P5-2 actually runs the golden set. If you find yourself building the golden set in this ticket, you are doing P5-2's job.
2. **Vitest needs the `@/` alias too** — the matching engine in P1-3 will import from `@/types` and `@/lib/config`, and Vitest does not read `tsconfig.json` aliases automatically. Define them in `vitest.config.ts`.
3. **No applicant PII in fixtures (NFR-4, AC-10).** All test images must be synthetic or sourced from the Public COLA Registry (A24). Never commit a real, unapproved label photo.
4. **Pin Node 20 LTS and pnpm 9 in CI** — letting CI float to "latest" guarantees a flaky build the day a new major lands. The local lockfile and the CI runner must agree.

### Definition of Done

Code complete when:
- [ ] Vitest installed and configured; `pnpm test` runs the runner.
- [ ] Smoke test passes; existing P0-3..P0-5 test files are discovered and pass (or are explicit `it.todo`).
- [ ] `scripts/eval-harness.ts` stub exists; `pnpm test:eval` calls it and prints the P5-2 placeholder message.
- [ ] `.github/workflows/ci.yml` runs lint + build + test on push and PR; the workflow goes green on the main branch.
- [ ] README documents how to run tests locally and what the eval hook is for.
- [ ] No applicant PII committed.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated (note: Phase 0 exit criteria met — app boots, mock adapter returns a structured extraction, types compile, CI runs).
- [ ] Committed to `feat/ci`, pushed, merged to main.

### Expected output

`pnpm test` runs Vitest locally and in CI. Every PR is gated on lint + build + test. The eval-harness hook is reserved at `pnpm test:eval` so P5-2 plugs in without re-wiring the CI. Phase 0 exits: the app boots, the mock adapter returns a structured extraction, types compile, and CI runs — every later phase is additive.

### Dependencies to install

```
pnpm add -D vitest @vitest/ui tsx
```

### Why

P0-7 turns Phase 0's compile-time guarantees into runtime ones. The 25 tests across 5 files prove the type-level guards from P0-3 through P0-6 (extraction has no `verdict` field, dispositions are whole-application, the A18 placeholder is still in place, the image cap really fires at the long edge, the access cookie round-trips and rejects garbage) are not just type-system theater — they execute and pass. That matters because every later ticket reads this test surface as the contract; if Phase 0 shipped with skipped or `it.todo` tests, P1's matching engine would inherit the skipped state and the regression catch would shift to whenever someone noticed.

Vitest is the right runner here for one specific reason: it's the standard the techstack already picked, and it reads our `@/*` alias from `vitest.config.ts` without a translator. We considered Jest — rejected because it doesn't understand ESM in 2026 without ts-jest plumbing, and the lint/build pipeline already runs Node ESM via Next.js. Jest would add a second module-resolution model that drifts from the rest of the project. We dropped the `declare function describe/it/expect` blocks the P0-3–P0-6 test files used as Vitest-ready scaffolding and replaced them with real `import { describe, it, expect } from "vitest"`. The diff is mechanical; the tests are unchanged in behaviour; the runtime assertions that were previously zero-effect declarations now actually execute. The build is also unchanged because Next's typechecker resolved the `declare` blocks the same way Vitest resolves the real imports.

The CI workflow pins **Node 20 LTS and pnpm 9** by version. A floating "latest" guarantees a flaky build the day a new major lands; the local lockfile and the CI runner must agree, and that's only possible when both are pinned. `pnpm install --frozen-lockfile` is the safety net for the case where a dev forgot to commit `pnpm-lock.yaml` — the CI fails loudly instead of silently resolving to whatever's newest. Test execution runs on Ubuntu rather than macOS because the deploy target (a single always-warm container per techstack Hosting) is Linux; catching a Linux-only `sharp` bug in CI is cheaper than catching it in production. `ACCESS_PASSCODE` and `ACCESS_COOKIE_SECRET` are explicitly emptied in the build step so the access gate stays a no-op during route collection — without that, Next's prerender of `/access` might fail in CI if a developer's shell happens to have the vars set.

The `pnpm test:eval` script is **reserved, not implemented**. We resisted the temptation to scaffold the golden-set walker here because P5-2 owns that scope; staging the seam without filling it means the CI workflow and the `package.json` script don't need to be re-plumbed when P5-2 lands. The placeholder prints a single line and exits 0 so a curious developer running it today sees a clear "this is wired by P5-2" rather than a "command not found" or a half-built runner. `tsx` is the install cost we accepted to make the eval-harness runnable as a TypeScript file directly (no separate build step for a one-shot script) — same package the Next ecosystem already uses for ad-hoc scripts.
