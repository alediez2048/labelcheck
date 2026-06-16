/**
 * P5-5 — CI eval gate: `gate-result.md` writer.
 *
 * Renders the structured `GateResult` into the human-skimmable diff the
 * operator pulls from the CI artifact. Section order is deliberate:
 *
 *   1. Top-line pass / fail headline.
 *   2. Headline metric (false-negative rate) row with baseline, run,
 *      delta, tolerance.
 *   3. Out-of-tolerance regressions — what failed the build.
 *   4. Within-tolerance regressions — noise wobbles to keep an eye on.
 *   5. Improvements — moves the right way.
 *   6. Baseline metadata — version, golden-set hash, created_at.
 *
 * On a golden-set version mismatch, the writer switches modes and
 * renders a remediation pointer to `docs/EVAL-BASELINE.md` instead of
 * a metric diff — the only fix is a deliberate re-baseline.
 */

import type { EvalReport } from "../types";

import type { EvalBaseline } from "./baseline";
import type { GateResult, Improvement, Regression } from "./compare";

function pct(value: number, digits: number = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number, digits: number = 4): string {
  return value.toFixed(digits);
}

function signedDelta(delta: number, digits: number = 4): string {
  const v = delta.toFixed(digits);
  return delta >= 0 ? `+${v}` : v;
}

function regressionRows(rows: ReadonlyArray<Regression>): string[] {
  const lines: string[] = [];
  lines.push("| Metric | Baseline | Current | Delta | Tolerance |");
  lines.push("| --- | ---:| ---:| ---:| ---:|");
  for (const r of rows) {
    lines.push(
      `| \`${r.metric}\` | ${num(r.baseline)} | ${num(r.current)} | ${signedDelta(
        r.delta,
      )} | ${num(r.tolerance)} |`,
    );
  }
  return lines;
}

function improvementRows(rows: ReadonlyArray<Improvement>): string[] {
  const lines: string[] = [];
  lines.push("| Metric | Baseline | Current | Delta |");
  lines.push("| --- | ---:| ---:| ---:|");
  for (const r of rows) {
    lines.push(
      `| \`${r.metric}\` | ${num(r.baseline)} | ${num(r.current)} | ${signedDelta(
        r.delta,
      )} |`,
    );
  }
  return lines;
}

function metadataBlock(baseline: EvalBaseline): string {
  const lines: string[] = [];
  lines.push("## Baseline metadata");
  lines.push("");
  lines.push(`- Schema version: ${baseline.version}`);
  lines.push(`- Created at: ${baseline.created_at}`);
  lines.push(`- Golden-set version: \`${baseline.golden_set_version}\``);
  return lines.join("\n");
}

function versionMismatchBody(result: GateResult, baseline: EvalBaseline): string {
  const lines: string[] = [];
  lines.push("# Eval gate — FAILED (golden-set version mismatch)");
  lines.push("");
  lines.push(
    "The committed baseline was built against a different golden set than the current checkout. The gate refuses to evaluate metrics until this is reconciled — re-baselining is a deliberate, reviewable act.",
  );
  lines.push("");
  lines.push("| | Hash |");
  lines.push("| --- | --- |");
  lines.push(`| Baseline | \`${result.baselineGoldenSetVersion}\` |`);
  lines.push(`| Current  | \`${result.currentGoldenSetVersion}\` |`);
  lines.push("");
  lines.push("## Remediation");
  lines.push("");
  lines.push(
    "See [`docs/EVAL-BASELINE.md`](../docs/EVAL-BASELINE.md) — section \"When to re-baseline\" — and re-run `pnpm eval` to capture fresh numbers, then commit the regenerated `eval-baseline.json` with the documented commit-message convention (`eval-baseline: re-baseline after <reason>`).",
  );
  lines.push("");
  lines.push(metadataBlock(baseline));
  lines.push("");
  return lines.join("\n");
}

export function buildGateMarkdown(
  result: GateResult,
  baseline: EvalBaseline,
  report: EvalReport,
): string {
  if (result.goldenSetVersionMismatch) {
    return versionMismatchBody(result, baseline);
  }

  const sections: string[] = [];
  const status = result.passed ? "PASSED" : "FAILED";
  sections.push(`# Eval gate — ${status}`);
  sections.push("");
  sections.push(`Run started: ${report.runStartedAt}`);
  sections.push(`Provider: ${report.provider}`);
  sections.push(`Cases: ${report.caseCount}`);
  sections.push("");

  // Headline metric — always present, always at the top.
  const baselineFn = baseline.metrics.falseNegativeRate.rate;
  const currentFn = report.falseNegativeRate.rate;
  sections.push("## Headline — false-negative rate on real mismatches");
  sections.push("");
  sections.push("| | Value |");
  sections.push("| --- | ---:|");
  sections.push(`| Baseline | ${pct(baselineFn)} |`);
  sections.push(`| Current  | ${pct(currentFn)} |`);
  sections.push(`| Delta    | ${signedDelta(result.headlineDelta)} |`);
  sections.push(
    `| Tolerance | +${num(baseline.tolerances.falseNegativeRate)} |`,
  );
  sections.push("");
  if (report.falseNegativeRate.leakedCaseIds.length > 0) {
    sections.push("Leaked cases on this run:");
    for (const id of report.falseNegativeRate.leakedCaseIds) {
      sections.push(`- \`${id}\``);
    }
    sections.push("");
  }

  // Regressions (out of tolerance).
  sections.push("## Regressions (out of tolerance)");
  sections.push("");
  if (result.regressions.length === 0) {
    sections.push("None.");
  } else {
    sections.push(...regressionRows(result.regressions));
  }
  sections.push("");

  // Regressions (within tolerance).
  sections.push("## Regressions within tolerance");
  sections.push("");
  if (result.regressionsWithinTolerance.length === 0) {
    sections.push("None.");
  } else {
    sections.push(
      "These moved the wrong way but stayed inside the configured tolerance — surfaced for review, not blocking.",
    );
    sections.push("");
    sections.push(...regressionRows(result.regressionsWithinTolerance));
  }
  sections.push("");

  // Improvements.
  sections.push("## Improvements");
  sections.push("");
  if (result.improvements.length === 0) {
    sections.push("None.");
  } else {
    sections.push(...improvementRows(result.improvements));
  }
  sections.push("");

  sections.push(metadataBlock(baseline));
  sections.push("");

  return sections.join("\n");
}
