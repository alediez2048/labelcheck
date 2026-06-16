/**
 * Bake-off report writers (P5-4).
 *
 * Markdown layout — comparison.md:
 *   1. Title + run metadata (run start, providers, golden-set pointer).
 *   2. Recommendation paragraph (`comparison.recommendationText`).
 *   3. Per-provider results table — false-negative rate as the leftmost
 *      metric column (the headline; observability.md is explicit).
 *   4. Origin metadata table — vendor, country, license, in-boundary
 *      posture, security review.
 *   5. Per-provider notes (the `origin.notes` bullets).
 *   6. Pointer back to per-provider `eval-reports/bakeoff-<ts>/<id>/report.md`.
 *
 * JSON shape — comparison.json:
 *   { runStartedAt, providers, comparison, results: [...] }
 */

import type { EvalReport } from "../types";

import type {
  ComparisonRanking,
  PerProviderResult,
} from "./comparison";

function fmtPct(rate: number, digits: number = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

function fmtMs(ms: number): string {
  return `${Math.round(ms)}`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return "$0";
  return `$${usd.toFixed(5)}`;
}

function fmtEce(ece: number): string {
  return ece.toFixed(4);
}

function laneAccuracy(report: EvalReport): number {
  return report.laneConfusion.overall;
}

function warningAccuracy(report: EvalReport): number {
  const w = report.warningCheck;
  return (
    (w.presence.accuracy + w.verbatim.accuracy + w.allCaps.accuracy) / 3
  );
}

function resultsTable(results: ReadonlyArray<PerProviderResult>): string {
  const lines: string[] = [];
  lines.push(
    "| Provider | Status | FN rate | Lane acc | Warning acc | ECE | p95 ms | Cost / call |",
  );
  lines.push(
    "| --- | --- | ---:| ---:| ---:| ---:| ---:| ---:|",
  );
  for (const r of results) {
    if (r.status === "ok" && r.report) {
      const fn = fmtPct(r.report.falseNegativeRate.rate);
      const lane = fmtPct(laneAccuracy(r.report));
      const warn = fmtPct(warningAccuracy(r.report));
      const ece = fmtEce(r.report.calibration.ece);
      const p95 = fmtMs(r.report.latency.p95);
      lines.push(
        `| ${r.displayName} | ok | ${fn} | ${lane} | ${warn} | ${ece} | ${p95} | ${fmtCost(r.estimatedCostPerCallUsd)} |`,
      );
    } else {
      lines.push(
        `| ${r.displayName} | not-run | — | — | — | — | — | ${fmtCost(r.estimatedCostPerCallUsd)} |`,
      );
    }
  }
  return lines.join("\n");
}

function originTable(results: ReadonlyArray<PerProviderResult>): string {
  const lines: string[] = [];
  lines.push(
    "| Provider | Vendor | Country | License | In-boundary | Security review |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    lines.push(
      `| ${r.displayName} | ${r.origin.vendor} | ${r.origin.countryOfOrigin} | ${r.origin.license} | ${r.origin.inBoundary} | ${r.origin.securityReview} |`,
    );
  }
  return lines.join("\n");
}

function notesBlock(results: ReadonlyArray<PerProviderResult>): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.origin.notes) {
      lines.push(`- **${r.displayName}** — ${r.origin.notes}`);
    }
    if (r.status === "not-run") {
      lines.push(
        `  - Not run: ${r.reason ?? "no reason recorded"}`,
      );
    }
  }
  return lines.join("\n");
}

export function buildBakeoffMarkdown(
  results: ReadonlyArray<PerProviderResult>,
  comparison: ComparisonRanking,
): string {
  const runStartedAt = new Date().toISOString();
  const providers = results.map((r) => r.providerId).join(", ");

  const sections: string[] = [];
  sections.push("# LabelCheck model bake-off");
  sections.push("");
  sections.push(`Run started: ${runStartedAt}`);
  sections.push(`Providers: ${providers}`);
  sections.push(`Golden set: tests/golden/index.ts`);
  sections.push("");
  sections.push("## Recommendation");
  sections.push("");
  sections.push(comparison.recommendationText);
  sections.push("");
  sections.push("## Per-provider results");
  sections.push("");
  sections.push(resultsTable(results));
  sections.push("");
  sections.push("## Origin metadata");
  sections.push("");
  sections.push(originTable(results));
  sections.push("");
  const notes = notesBlock(results);
  if (notes.length > 0) {
    sections.push("### Notes");
    sections.push("");
    sections.push(notes);
    sections.push("");
  }
  sections.push("## Per-provider reports");
  sections.push("");
  sections.push(
    "Each candidate's full P5-2 metrics report is at " +
      "`eval-reports/bakeoff-<ts>/<providerId>/report.md`.",
  );
  sections.push("");
  return sections.join("\n");
}

export function buildBakeoffJson(
  results: ReadonlyArray<PerProviderResult>,
  comparison: ComparisonRanking,
): string {
  const payload = {
    runStartedAt: new Date().toISOString(),
    providers: results.map((r) => r.providerId),
    comparison: {
      ranked: comparison.ranked,
      recommendation: comparison.recommendationStructured,
      recommendationText: comparison.recommendationText,
    },
    results: results.map((r) => ({
      providerId: r.providerId,
      displayName: r.displayName,
      origin: r.origin,
      estimatedCostPerCallUsd: r.estimatedCostPerCallUsd,
      status: r.status,
      reason: r.reason ?? null,
      report: r.report ?? null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
