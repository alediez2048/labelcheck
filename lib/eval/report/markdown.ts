/**
 * Markdown report writer (P5-2).
 *
 * Layout, in order:
 *   1. Headline: false-negative rate on real mismatches.
 *      observability.md is explicit — if the reader stops after the
 *      first heading they should know the safety number.
 *   2. Lane confusion matrix.
 *   3. Government warning check.
 *   4. Confidence calibration table + ECE.
 *   5. Per-field precision / recall.
 *   6. Latency distribution.
 *
 * Tables are GFM pipe tables — render cleanly in GitHub, IDEs, and the
 * plain-text viewer the operator uses on a build server.
 */

import type {
  CalibrationReport,
  EvalReport,
  FalseNegativeReport,
  LaneConfusion,
  LatencyReport,
  PerFieldMetric,
  WarningCheckReport,
} from "../types";

function pct(value: number, digits: number = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number, digits: number = 4): string {
  return value.toFixed(digits);
}

function roundMs(value: number): string {
  return Math.round(value).toString();
}

function headline(fnr: FalseNegativeReport): string {
  const lines: string[] = [];
  lines.push("## Headline: false-negative rate on real mismatches");
  lines.push("");
  lines.push(
    `**${fnr.leakedToMatch} / ${fnr.totalRealNegatives} cases leaked to match lane** = **${pct(
      fnr.rate,
    )}**.`,
  );
  if (fnr.leakedCaseIds.length > 0) {
    lines.push("");
    lines.push("Leaked cases:");
    for (const id of fnr.leakedCaseIds) {
      lines.push(`- \`${id}\``);
    }
  }
  return lines.join("\n");
}

function laneConfusionBlock(conf: LaneConfusion): string {
  const lines: string[] = [];
  lines.push("## Lane confusion");
  lines.push("");
  lines.push(
    "|              | predicted: match | predicted: mismatch | predicted: review |",
  );
  lines.push("| ---          | ---:             | ---:                | ---:              |");
  lines.push(
    `| **expected: match**    | ${conf.matrix.match.match} | ${conf.matrix.match.mismatch} | ${conf.matrix.match.review} |`,
  );
  lines.push(
    `| **expected: mismatch** | ${conf.matrix.mismatch.match} | ${conf.matrix.mismatch.mismatch} | ${conf.matrix.mismatch.review} |`,
  );
  lines.push(
    `| **expected: review**   | ${conf.matrix.review.match} | ${conf.matrix.review.mismatch} | ${conf.matrix.review.review} |`,
  );
  lines.push("");
  lines.push(`Overall accuracy: **${pct(conf.overall)}**.`);
  lines.push("");
  lines.push(
    `Per-lane accuracy — match: ${pct(conf.perLaneAccuracy.match)}, mismatch: ${pct(
      conf.perLaneAccuracy.mismatch,
    )}, review: ${pct(conf.perLaneAccuracy.review)}.`,
  );
  return lines.join("\n");
}

function warningBlock(warning: WarningCheckReport): string {
  const lines: string[] = [];
  lines.push("## Government warning check");
  lines.push("");
  lines.push("| Sub-check | tp | tn | fp | fn | accuracy |");
  lines.push("| --- | ---:| ---:| ---:| ---:| ---:|");
  lines.push(
    `| Presence | ${warning.presence.tp} | ${warning.presence.tn} | ${warning.presence.fp} | ${warning.presence.fn} | ${pct(
      warning.presence.accuracy,
    )} |`,
  );
  lines.push(
    `| Verbatim | ${warning.verbatim.tp} | ${warning.verbatim.tn} | ${warning.verbatim.fp} | ${warning.verbatim.fn} | ${pct(
      warning.verbatim.accuracy,
    )} |`,
  );
  lines.push(
    `| ALL CAPS | ${warning.allCaps.tp} | ${warning.allCaps.tn} | ${warning.allCaps.fp} | ${warning.allCaps.fn} | ${pct(
      warning.allCaps.accuracy,
    )} |`,
  );
  return lines.join("\n");
}

function calibrationBlock(cal: CalibrationReport): string {
  const lines: string[] = [];
  lines.push("## Confidence calibration");
  lines.push("");
  lines.push(`ECE: **${num(cal.ece)}**`);
  lines.push("");
  lines.push("| Bucket | Count | Predicted mean | Observed accuracy |");
  lines.push("| --- | ---:| ---:| ---:|");
  for (const bucket of cal.buckets) {
    const isTop = bucket.upper >= 1;
    const label = `[${bucket.lower.toFixed(1)}, ${bucket.upper.toFixed(1)}${
      isTop ? "]" : ")"
    }`;
    lines.push(
      `| ${label} | ${bucket.count} | ${num(bucket.predictedMean, 3)} | ${num(
        bucket.observedAccuracy,
        3,
      )} |`,
    );
  }
  return lines.join("\n");
}

function perFieldBlock(perField: ReadonlyArray<PerFieldMetric>): string {
  const lines: string[] = [];
  lines.push("## Per-field precision and recall");
  lines.push("");
  lines.push("| Field | TP | FP | FN | TN | Precision | Recall | F1 |");
  lines.push("| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:|");
  for (const row of perField) {
    lines.push(
      `| ${row.field} | ${row.truePositives} | ${row.falsePositives} | ${row.falseNegatives} | ${row.trueNegatives} | ${num(
        row.precision,
        3,
      )} | ${num(row.recall, 3)} | ${num(row.f1, 3)} |`,
    );
  }
  return lines.join("\n");
}

function latencyBlock(latency: LatencyReport): string {
  const lines: string[] = [];
  lines.push("## Latency");
  lines.push("");
  lines.push("| metric | ms |");
  lines.push("| --- | ---:|");
  lines.push(`| p50 | ${roundMs(latency.p50)} |`);
  lines.push(`| p95 | ${roundMs(latency.p95)} |`);
  lines.push(`| p99 | ${roundMs(latency.p99)} |`);
  lines.push(`| max | ${roundMs(latency.max)} |`);
  lines.push("");
  lines.push(
    `Budget: ${latency.budgetMs} ms. Breaches: ${latency.budgetBreaches.length}.`,
  );
  if (latency.budgetBreaches.length > 0) {
    lines.push("");
    lines.push("Cases over budget:");
    for (const id of latency.budgetBreaches) {
      lines.push(`- \`${id}\``);
    }
  }
  return lines.join("\n");
}

export function buildMarkdownReport(report: EvalReport): string {
  const sections: string[] = [];
  sections.push("# LabelCheck eval report");
  sections.push("");
  sections.push(`Run started: ${report.runStartedAt}`);
  sections.push(`Provider: ${report.provider}`);
  sections.push(`Cases: ${report.caseCount}`);
  sections.push("");
  sections.push(headline(report.falseNegativeRate));
  sections.push("");
  sections.push(laneConfusionBlock(report.laneConfusion));
  sections.push("");
  sections.push(warningBlock(report.warningCheck));
  sections.push("");
  sections.push(calibrationBlock(report.calibration));
  sections.push("");
  sections.push(perFieldBlock(report.perField));
  sections.push("");
  sections.push(latencyBlock(report.latency));
  sections.push("");
  return sections.join("\n");
}
