/**
 * P5-2 + P5-3 — Offline eval harness entrypoint.
 *
 * Usage:
 *   pnpm eval                                # mock adapter, golden set
 *   pnpm eval --dataset=golden               # explicit golden set
 *   pnpm eval --dataset=corrections          # accumulated agent-correction corpus
 *   EVAL_PROVIDER=live ANTHROPIC_API_KEY=... pnpm eval
 *
 * Two datasets, ONE metric pipeline:
 *   - golden       — synthesized labeled set at `tests/golden/index.ts`.
 *                    Runs each case through the verification pipeline.
 *   - corrections  — accumulated agent-correction JSONL under
 *                    `eval-data/agent-corrections/`. Synthesizes a
 *                    `CaseRun` per record from the captured tool
 *                    prediction; `expectedLane = effectiveLane` because
 *                    the agent's call IS ground truth.
 *
 * The same metric functions and report shape apply to both datasets;
 * the `provider` field in the JSON report carries `mock | live |
 * corrections` so a downstream reader can tell which dataset produced
 * the numbers.
 *
 * No PII in either report: case ids are stable strings (hashed-id +
 * timestamp for the corrections dataset), lanes and verdicts are
 * enums, confidences are derived numbers.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { readCorpusRecords } from "@/lib/feedback/corpus";
import {
  computeGoldenSetVersion,
  loadBaseline,
} from "@/lib/eval/gate/baseline";
import { compareToBaseline } from "@/lib/eval/gate/compare";
import { buildGateMarkdown } from "@/lib/eval/gate/report";
import { computeCalibration } from "@/lib/eval/metrics/calibration";
import { computeFalseNegativeRate } from "@/lib/eval/metrics/falseNegativeRate";
import { computeLaneConfusion } from "@/lib/eval/metrics/laneConfusion";
import { computeLatency } from "@/lib/eval/metrics/latency";
import { computePerFieldMetrics } from "@/lib/eval/metrics/perField";
import { computeWarningCheckMetrics } from "@/lib/eval/metrics/warningCheck";
import { buildJsonReport } from "@/lib/eval/report/json";
import { buildMarkdownReport } from "@/lib/eval/report/markdown";
import { runEval, runEvalFromCorpus } from "@/lib/eval/runner";
import type { CaseRun, EvalReport } from "@/lib/eval/types";
import { runBakeoff } from "./bakeoff";

type Dataset = "golden" | "corrections";

function parseProviders(argv: ReadonlyArray<string>): string[] | null {
  for (const arg of argv) {
    if (arg.startsWith("--providers=")) {
      const csv = arg.slice("--providers=".length);
      return csv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return null;
}

function parseDataset(argv: ReadonlyArray<string>): Dataset {
  for (const arg of argv) {
    if (arg === "--dataset=corrections") return "corrections";
    if (arg === "--dataset=golden") return "golden";
    if (arg.startsWith("--dataset=")) {
      const value = arg.split("=", 2)[1] ?? "";
      throw new Error(
        `Unknown --dataset value "${value}". Use --dataset=golden or --dataset=corrections.`,
      );
    }
  }
  return "golden";
}

function parseGate(argv: ReadonlyArray<string>): boolean {
  return argv.includes("--gate");
}

async function loadRuns(
  dataset: Dataset,
): Promise<{ runs: CaseRun[]; provider: EvalReport["provider"] }> {
  if (dataset === "golden") {
    const { runs, provider } = await runEval();
    return { runs, provider };
  }
  const records = await readCorpusRecords();
  const runs = runEvalFromCorpus(records);
  return { runs, provider: "corrections" };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const gate = parseGate(argv);
  // --providers=<csv> delegates to the bake-off harness. A single provider
  // still goes through this delegation so the report shape is consistent
  // (the bake-off writes per-provider reports into `eval-reports/bakeoff-<ts>/`).
  // The single-provider, no-flag path keeps the legacy `eval-reports/<ts>/`
  // single-report layout.
  const providers = parseProviders(argv);
  if (gate && providers && providers.length > 0) {
    throw new Error(
      "--gate cannot be combined with --providers. The gate runs against the golden set on the mock adapter; bake-off comparisons are a separate harness mode.",
    );
  }
  if (providers && providers.length > 0) {
    const { rootDir, recommendationText, results } = await runBakeoff(providers);
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log(
      `LabelCheck eval (bake-off mode) — providers: ${providers.join(", ")}`,
    );
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log(recommendationText);
    // eslint-disable-next-line no-console
    console.log("");
    for (const r of results) {
      const summary =
        r.status === "ok" && r.report
          ? `FN ${(r.report.falseNegativeRate.rate * 100).toFixed(1)}%, p95 ${Math.round(r.report.latency.p95)}ms`
          : `not-run — ${r.reason ?? "no reason"}`;
      // eslint-disable-next-line no-console
      console.log(`  - ${r.providerId}: ${summary}`);
    }
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log(`Reports: ${rootDir}`);
    return;
  }

  // The gate is a golden-set + mock-only mode. CI runs against the mock
  // for determinism (NFR-3 / A21); live calls happen out-of-band.
  const dataset: Dataset = gate ? "golden" : parseDataset(argv);
  const runStartedAt = new Date().toISOString();
  const { runs, provider } = await loadRuns(dataset);

  if (dataset === "corrections" && runs.length === 0) {
    // eslint-disable-next-line no-console
    console.log("Corrections corpus is empty — no records to evaluate.");
    return;
  }

  const falseNegativeRate = computeFalseNegativeRate(runs);
  const laneConfusion = computeLaneConfusion(runs);
  const warningCheck = computeWarningCheckMetrics(runs);
  const calibration = computeCalibration(runs);
  const perField = computePerFieldMetrics(runs);
  const latency = computeLatency(runs);

  const report: EvalReport = {
    runStartedAt,
    provider,
    caseCount: runs.length,
    falseNegativeRate,
    laneConfusion,
    warningCheck,
    calibration,
    perField,
    latency,
  };

  const timestamp = runStartedAt.replace(/[:.]/g, "-");
  const reportDir = path.join(process.cwd(), "eval-reports", timestamp);
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, "report.json"),
    buildJsonReport(report),
    "utf-8",
  );
  await writeFile(
    path.join(reportDir, "report.md"),
    buildMarkdownReport(report),
    "utf-8",
  );

  const pctRate = (falseNegativeRate.rate * 100).toFixed(1);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(
    `LabelCheck eval — dataset=${dataset} provider=${provider} cases=${runs.length}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Headline (false-negative rate on real mismatches): ${falseNegativeRate.leakedToMatch} / ${falseNegativeRate.totalRealNegatives} = ${pctRate}%`,
  );
  if (falseNegativeRate.leakedCaseIds.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Leaked cases: ${falseNegativeRate.leakedCaseIds.join(", ")}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`Report: ${reportDir}`);

  if (gate) {
    await runGate(report, reportDir);
  }
}

async function runGate(report: EvalReport, reportDir: string): Promise<void> {
  const repoRoot = process.cwd();
  const baselinePath = path.join(repoRoot, "eval-baseline.json");
  const goldenIndexPath = path.join(repoRoot, "tests", "golden", "index.ts");

  const baseline = await loadBaseline(baselinePath);
  const currentGoldenSetVersion = await computeGoldenSetVersion(goldenIndexPath);
  const result = compareToBaseline(report, baseline, currentGoldenSetVersion);
  const markdown = buildGateMarkdown(result, baseline, report);
  await writeFile(path.join(reportDir, "gate-result.md"), markdown, "utf-8");

  // eslint-disable-next-line no-console
  console.log("");

  if (result.goldenSetVersionMismatch) {
    // eslint-disable-next-line no-console
    console.error(
      `[gate] FAIL — golden-set version mismatch. baseline=${result.baselineGoldenSetVersion.slice(0, 12)}… current=${result.currentGoldenSetVersion.slice(0, 12)}…`,
    );
    // eslint-disable-next-line no-console
    console.error(
      "See docs/EVAL-BASELINE.md (When to re-baseline) and use the `eval-baseline: re-baseline after <reason>` commit-message convention.",
    );
    // eslint-disable-next-line no-console
    console.error(`Gate report: ${path.join(reportDir, "gate-result.md")}`);
    process.exit(1);
  }

  const baselineFnPct = (
    baseline.metrics.falseNegativeRate.rate * 100
  ).toFixed(1);
  const currentFnPct = (report.falseNegativeRate.rate * 100).toFixed(1);
  const headlineTolerance = baseline.tolerances.falseNegativeRate;

  if (result.passed) {
    // eslint-disable-next-line no-console
    console.log(
      `[gate] PASS — headline FN-rate ${currentFnPct}% (baseline ${baselineFnPct}%, tolerance +${headlineTolerance})`,
    );
    // eslint-disable-next-line no-console
    console.log(`Gate report: ${path.join(reportDir, "gate-result.md")}`);
    return;
  }

  // eslint-disable-next-line no-console
  console.error(
    `[gate] FAIL — ${result.regressions.length} metric(s) outside tolerance`,
  );
  for (const r of result.regressions) {
    const delta = r.delta >= 0 ? `+${r.delta.toFixed(4)}` : r.delta.toFixed(4);
    // eslint-disable-next-line no-console
    console.error(
      `  - ${r.metric}: baseline=${r.baseline.toFixed(4)} run=${r.current.toFixed(4)} delta=${delta} tolerance=${r.tolerance}`,
    );
  }
  // eslint-disable-next-line no-console
  console.error(`Gate report: ${path.join(reportDir, "gate-result.md")}`);
  process.exit(1);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
