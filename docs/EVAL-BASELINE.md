# Eval baseline (P5-5)

The CI eval gate compares every run against a committed `eval-baseline.json` at the repo root. A regression on the headline safety metric — or any other tracked metric outside its configured tolerance — fails the build. This document is the contract for what the baseline is, what changes it, and how to move the bar deliberately.

## What `eval-baseline.json` is

A snapshot of the accepted metric levels on a clean main, plus the tolerance band around each one. It lives in the repo because the bar must be reviewable: a change to a tolerance, a change to a metric value, or a re-baseline is a normal PR with diff, owners, and history.

Fields:

- `version` — schema version of the baseline file itself.
- `created_at` — ISO timestamp of the run that produced these numbers.
- `golden_set_version` — SHA-256 of `tests/golden/index.ts`, the file that IS the golden manifest (see the note in `lib/eval/types.ts`). The runtime gate refuses to evaluate metrics when this hash does not match the current checkout; the only fix is a deliberate re-baseline.
- `metrics` — a parallel snapshot of `EvalReport`: false-negative rate, lane confusion, warning-check sub-accuracies, calibration ECE, per-field precision/recall, and latency (p50/p95/p99/max).
- `tolerances` — the per-metric noise bands the gate applies.

Why hash `tests/golden/index.ts` instead of a separate `manifest.json`: the typed array is already the source of truth; duplicating it as JSON would drift. Hashing the source file detects every meaningful edit — added red cases, renamed ids, tweaked fixtures — and is the minimum surface that makes "the golden set changed" a deterministic boolean.

## The headline metric

**False-negative rate on real mismatches.** Of the cases whose ground-truth lane is `mismatch` or `review`, what fraction did the pipeline clear into `match`?

The headline tolerance is `+0.0`. Any positive delta — even one extra leaked case — fails the build. This is intentional: in a compliance tool one missed defect is worse than two extra reviews, and the eval gate is the mechanism that protects that invariant from prompt edits, threshold tuning, or model swaps. Do not soften this tolerance to "0.001 for noise"; that is exactly the failure mode the gate exists to prevent.

## The other tolerances

Tracked metrics and the bands above which the gate fails:

| Metric | Direction | Tolerance |
| --- | --- | --- |
| `falseNegativeRate.rate` | lower-is-better | `+0.0` (headline) |
| `laneConfusion.overall` | higher-is-better | `−0.01` |
| `warningCheck.presence.accuracy` | higher-is-better | `−0.01` |
| `warningCheck.verbatim.accuracy` | higher-is-better | `−0.01` |
| `warningCheck.allCaps.accuracy` | higher-is-better | `−0.01` |
| `calibration.ece` | lower-is-better | `+0.02` |
| `latency.p95` | lower-is-better | hard ceiling at `5000 ms` (NFR-1) |

A move inside the tolerance is reported as a "regression within tolerance" — surfaced for review, not blocking.

The p95 latency is a hard ceiling rather than a delta: the gate fails the moment the run's p95 exceeds 5000 ms, regardless of where the baseline sat. NFR-1 frames the budget as an absolute number; the gate enforces it the same way.

## When to re-baseline

Re-baselining is a deliberate act with three legitimate triggers:

1. **The golden set expanded with new red cases.** Adding probes is how the bar moves up — the gate refuses to run with a manifest hash it doesn't recognise, which forces the conversation. After the manifest edit lands, run `pnpm eval` and commit the regenerated `eval-baseline.json` in the SAME PR or the immediately following one. The commit message convention below is non-optional.
2. **A stakeholder-approved threshold change.** The matching thresholds and lane rules live in config (FR-25). Tuning them changes the metric values, which is fine — but the new numbers ARE the new bar, and that requires a stakeholder sign-off and a fresh baseline.
3. **A bake-off-approved model swap.** P5-4 (the bake-off harness) is the gate's upstream sibling. If the bake-off recommends a model swap, the swap lands behind a re-baseline that captures the new model's numbers as the new floor.

Outside these triggers, do NOT touch `eval-baseline.json`. A baseline edit in an unrelated PR is silent loosening of the bar and is exactly what the gate exists to prevent.

## Commit-message convention

When you re-baseline, use:

```
eval-baseline: re-baseline after <reason>
```

`<reason>` is short and points at one of the three triggers above (e.g. `eval-baseline: re-baseline after adding 3 false-negative probes to the warning corpus`). The convention makes the act searchable in `git log` and impossible to slip past review.

## CI runs against the mock — by design

In CI, `pnpm eval --gate` runs against the deterministic mock adapter on the golden set. Live model calls in CI are flaky, slow, and expensive (NFR-3), and live calls from a public CI runner can't reach the production boundary anyway (A21). The mock's canned extractions are calibrated to the golden set so the regression signal is meaningful without a real model call.

Live runs happen out-of-band — `pnpm eval` against the configured provider on a developer machine, and `pnpm bakeoff` (P5-4) at model-swap time. The numbers from those runs do NOT update the baseline automatically; the bake-off recommendation is the input to a deliberate re-baseline, not a side effect of one.

## Advisory: `--dataset=corrections`

The corrections corpus (P5-3) accumulates daily as agents disagree with the tool. A regression on that dataset is meaningful — it's the closest thing to a live-traffic signal — but the corpus drifts, so a "regression" can mean the world changed (new edge cases coming in) rather than that the code did. The gate runs the corrections corpus in advisory mode: a regression there is logged and surfaced, but it does NOT fail the build. Treat it as a prompt to investigate; the conclusion may be "the golden set needs new probes" or "the matching rule needs tuning", at which point the deliberate re-baseline path above applies.

## Local workflow

```
pnpm eval --gate              # mock + golden set; compares to eval-baseline.json
pnpm eval                     # mock + golden set; writes a report, no gate
EVAL_PROVIDER=live pnpm eval  # live model; ad-hoc, no gate
pnpm bakeoff                  # P5-4 model comparison; no gate
```

The gate writes `eval-reports/<timestamp>/gate-result.md` alongside the normal `report.{json,md}`. On a failure the script exits non-zero and names every metric that crossed its tolerance in the log.
