/**
 * P5-2 — Offline eval harness entrypoint.
 *
 * Usage:
 *   pnpm eval                                          # mock adapter (default)
 *   EVAL_PROVIDER=live ANTHROPIC_API_KEY=... pnpm eval # live adapter
 *
 * Walks the golden set at `tests/golden/index.ts`, runs each case
 * through the per-application verification pipeline (extraction →
 * matching → triage), and writes:
 *   - eval-reports/<ISO timestamp>/report.json
 *   - eval-reports/<ISO timestamp>/report.md
 *
 * The Markdown report leads with the false-negative rate on real
 * mismatches — observability.md's headline safety metric. The JSON
 * file is the structured form the model bake-off (P5-4) and the CI
 * eval gate (P5-5) will read.
 *
 * No PII in the report: case ids are internal strings, lane / verdict
 * are enums, confidences are derived numbers. The `scripts/` directory
 * is outside the AC-10 static-grep scope so file writes here are
 * allowed (the scan covers `app/`, `lib/`, and `middleware.ts`).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { computeCalibration } from "@/lib/eval/metrics/calibration";
import { computeFalseNegativeRate } from "@/lib/eval/metrics/falseNegativeRate";
import { computeLaneConfusion } from "@/lib/eval/metrics/laneConfusion";
import { computeLatency } from "@/lib/eval/metrics/latency";
import { computePerFieldMetrics } from "@/lib/eval/metrics/perField";
import { computeWarningCheckMetrics } from "@/lib/eval/metrics/warningCheck";
import { buildJsonReport } from "@/lib/eval/report/json";
import { buildMarkdownReport } from "@/lib/eval/report/markdown";
import { runEval } from "@/lib/eval/runner";
import type { EvalReport } from "@/lib/eval/types";

async function main(): Promise<void> {
  const runStartedAt = new Date().toISOString();
  const { runs, provider } = await runEval();

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
    `LabelCheck eval — provider=${provider} cases=${runs.length}`,
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
