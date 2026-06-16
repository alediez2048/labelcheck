# P5-5 — CI eval gate

Wire the eval harness into CI so any prompt, model, or threshold change that regresses the golden set — and in particular any change that worsens the false-negative rate on real mismatches — fails the build before it merges.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P5-5: CI eval gate.

Current state: (at start)
- [list what is DONE so far, with checks, including the P5-2 eval harness with the metric report, the P5-3 corrections corpus and `--dataset=corrections` flag, and the P5-4 multi-provider bake-off]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: the baseline-metrics file, the regression-gate comparator, the CI workflow extension, and the documentation of what triggers a re-baseline]

TICKET-P5-5 Goal:
Treat the eval harness the same way unit tests gate code: a prompt change, a model swap, a threshold tune, or any matching-logic edit must not regress the golden set, and in particular must not push the false-negative rate above the committed baseline. The gate runs in CI on every PR, compares the run against a versioned `eval-baseline.json` in the repo, and fails the build on any regression that crosses the configured tolerance. The Improvement Cycle (observability.md) only closes if changes that ship pass through this gate.

Check scripts/eval.ts, lib/eval/metrics/, .github/workflows/ (or the existing CI config), and any baseline file from P5-2 before starting. Don't overwrite existing code; extend the harness and the workflow.
Follow @observability.md (The Improvement Cycle — Gate; eval runs act as a CI gate, the same way unit tests gate code) and @systemsdesign.md (D4 — the matching logic is testable by design).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-11).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output. Most likely P5-4 — the multi-provider bake-off and the per-provider report shape.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-5 Scope

- Phase: Phase 5 — Evals and observability
- Time budget: 2h
- Dependencies: P5-2 (eval harness with metrics report)
- Branch: feat/eval-gate

### Acceptance criteria

- [ ] A committed `eval-baseline.json` at the repo root captures the current accepted metric levels: false-negative rate, lane confusion accuracy, warning-check accuracy (presence / verbatim / ALL CAPS sub-numbers), calibration ECE, per-field precision/recall, and p95 latency (observability.md: Improvement Cycle — Gate).
- [ ] A new harness mode (`pnpm eval --gate`) runs the golden set, computes the metric report, and compares it against `eval-baseline.json`.
- [ ] The gate fails on **any regression on the headline metric**: if the run's false-negative rate is higher than the baseline by more than the configured tolerance (default `+0.0` — i.e. no regression), the process exits non-zero with a clear, structured failure message naming the metric, the baseline, the run value, and the tolerance.
- [ ] The gate fails on additional regressions outside tolerance: lane accuracy down by more than `0.01`, warning-check accuracy down by more than `0.01`, calibration ECE up by more than `0.02`, p95 latency up beyond 5 seconds. Tolerances live in `eval-baseline.json` so they are reviewable, not hard-coded (FR-25 discipline applied to evals).
- [ ] The gate writes a `gate-result.md` summary (which baseline it compared against, which metrics regressed and by how much, which improved) alongside the run report.
- [ ] CI workflow (`.github/workflows/ci.yml` or the existing equivalent) runs `pnpm eval --gate` on every pull request and on every push to `main`, against the mock adapter for determinism (live model calls are not in CI by default).
- [ ] CI fails the build when the gate fails. The failure message in the workflow log points at `gate-result.md` so the diff is obvious without re-running locally.
- [ ] An `eval-baseline.json` update is its own explicit commit message convention (`eval-baseline: re-baseline after <reason>`), documented in `docs/EVAL-BASELINE.md` so re-baselining is a deliberate, reviewable act and not a silent loosening of the bar.
- [ ] The gate also runs on the `--dataset=corrections` corpus from P5-3 in a non-blocking advisory mode (a regression there is surfaced but does not fail the build, because the corpus changes daily as new dispositions come in). Documented in `docs/EVAL-BASELINE.md`.

### Implementation details

- Create `eval-baseline.json` at the repo root by running `pnpm eval` against the mock adapter on the current build and writing the headline numbers. Include a `version`, a `created_at` timestamp, the golden-set version (a hash of `tests/golden/manifest.json`), and the tolerance object.
- Add a `--gate` flag to `scripts/eval.ts`. When set:
  - Run the eval as usual.
  - Load `eval-baseline.json`.
  - Compare metrics against the baseline using `lib/eval/gate/compare.ts`.
  - Write `eval-reports/{timestamp}/gate-result.md` with the diff.
  - Exit 0 if all regressions are within tolerance; exit 1 with the structured failure message otherwise.
- `lib/eval/gate/compare.ts`:
  - Inputs: current `EvalReport`, baseline `EvalBaseline`.
  - Returns a `GateResult` with `passed: boolean`, `regressions: Regression[]`, `improvements: Improvement[]`.
  - Headline metric (false-negative rate) is checked first; if it regresses, the gate fails regardless of any other improvement.
- `lib/eval/gate/baseline.ts` — read/write the baseline file with a schema validator (zod). Reject mismatched golden-set version (re-baseline must follow a manifest change explicitly).
- `lib/eval/gate/report.ts` — emit `gate-result.md`. Sections: headline (false-negative rate, baseline vs. run vs. delta), other regressions, improvements, baseline metadata.
- Extend the CI workflow:
  ```yaml
  - name: Eval gate
    run: pnpm eval --gate
    env:
      EVAL_PROVIDER: mock
  - name: Upload gate report
    if: always()
    uses: actions/upload-artifact@v4
    with:
      name: eval-gate-report
      path: eval-reports/
  ```
  - The artifact upload runs always so the failure case still ships the diff.
- Add `docs/EVAL-BASELINE.md` documenting:
  - What `eval-baseline.json` is and why it lives in the repo.
  - The headline metric and the tolerances.
  - When to re-baseline (e.g. golden-set expanded with new red cases, a stakeholder-approved threshold change, a model swap that was bake-off-approved in P5-4).
  - The commit message convention.
  - The advisory `--dataset=corrections` run and how to investigate it.

### Key constraints

1. **The headline metric is non-negotiable.** The false-negative rate must not regress, period. Default tolerance `+0.0`. Other tolerances exist for noise; this one does not.
2. **Tolerances are config, not code.** They live in `eval-baseline.json` (FR-25 spirit applied to the eval bar). A change to a tolerance is a reviewable PR.
3. **Re-baselining is deliberate.** A passing gate on a stricter baseline is the only way to move the bar; silent loosening is exactly the failure mode this ticket prevents. The commit message convention and `docs/EVAL-BASELINE.md` enforce that.
4. **CI runs against the mock by default.** Live model calls in CI are flaky and expensive. The mock adapter returns deterministic extractions calibrated to the golden set, so the regression signal is meaningful even without a real model call (D8 swappable provider; A11 hosted model in prototype).
5. **D4 / NFR-6** — the matching logic is testable by design. The eval gate is the same idea promoted to system-level: the AI pipeline is also testable by design when wrapped in the harness.
6. **NFR-11** — the gate is named in observability as the mechanism that lets every later change ship safely. This ticket delivers that mechanism.

### Files to modify

- `scripts/eval.ts` (at start — paste real content from P5-2 and P5-4 extensions) — add the `--gate` flag.
- The CI workflow file (at start — paste real content from P0-7) — add the eval-gate step and the artifact upload.
- `package.json` — add `"eval:gate": "tsx scripts/eval.ts --gate"` for local invocation convenience.

### Files to create

1. `eval-baseline.json` — committed baseline metrics with tolerances and golden-set version.
2. `lib/eval/gate/compare.ts` — the regression-detection logic.
3. `lib/eval/gate/baseline.ts` — load/save with zod schema validation.
4. `lib/eval/gate/report.ts` — `gate-result.md` writer.
5. `tests/eval/gate/compare.test.ts` — unit tests covering: headline regression (must fail), lane-accuracy regression within tolerance (must pass), lane-accuracy regression outside tolerance (must fail), latency over budget (must fail), all-improved run (must pass with improvements listed), golden-set version mismatch (must fail loudly).
6. `docs/EVAL-BASELINE.md` — the human-facing documentation of the baseline mechanism.

### Config / schema / store updates

- `eval-baseline.json` is committed source (the bar lives in the repo).
- `eval-reports/` remains gitignored (run artifacts).
- No new env vars.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm eval --gate     # must pass against the committed baseline on a clean main
```

Manual:
- [ ] On a clean checkout, run `pnpm eval --gate`; confirm it passes against the committed baseline.
- [ ] Plant a deliberate regression (e.g. flip the lane priority so a clear mismatch lands in `match`); rerun `pnpm eval --gate`; confirm it exits non-zero and `gate-result.md` names false-negative rate as the failing metric.
- [ ] Plant a within-tolerance noise (e.g. lane accuracy down by 0.005 with `0.01` tolerance); rerun; confirm the gate passes and the report lists the change as a regression-within-tolerance, not a failure.
- [ ] Modify `tests/golden/manifest.json` to add a red case; rerun without re-baselining; confirm the gate fails with the golden-set-version mismatch error and the documented re-baseline path is referenced.
- [ ] Push a branch with a deliberate regression; confirm the CI workflow run fails and the `eval-gate-report` artifact is downloadable.

Eval: this ticket COMPLETES the eval system. P5-1 instruments, P5-2 measures, P5-3 captures real ground truth, P5-4 chooses the model, and P5-5 gates the bar. With this in place, every later change ships through the same gate.

Update docs: mark P5-5 done in TICKETS.md; add a DEV-LOG entry; publish `docs/EVAL-BASELINE.md`; add a one-line note to observability.md confirming the gate is live.

### Reference

- @observability.md — The Improvement Cycle (Capture → Measure → Gate → Alert → Improve); Gate ("a change to a prompt, a model, a threshold, or the retrieval setup must not regress the golden set"); Open Items ("the accuracy bar itself ... needs a stakeholder decision; observability is how it is then enforced").
- @requirements.md — NFR-11 (observability and evals); NFR-1 (latency, gated here against p95 ≤ 5s); FR-25 (rules in config — extended to tolerances).
- @systemsdesign.md — D4 (model reads / code decides — the matching logic is testable by design); D8 (swappable provider — CI runs against the mock).
- @assumptions.md — A21 (production cannot call public APIs — the gate runs against the mock in CI for that reason too).
- @PRD.md — Phase 5 exit criteria: "a change that regresses the golden set fails CI".

### Common gotchas

1. **A prompt, model, or threshold change must NOT regress the golden set. Fail the build if false-negative rate worsens.** That is the headline behaviour. Default tolerance for the headline metric is `+0.0` — a single missed real mismatch on a new run that was caught on the baseline is a gate failure.
2. **Re-baselining is a deliberate, reviewable act.** Use the documented commit-message convention (`eval-baseline: re-baseline after <reason>`); do not amend the baseline silently in an unrelated PR. The golden-set version embedded in `eval-baseline.json` forces a re-baseline conversation whenever the manifest changes.
3. **CI runs against the mock for determinism.** Live model calls in CI are flaky, slow, and expensive (NFR-3). The mock adapter's extractions are calibrated to the golden set so the regression signal is meaningful. Live runs happen out-of-band via `pnpm eval` against the configured provider, and at bake-off time via `pnpm bakeoff` (P5-4).
4. **The corrections corpus runs advisory, not blocking.** It drifts daily as new dispositions arrive (P5-3), and a regression there can mean the world changed, not that the code did. Investigate, then decide whether to re-baseline.

### Definition of Done

Code complete when:
- [ ] `eval-baseline.json` is committed and reflects the current accepted metric levels.
- [ ] `pnpm eval --gate` passes against the committed baseline on a clean main.
- [ ] A planted regression fails the gate with a clear `gate-result.md`.
- [ ] CI runs the gate on every PR and on `main` pushes, uploads the report as an artifact, and fails the build on a real regression.
- [ ] Golden-set version mismatch is detected and reported.
- [ ] `docs/EVAL-BASELINE.md` is published.
- [ ] No console errors; no test failures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm eval --gate` pass.
- [ ] Manual checks above ticked (including the planted-regression PR).
- [ ] TICKETS.md and DEV-LOG updated; `docs/EVAL-BASELINE.md` published; observability.md amended with the gate-live note.
- [ ] Committed to feat/eval-gate, pushed, merged to main.

### Expected output

The eval harness now gates the build. A prompt, model, or threshold change that regresses the golden set — and especially one that raises the false-negative rate on real mismatches — fails the CI run with a structured diff, blocking the merge. With this in place, Phase 5 is complete: traces capture, evals measure, the agent-correction loop labels, the bake-off picks, and the gate enforces. Every later change ships safely.

### Dependencies to install

```
(none — the gate is pure TypeScript over the existing eval harness)
```

---

## Outcome (2026-06-16)

**Branch:** `feat/eval-gate` · **Status:** Done — Phase 5 complete

Single-agent build. Sequential work: baseline schema → comparator → markdown writer → `--gate` flag → CI step → docs.

**Landed:**

- `eval-baseline.json` (repo root) — seeded from a fresh mock + golden-set run. `version: 1`, `created_at`, `golden_set_version` = SHA-256 of `tests/golden/index.ts`, full metric snapshot (`falseNegativeRate.rate=0`, `laneConfusion.overall=1`, three warning-check accuracies, ECE, full `perField` table, p95), tolerances (FN-rate `0.0`, lane/warning sub-checks `0.01`, ECE `0.02`, `latencyP95BudgetMs: 5000`).
- `lib/eval/gate/baseline.ts` — zod schema + `loadBaseline`, `writeBaseline`, `computeGoldenSetVersion`.
- `lib/eval/gate/compare.ts` — `compareToBaseline(report, baseline, currentGoldenSetVersion): GateResult`. Order: golden-set version mismatch fails fast; headline FN-rate any-positive-delta-beyond-tolerance fails; per-metric regressions outside tolerance fail; within-tolerance noise captured separately; improvements listed.
- `lib/eval/gate/report.ts` — `buildGateMarkdown(result, baseline, report)`. Sections: PASS/FAIL → headline metric → out-of-tolerance regressions → within-tolerance regressions → improvements → baseline metadata. Version-mismatch path renders a remediation pointer to `docs/EVAL-BASELINE.md`.
- `scripts/eval.ts` — `--gate` flag. Runs mock + golden, loads baseline, compares, writes `gate-result.md`. Pass: `[gate] PASS — headline FN-rate …`, exit 0. Fail: structured `[gate] FAIL — N metric(s) outside tolerance` block naming each failing metric (baseline → run → delta → tolerance), exit 1. `--gate` collides with `--providers=`.
- `package.json` — `"eval:gate": "tsx scripts/eval.ts --gate"`.
- `.github/workflows/ci.yml` — `Eval gate (P5-5)` step after the existing `pnpm test:guardrails` (`EVAL_PROVIDER: mock`); `Upload eval gate report` artifact step with `if: always()`.
- `docs/EVAL-BASELINE.md` — published. What the baseline is, the headline metric and tolerances, when to re-baseline, the commit-message convention (`eval-baseline: re-baseline after <reason>`), the advisory `--dataset=corrections` run.
- `docs/02-design/observability.md` — single-line "live as of P5-5" note in the Improvement Cycle / Gate section.
- `tests/eval/gate/compare.test.ts` — 9 unit tests pinning the headline-tolerance behaviour, within-tolerance handling, version-mismatch fail-fast, and the all-improved path.
- `tests/eval/gate/baseline.test.ts` — 4 tests on the zod schema + golden-set-version stability.

**Verification:** `pnpm lint` clean. `pnpm build` clean. `pnpm test` 453 passing (+13). `pnpm eval --gate` passes on the committed baseline: `[gate] PASS — headline FN-rate 0.0% (baseline 0.0%, tolerance +0)`.

**Deviations from spec:**

- p95 latency is treated as a hard ceiling (`current > latencyP95BudgetMs`) rather than a delta-vs-baseline + tolerance. NFR-1 frames p95 as an absolute budget and the spec field is literally named `latencyP95BudgetMs` — both pointed at the absolute interpretation. Documented in `docs/EVAL-BASELINE.md`.
- Advisory `--dataset=corrections` CI step NOT wired. The corpus is gitignored, so a fresh CI checkout has zero records — the step would no-op every time. The run remains invokable locally and is documented; wiring it as a CI step belongs in P6 once the corpus moves to a governed store (P6-2).
- Golden-set version is the SHA-256 of `tests/golden/index.ts` directly rather than a separate `tests/golden/manifest.json`. The `GOLDEN_SET` array IS the manifest; hashing it detects every meaningful change without a second file to keep in sync.

### Why

P5-5 closes Phase 5's Improvement Cycle: P5-1 instrumented, P5-2 measured, P5-3 labelled with agent corrections, P5-4 picked the model, and P5-5 enforces the bar. Without the gate, every other piece is descriptive — a number on a report. With it, the eval harness becomes a contract: a prompt change, a model swap, a threshold tune, or a matching-logic edit cannot regress the headline metric and merge. The headline tolerance is exactly `0.0` because the headline metric is missed real mismatches — a single new false-negative is exactly the failure mode the system exists to prevent, and softening to `0.001` "for noise" would silently allow that failure mode to leak in. The golden-set version embedded in the baseline forces re-baselining to be a deliberate, conversation-having act. The artifact upload `if: always()` ships the structured diff for review without forcing a re-run locally.
