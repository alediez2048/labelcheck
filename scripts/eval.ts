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
  // --providers=<csv> delegates to the bake-off harness. A single provider
  // still goes through this delegation so the report shape is consistent
  // (the bake-off writes per-provider reports into `eval-reports/bakeoff-<ts>/`).
  // The single-provider, no-flag path keeps the legacy `eval-reports/<ts>/`
  // single-report layout.
  const providers = parseProviders(argv);
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

  const dataset = parseDataset(argv);
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
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
