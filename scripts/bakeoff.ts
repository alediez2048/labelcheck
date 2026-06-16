/**
 * Model bake-off CLI (P5-4).
 *
 * Usage:
 *   pnpm bakeoff                                    # default: mock,anthropic,olmocr
 *   pnpm bakeoff --providers=mock,anthropic,olmocr  # explicit subset
 *
 * For each provider id:
 *   1. Look it up in `lib/provider/registry`. Unknown id -> not-run.
 *   2. Try the adapter factory; on throw, mark not-run with the error.
 *   3. Run the eval via `runEvalForProvider`. On throw inside the
 *      harness, mark not-run with the message.
 *   4. On `ok`, assemble the `EvalReport` and write
 *      `eval-reports/bakeoff-<ISO>/<providerId>/report.{json,md}`.
 *
 * After every provider runs:
 *   - Compute `buildComparison(results)` with the 5s p95 latency gate.
 *   - Write `comparison.{json,md}` at the bake-off root.
 *   - Print the recommendation paragraph + a per-provider one-line
 *     summary to stdout.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildComparison } from "@/lib/eval/bakeoff/comparison";
import type { PerProviderResult } from "@/lib/eval/bakeoff/comparison";
import {
  buildBakeoffJson,
  buildBakeoffMarkdown,
} from "@/lib/eval/bakeoff/report";
import { computeCalibration } from "@/lib/eval/metrics/calibration";
import { computeFalseNegativeRate } from "@/lib/eval/metrics/falseNegativeRate";
import { computeLaneConfusion } from "@/lib/eval/metrics/laneConfusion";
import { computeLatency } from "@/lib/eval/metrics/latency";
import { computePerFieldMetrics } from "@/lib/eval/metrics/perField";
import { computeWarningCheckMetrics } from "@/lib/eval/metrics/warningCheck";
import { buildJsonReport } from "@/lib/eval/report/json";
import { buildMarkdownReport } from "@/lib/eval/report/markdown";
import { runEvalForProvider } from "@/lib/eval/runner";
import type { CaseRun, EvalReport } from "@/lib/eval/types";
import {
  getProviderEntry,
  type ProviderEntry,
} from "@/lib/provider/registry";

const DEFAULT_PROVIDERS = ["mock", "anthropic", "olmocr"];

function parseProviders(argv: ReadonlyArray<string>): string[] {
  for (const arg of argv) {
    if (arg.startsWith("--providers=")) {
      const csv = arg.slice("--providers=".length);
      return csv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return DEFAULT_PROVIDERS;
}

function reportFromRuns(
  runStartedAt: string,
  runs: CaseRun[],
  provider: EvalReport["provider"],
): EvalReport {
  return {
    runStartedAt,
    provider,
    caseCount: runs.length,
    falseNegativeRate: computeFalseNegativeRate(runs),
    laneConfusion: computeLaneConfusion(runs),
    warningCheck: computeWarningCheckMetrics(runs),
    calibration: computeCalibration(runs),
    perField: computePerFieldMetrics(runs),
    latency: computeLatency(runs),
  };
}

async function exerciseProvider(
  entry: ProviderEntry,
  runStartedAt: string,
): Promise<PerProviderResult> {
  // Construct first so a missing-env failure surfaces before the eval run.
  try {
    entry.build();
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      providerId: entry.id,
      displayName: entry.displayName,
      origin: entry.origin,
      estimatedCostPerCallUsd: entry.estimatedCostPerCallUsd,
      status: "not-run",
      reason,
    };
  }

  const outcome = await runEvalForProvider(entry.id);
  if (outcome.status === "not-run") {
    return {
      providerId: entry.id,
      displayName: entry.displayName,
      origin: entry.origin,
      estimatedCostPerCallUsd: entry.estimatedCostPerCallUsd,
      status: "not-run",
      reason: outcome.reason,
    };
  }

  const report = reportFromRuns(runStartedAt, outcome.runs, outcome.provider);
  return {
    providerId: entry.id,
    displayName: entry.displayName,
    origin: entry.origin,
    estimatedCostPerCallUsd: entry.estimatedCostPerCallUsd,
    status: "ok",
    report,
  };
}

async function writePerProviderReport(
  rootDir: string,
  result: PerProviderResult,
): Promise<void> {
  const dir = path.join(rootDir, result.providerId);
  await mkdir(dir, { recursive: true });
  if (result.status === "ok" && result.report) {
    await writeFile(
      path.join(dir, "report.json"),
      buildJsonReport(result.report),
      "utf-8",
    );
    await writeFile(
      path.join(dir, "report.md"),
      buildMarkdownReport(result.report),
      "utf-8",
    );
  } else {
    const payload = {
      providerId: result.providerId,
      displayName: result.displayName,
      status: result.status,
      reason: result.reason ?? null,
      origin: result.origin,
    };
    await writeFile(
      path.join(dir, "report.json"),
      JSON.stringify(payload, null, 2),
      "utf-8",
    );
    await writeFile(
      path.join(dir, "report.md"),
      `# ${result.displayName}\n\nStatus: not-run\n\nReason: ${result.reason ?? "no reason recorded"}\n`,
      "utf-8",
    );
  }
}

function oneLineSummary(result: PerProviderResult): string {
  if (result.status === "ok" && result.report) {
    const fn = (result.report.falseNegativeRate.rate * 100).toFixed(1);
    const p95 = Math.round(result.report.latency.p95);
    return `${result.providerId}: ok — FN ${fn}%, p95 ${p95}ms`;
  }
  return `${result.providerId}: not-run — ${result.reason ?? "no reason"}`;
}

export async function runBakeoff(providers: ReadonlyArray<string>): Promise<{
  rootDir: string;
  results: PerProviderResult[];
  recommendationText: string;
}> {
  const runStartedAt = new Date().toISOString();
  const timestamp = runStartedAt.replace(/[:.]/g, "-");
  const rootDir = path.join(
    process.cwd(),
    "eval-reports",
    `bakeoff-${timestamp}`,
  );
  await mkdir(rootDir, { recursive: true });

  const results: PerProviderResult[] = [];
  for (const id of providers) {
    const entry = getProviderEntry(id);
    if (!entry) {
      results.push({
        providerId: id,
        displayName: id,
        origin: {
          vendor: "unknown",
          countryOfOrigin: "n/a",
          license: "n/a",
          inBoundary: "no",
          securityReview: "not_required",
          notes: "Unknown provider id.",
        },
        estimatedCostPerCallUsd: 0,
        status: "not-run",
        reason: "unknown provider id",
      });
      continue;
    }
    const result = await exerciseProvider(entry, runStartedAt);
    results.push(result);
    await writePerProviderReport(rootDir, result);
  }

  const comparison = buildComparison(results);

  await writeFile(
    path.join(rootDir, "comparison.json"),
    buildBakeoffJson(results, comparison),
    "utf-8",
  );
  await writeFile(
    path.join(rootDir, "comparison.md"),
    buildBakeoffMarkdown(results, comparison),
    "utf-8",
  );

  return {
    rootDir,
    results,
    recommendationText: comparison.recommendationText,
  };
}

async function main(): Promise<void> {
  const providers = parseProviders(process.argv.slice(2));
  const { rootDir, results, recommendationText } = await runBakeoff(providers);

  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(`LabelCheck model bake-off — providers: ${providers.join(", ")}`);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(recommendationText);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Per-provider summary:");
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`  - ${oneLineSummary(r)}`);
  }
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(`Reports: ${rootDir}`);
}

// Only run main() when invoked directly (not when imported, e.g. by
// scripts/eval.ts delegating to the bake-off).
const invokedDirectly = process.argv[1]?.endsWith("bakeoff.ts") ?? false;
if (invokedDirectly) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
