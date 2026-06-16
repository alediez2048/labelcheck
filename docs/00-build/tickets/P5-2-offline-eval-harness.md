# P5-2 — Offline eval harness

Build a runnable harness that executes the golden set end-to-end and reports the verification metrics observability.md names: per-field precision and recall, lane classification accuracy with confusion matrix, false-negative rate on real mismatches (the headline safety metric), government-warning check accuracy, confidence calibration error, and the latency distribution against the five-second budget.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P5-2: Offline eval harness.

Current state: (at start)
- [list what is DONE so far, with checks, including the Phase 1 golden set assembled in P1-10 (tests/golden/*), the verification pipeline, the OTel tracing from P5-1, and the CI hook placeholder from P0-7]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: per-metric report writers, the calibration curve output, the agent-correction feedback loop (P5-3), the model bake-off (P5-4), and the CI eval gate (P5-5)]

TICKET-P5-2 Goal:
Stand up an offline eval runner that takes the golden set assembled in P1-10 — real green pairs from the Public COLA Registry plus synthesized red cases (assumptions A24 to A26) — runs the full verification pipeline end-to-end against the configured provider (mock by default; live model when keyed), and produces a metrics report. The headline number is the false-negative rate on real mismatches: a non-compliant label mistakenly cleared into the match lane is the costly error, and observability.md elevates it above aggregate accuracy. The output is JSON for machines, a Markdown summary for humans, and the foundation that P5-4 (bake-off) and P5-5 (CI gate) read.

Check tests/golden/, lib/extraction, lib/matching, lib/triage, and the result API before starting. Don't overwrite existing code; the harness invokes them.
Follow @observability.md (Offline evaluation — the metrics list, confidence calibration explanation) and @systemsdesign.md (D5 — calibration validates the code-derived confidence).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-11).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output. Most likely P5-1 — the tracing seam.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-2 Scope

- Phase: Phase 5 — Evals and observability
- Time budget: 4h
- Dependencies: P1-10 (golden set assembled), P5-1 (tracing — the harness reads spans where useful)
- Branch: feat/evals

### Acceptance criteria

- [ ] A single command (`pnpm eval` or `pnpm tsx scripts/eval.ts`) runs the entire golden set through the pipeline and produces a metrics report (observability.md: Offline evaluation).
- [ ] Per-field precision and recall reported for each of: brand, type, ABV, net contents, producer, origin, warning (observability.md: Per-field precision and recall).
- [ ] Lane classification accuracy with a 3x3 confusion matrix (match / mismatch / review predicted vs. actual) (observability.md: Lane classification accuracy).
- [ ] **Headline metric**: false-negative rate on real mismatches — the count of golden-set items whose ground-truth lane is `mismatch` (or `review` for warning failures) but which the system cleared into `match`. This is the primary safety metric and is printed first in the summary (observability.md: False-negative rate on real mismatches).
- [ ] Government-warning check accuracy reported separately, with breakdowns for presence, verbatim wording, and ALL CAPS detection (observability.md: Government-warning check accuracy; FR-11).
- [ ] Confidence calibration curve output: bucketed predicted confidence vs. observed accuracy, plus an expected calibration error (ECE) number. Validates D5 — if the code-derived confidence does not track correctness, the lane thresholds are wrong (observability.md: Confidence calibration; D5).
- [ ] Latency distribution reported (p50, p95, p99) against the five-second budget (NFR-1; observability.md: Latency distribution; A12).
- [ ] Report written to `eval-reports/{timestamp}/report.json` and `eval-reports/{timestamp}/report.md`.
- [ ] The harness is provider-agnostic — it runs against the mock adapter for deterministic CI, and against a live model when an env-driven flag flips it. This is the seam P5-4 (bake-off) extends.
- [ ] No PII written to the report; trace IDs are stored but applicant text is hashed (consistent with P5-1).

### Implementation details

- Add a `scripts/eval.ts` runner. Inputs: a golden-set manifest (`tests/golden/manifest.json` from P1-10) listing each case with its ground-truth fields, ground-truth lane, and a path to the bundled fixture images. Outputs: the JSON + Markdown report under `eval-reports/{ISO timestamp}/`.
- The runner loops the manifest, calls the same verify API path the UI does (or invokes the pipeline directly to avoid HTTP overhead), captures the per-field verdict, the assigned lane, the code-derived confidence, and the measured latency.
- Compute per-field precision/recall at `lib/eval/metrics/perField.ts`. For each field define what counts as a positive prediction (verdict = mismatch) and ground truth (the manifest's `expected_verdict_per_field`), and produce P/R.
- Compute lane confusion at `lib/eval/metrics/laneConfusion.ts`. Output a 3x3 matrix and the per-lane accuracy.
- Compute the false-negative rate at `lib/eval/metrics/falseNegativeRate.ts`. Definition: `count(ground_truth_lane in {mismatch, review} AND predicted_lane == match) / count(ground_truth_lane in {mismatch, review})`. This is the safety metric — print it first.
- Compute warning-check accuracy at `lib/eval/metrics/warningCheck.ts` — three sub-numbers: presence accuracy, verbatim-wording accuracy, ALL CAPS detection accuracy. Tie to the warning defect set in FR-12 and the synthesized red cases (A25).
- Compute confidence calibration at `lib/eval/metrics/calibration.ts`. Bucket predicted confidence into 10 deciles, compute observed accuracy per bucket, render a text table (ASCII) and emit ECE. Reference: https://en.wikipedia.org/wiki/Calibration_(statistics).
- Compute latency distribution at `lib/eval/metrics/latency.ts` — p50, p95, p99 from the measured per-case timings. Flag any case that exceeds 5s.
- The Markdown report (`report.md`) leads with the false-negative rate and the lane confusion matrix, then warning-check, then calibration, then per-field P/R, then latency. The JSON (`report.json`) is the same data, structured.
- Add a `pnpm eval` script in `package.json` that runs `tsx scripts/eval.ts`.
- The golden-set manifest schema lives at `lib/eval/types.ts` so P5-4 (bake-off) can import the same types.

### Key constraints

1. The headline metric is the false-negative rate, not aggregate accuracy. A compliance tool that misses one mismatch is worse than one that flags two extra reviews (observability.md: Why This Matters Here).
2. Calibration validates D5 — the code-derived confidence is only useful if it tracks correctness. The calibration curve is how that claim gets tested.
3. The golden set is green pairs from the Public COLA Registry (A24) plus synthesized red cases (A25, A26). Do not use public OCR benchmarks; TTB labels are graphic-design-heavy and public benchmarks do not predict performance here (observability.md: Production model bake-off; techstack.md: Model Selection).
4. The harness is provider-agnostic by design — runs deterministically against the mock for CI, and against a live model when keyed. P5-4 (bake-off) extends this by iterating provider configs.
5. No applicant PII written to the report — use the same redaction layer as P5-1 (`lib/observability/redact.ts`).
6. NFR-11 — the harness is part of the deliverable, not an afterthought; this is how the accuracy bar gets set and enforced.

### Files to modify

- `tests/golden/manifest.json` (at start — paste real content from P1-10) — confirm each case carries `expected_verdict_per_field`, `expected_lane`, and a stable `case_id`. Extend if any field is missing.
- `package.json` — add `"eval": "tsx scripts/eval.ts"` to scripts.
- `lib/observability/redact.ts` (at start — paste real content from P5-1) — reuse, no change.

### Files to create

1. `scripts/eval.ts` — the runner entrypoint.
2. `lib/eval/types.ts` — `GoldenCase`, `EvalResult`, `EvalReport` types.
3. `lib/eval/runner.ts` — loops the manifest, invokes the pipeline, collects results.
4. `lib/eval/metrics/perField.ts` — per-field precision/recall.
5. `lib/eval/metrics/laneConfusion.ts` — 3x3 confusion matrix and per-lane accuracy.
6. `lib/eval/metrics/falseNegativeRate.ts` — the headline safety metric.
7. `lib/eval/metrics/warningCheck.ts` — presence / verbatim / ALL CAPS accuracy.
8. `lib/eval/metrics/calibration.ts` — 10-bucket calibration curve and ECE.
9. `lib/eval/metrics/latency.ts` — p50, p95, p99 with 5s flag.
10. `lib/eval/report/markdown.ts` — renders the Markdown summary.
11. `lib/eval/report/json.ts` — renders the structured JSON.
12. `tests/eval/metrics.test.ts` — unit tests for each metric function on small hand-crafted inputs (so a bug in P/R math gets caught here, not in CI noise).
13. `eval-reports/.gitkeep` — directory for output.

### Config / schema / store updates

- Add `eval-reports/` to `.gitignore` (the reports are run artifacts, not checked-in source). Keep the `.gitkeep`.
- New env var: `EVAL_PROVIDER` (mock | live) — controls which adapter the runner uses.
- Golden-set manifest schema documented at the top of `lib/eval/types.ts`.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm eval
```

Manual:
- [ ] Run `pnpm eval` against the mock adapter; confirm the run completes and writes a report under `eval-reports/{timestamp}/`.
- [ ] Open `report.md`; confirm the false-negative rate is the FIRST metric shown.
- [ ] Confirm the calibration table prints 10 confidence buckets with the observed accuracy per bucket, and the ECE number.
- [ ] Confirm the lane confusion matrix matches by hand against at least three known cases from the golden set.
- [ ] Plant a deliberate bug (e.g. force the triage classifier to always return `match`); rerun; confirm the false-negative rate spikes and the report makes the cause obvious.
- [ ] Confirm no applicant text appears unredacted in `report.json` or `report.md`.

Eval: this ticket IS the eval system. The harness it stands up is what P5-4 (bake-off) and P5-5 (CI gate) will drive. Update observability.md if any metric definition was sharpened during implementation.

Update docs: mark P5-2 done in TICKETS.md; add a DEV-LOG entry; add a top-of-file note in `scripts/eval.ts` documenting the invocation.

### Reference

- @observability.md — Offline evaluation (the golden set), the metric list (per-field P/R, lane accuracy, false-negative rate, warning-check accuracy, confidence calibration, latency distribution), Privacy.
- @requirements.md — NFR-11 (observability and evals); NFR-1 (latency); FR-11, FR-12 (warning check).
- @systemsdesign.md — D5 (confidence in code — what the calibration curve validates).
- @assumptions.md — A24 (Public COLA Registry for green pairs), A25 (synthesized red cases), A26 (AI-generated labels OK as test inputs).
- ECE reference: https://arxiv.org/abs/1706.04599 (Guo et al. — calibration of modern networks).

### Common gotchas

1. **Golden set composition.** Green pairs from the Public COLA Registry (A24); red cases are synthesized by perturbing form values against real labels, or by generating labels with planted defects (A25, A26). The headline metric is FALSE-NEGATIVE RATE on real mismatches — non-compliant labels mistakenly cleared into the match lane. That is the costly error in a compliance tool (observability.md: Why This Matters Here).
2. **Calibration curve validates D5.** If the code-derived confidence does not track observed accuracy, the lane thresholds are wrong and need retuning. This is exactly the evidence the doc says we should tune lane thresholds on, "rather than guesswork".
3. **No public OCR benchmarks.** TTB labels are graphic-design-heavy, not clean forms. Public OCR leaderboards do not predict performance here. Build the eval on the golden set of real TTB labels (observability.md: Production model bake-off).
4. **The headline metric leads the report.** Print false-negative rate first in `report.md`. If a reader stops after the first heading, they should still know the safety number.

### Definition of Done

Code complete when:
- [ ] `pnpm eval` runs end-to-end against the mock adapter and writes a report.
- [ ] All six metric families (per-field P/R, lane confusion, false-negative rate, warning check, calibration with ECE, latency) appear in the report.
- [ ] Unit tests for each metric function pass.
- [ ] Provider swap by `EVAL_PROVIDER` env works.
- [ ] No PII in the output report.
- [ ] No console errors; no test failures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm eval` pass.
- [ ] Manual checks above ticked.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/evals, pushed, merged to main.

### Expected output

Running `pnpm eval` produces a timestamped report directory containing a structured JSON and a Markdown summary, with the false-negative rate on real mismatches printed first, followed by lane confusion, warning-check accuracy, the calibration curve and ECE, per-field precision/recall, and the latency distribution. The harness is the substrate P5-4 (bake-off) and P5-5 (CI gate) build on.

### Dependencies to install

```
pnpm add -D tsx
```

(No runtime deps required — Vitest is already in the toolchain, and the metric math is pure TypeScript.)

---

## Outcome — done 2026-06-16

**Branch:** `feat/evals`
**Status:** Done — 409 tests pass + 1 skipped (+12 new); lint + build clean.
**Workflow:** Single-agent (sequential — metrics feed report writers feed runner).

**What landed:**
- `lib/eval/{types,runner}.ts` + `lib/eval/metrics/{perField,laneConfusion,falseNegativeRate,warningCheck,calibration,latency}.ts` + `lib/eval/report/{json,markdown}.ts`.
- `scripts/eval.ts` — entrypoint. Writes `eval-reports/<ISO>/{report.json, report.md}`.
- `lib/verify/runVerification.ts` — added optional `warningConfig?` parameter; threaded into `matchApplication`. Route handler unchanged.
- `package.json` — `"eval"` script. `.gitignore` — `eval-reports/`. `README.md` — Eval section.
- `tests/eval/metrics.test.ts` — 12 hand-crafted-input unit tests.

**Mock-adapter run (9 cases):**
- Headline: **0 / 7 = 0.0% false-negative rate.**
- Lane confusion: 100% overall accuracy (2/2 match, 6/6 mismatch, 1/1 review).
- Warning check: 88.9% (presence + verbatim + ALL CAPS).
- Calibration: ECE 0.1111 (one near-miss in [0.0, 0.1); 8 in [0.9, 1.0]).
- Latency: p50=2ms / p95=10ms / max=10ms — no budget breaches.

**Deviations:**
- No `manifest.json` — the typed array at `tests/golden/index.ts` IS the manifest (the spec itself called this out).
- `RunOptions.warningConfig: null` opts out of canonical injection — debug surface.
- Runner restores `process.env.PROVIDER` in a `try/finally` so subsequent invocations aren't polluted (matters for P5-4 bake-off).
- Warning sub-metrics share ground truth (documented inline); sharper labels need a future manifest extension.

### Why

P5-2 turns "the AC sentences are true" (P1-10) into "and here's the measurement to prove it stays true". The same code path runs in CI assertions AND in the eval harness; the harness emits structured numbers instead of pass/fail. P5-4 extends by iterating providers; P5-5 wraps with the fail-if-FN-rate-regresses contract.

The **headline-first ordering** is the same posture P3-1's batch UI took: the costly error first. A reader stopping after the first heading still knows the safety number. "98.7% accuracy" can hide the one false negative that matters.

The **calibration curve validates D5** in measurement form. The 10-bucket table + ECE makes "code-derived confidence tracks observed correctness" testable. A future maintainer who calibrates lane thresholds in `config/tolerances.json` now has evidence: sweep the threshold, rerun `pnpm eval`, watch ECE move. Without the table, threshold tuning is guesswork.

The **provider-agnostic seam** (`EVAL_PROVIDER` env) is the substrate P5-4 iterates. The mock default keeps CI deterministic and secret-free; the live run is one env flip.

The **`warningConfig?` parameter on `runVerification`** is the right shape for the A18 placeholder. Phase 1 tests inject via `vi.spyOn`; the eval harness can't use vi. Threading the parameter through gives clean access without monkey-patching. Route handler doesn't pass the param, so production is unchanged.

The **report under `eval-reports/<ISO>/`** keeps every run as a separate artifact. Sweeping a threshold means N runs producing N report dirs; comparing them is a diff. Gitignored — run artifacts, not source.

The **12 unit tests on hand-crafted inputs** keep the metric math honest. A bug in the F1 denominator or the ECE formula would silently pollute every report; the unit tests catch the math, not the integration.
