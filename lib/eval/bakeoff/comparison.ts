/**
 * Bake-off comparison (P5-4).
 *
 * Takes per-provider eval outcomes, applies the 5-second p95 latency gate
 * (NFR-1), ranks survivors by the false-negative-rate headline metric with
 * the documented tie-breaks, and assembles the recommendation paragraph
 * under the stakeholder framing rule:
 *
 *   - Lead with the highest-ranked in-boundary US-origin candidate with
 *     security review approved (Azure OpenAI in Azure Government when
 *     it's in the pool — never a Chinese-origin candidate, regardless of
 *     measured accuracy).
 *   - Present the highest-ranked US-origin self-hosted open-source
 *     candidate (olmOCR by construction of the registry) as the
 *     air-gapped fallback with the lead role.
 *   - Footnote any pending-security-review candidate last with the
 *     procurement caveat — never headlined for a Treasury audience.
 *
 * The framing rule is enforced in CODE here, not by operator discretion.
 * The unit tests in `tests/eval/bakeoff/comparison.test.ts` assert it.
 */

import type { ProviderOrigin } from "@/lib/provider/registry";

import type { EvalReport } from "../types";

export type PerProviderResult = {
  providerId: string;
  displayName: string;
  origin: ProviderOrigin;
  estimatedCostPerCallUsd: number;
  /** "ok" when the eval produced a report; "not-run" when the adapter could not be exercised. */
  status: "ok" | "not-run";
  /** Populated when `status === "not-run"`. */
  reason?: string;
  /** Populated when `status === "ok"`. */
  report?: EvalReport;
};

export type RankedEntry = {
  providerId: string;
  reasonIfExcluded?: string;
};

export type RecommendationStructured = {
  leadCandidate: string | null;
  airGappedFallback: string | null;
  pendingReview: ReadonlyArray<string>;
};

export type ComparisonRanking = {
  /** Candidates ranked by primary metric (false-negative rate ASC) subject to latency gate. */
  ranked: ReadonlyArray<RankedEntry>;
  /** The recommendation paragraph derived from the framing rule. */
  recommendationText: string;
  /** A structured shape for the JSON report. */
  recommendationStructured: RecommendationStructured;
};

const DEFAULT_BUDGET_MS = 5000;

/**
 * Open-source licenses we consider "provenance-safe" for the air-gapped
 * fallback slot. Conservative on purpose — adding a new bucket means a
 * procurement conversation, not a code tweak.
 */
const OPEN_SOURCE_LICENSES: ReadonlySet<string> = new Set([
  "Apache 2.0",
  "MIT",
  "BSD",
]);

function isPending(result: PerProviderResult): boolean {
  return result.origin.securityReview === "pending";
}

function isUsOrigin(origin: ProviderOrigin): boolean {
  return origin.countryOfOrigin === "United States";
}

/**
 * Lead-slot eligibility: an in-boundary commercial SaaS path inside the
 * federal boundary — by today's posture, only `via-azure-government`
 * candidates qualify. Self-hosted candidates (`inBoundary === "yes"`)
 * are the air-gapped fallback, not the lead. When Azure Gov is not in
 * the run, the lead is null and the fallback is promoted in the rendered
 * recommendation paragraph.
 */
function isLeadEligibleInBoundary(origin: ProviderOrigin): boolean {
  return origin.inBoundary === "via-azure-government";
}

function isSelfHosted(origin: ProviderOrigin): boolean {
  return origin.inBoundary === "yes";
}

function isOpenSource(origin: ProviderOrigin): boolean {
  return OPEN_SOURCE_LICENSES.has(origin.license);
}

/**
 * Sort comparator for the survivors: false-negative rate ASC, then
 * warning-check accuracy DESC, then ECE ASC, then estimated cost ASC.
 */
function compareSurvivors(
  a: PerProviderResult,
  b: PerProviderResult,
): number {
  const ar = a.report;
  const br = b.report;
  if (!ar || !br) {
    // Survivors always have reports; defensive zero-sort fallback.
    return 0;
  }
  const fnrDiff = ar.falseNegativeRate.rate - br.falseNegativeRate.rate;
  if (fnrDiff !== 0) return fnrDiff;

  const warnA = warningCheckAvgAccuracy(ar);
  const warnB = warningCheckAvgAccuracy(br);
  const warnDiff = warnB - warnA; // DESC
  if (warnDiff !== 0) return warnDiff;

  const eceDiff = ar.calibration.ece - br.calibration.ece;
  if (eceDiff !== 0) return eceDiff;

  return a.estimatedCostPerCallUsd - b.estimatedCostPerCallUsd;
}

function warningCheckAvgAccuracy(report: EvalReport): number {
  const w = report.warningCheck;
  return (
    (w.presence.accuracy + w.verbatim.accuracy + w.allCaps.accuracy) / 3
  );
}

/**
 * Apply the latency gate and `not-run` exclusion, then sort survivors.
 * Returns ordered `RankedEntry`s — survivors first in rank order,
 * excluded candidates last in their original order with reasons.
 */
function buildRanking(
  results: ReadonlyArray<PerProviderResult>,
  budgetMs: number,
): { ranked: RankedEntry[]; survivors: PerProviderResult[] } {
  const survivors: PerProviderResult[] = [];
  const excluded: RankedEntry[] = [];

  for (const r of results) {
    if (r.status === "not-run") {
      excluded.push({
        providerId: r.providerId,
        reasonIfExcluded: `not provisioned${r.reason ? `: ${r.reason}` : ""}`,
      });
      continue;
    }
    const report = r.report;
    if (!report) {
      excluded.push({
        providerId: r.providerId,
        reasonIfExcluded: "ok status but no report produced",
      });
      continue;
    }
    if (report.latency.p95 > budgetMs) {
      excluded.push({
        providerId: r.providerId,
        reasonIfExcluded: `p95 ${Math.round(report.latency.p95)} ms > ${budgetMs}ms budget`,
      });
      continue;
    }
    survivors.push(r);
  }

  survivors.sort(compareSurvivors);
  const ranked: RankedEntry[] = survivors.map((s) => ({
    providerId: s.providerId,
  }));
  ranked.push(...excluded);
  return { ranked, survivors };
}

/**
 * Render the recommendation paragraph from the framing rule.
 *
 * Contract enforced in code (assert in tests):
 *
 *   - `leadCandidate` is NEVER a Chinese-origin candidate, regardless of
 *     the measured ranking. Only US-origin, in-boundary OR
 *     via-azure-government, security-review approved candidates qualify.
 *   - `airGappedFallback` is the highest-ranked US-origin self-hosted
 *     OPEN-SOURCE security-review-approved candidate. olmOCR (Apache 2.0)
 *     wins this slot by construction; GLM-OCR / Qwen2.5-VL (custom OSS,
 *     pending review) can never win it.
 *   - All `securityReview === "pending"` candidates appear LAST in
 *     `pendingReview`, prefixed with the procurement caveat.
 */
function pickLeadCandidate(
  survivors: ReadonlyArray<PerProviderResult>,
): PerProviderResult | null {
  // Survivors are already sorted by metric. Walk in order and return the
  // first candidate that meets the framing rule's lead-slot criteria.
  for (const s of survivors) {
    if (
      isUsOrigin(s.origin) &&
      isLeadEligibleInBoundary(s.origin) &&
      s.origin.securityReview === "approved"
    ) {
      return s;
    }
  }
  return null;
}

function pickAirGappedFallback(
  survivors: ReadonlyArray<PerProviderResult>,
  leadId: string | null,
): PerProviderResult | null {
  for (const s of survivors) {
    if (s.providerId === leadId) continue;
    if (
      isUsOrigin(s.origin) &&
      isSelfHosted(s.origin) &&
      s.origin.securityReview === "approved" &&
      isOpenSource(s.origin)
    ) {
      return s;
    }
  }
  return null;
}

function pickPendingReview(
  survivors: ReadonlyArray<PerProviderResult>,
): PerProviderResult[] {
  return survivors.filter(isPending);
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  return `${Math.round(ms)}ms`;
}

function fmtEce(ece: number): string {
  return ece.toFixed(4);
}

function bulletsForCandidate(result: PerProviderResult): string[] {
  const lines: string[] = [];
  const report = result.report;
  if (report) {
    lines.push(
      `  - False-negative rate: ${fmtPct(report.falseNegativeRate.rate)}; ` +
        `p95 latency: ${fmtMs(report.latency.p95)}; ` +
        `ECE: ${fmtEce(report.calibration.ece)}.`,
    );
  }
  if (result.origin.notes) {
    lines.push(`  - ${result.origin.notes}`);
  }
  return lines;
}

function renderRecommendationText(
  results: ReadonlyArray<PerProviderResult>,
  survivors: ReadonlyArray<PerProviderResult>,
  lead: PerProviderResult | null,
  fallback: PerProviderResult | null,
  pending: ReadonlyArray<PerProviderResult>,
): string {
  if (survivors.length === 0) {
    if (results.length === 0) {
      return "No candidates ran. The bake-off had no input.";
    }
    const reasons = results
      .map((r) =>
        r.status === "not-run"
          ? `${r.displayName}: ${r.reason ?? "not provisioned"}`
          : `${r.displayName}: excluded by p95 latency gate`,
      )
      .join("; ");
    return `No candidates passed the latency gate or were provisioned. ${reasons}`;
  }

  const blocks: string[] = [];

  if (lead) {
    blocks.push(
      `**Recommended production path:** ${lead.displayName} (${lead.origin.vendor}, ${lead.origin.license}).`,
    );
    blocks.push("");
    for (const line of bulletsForCandidate(lead)) blocks.push(line);
  } else if (fallback) {
    blocks.push(
      "Azure OpenAI in Azure Government was not exercised in this run — set AZURE_OPENAI_GOV_* to enable. Until then, the air-gapped fallback below is the operative recommendation.",
    );
    blocks.push("");
    blocks.push(
      `**Recommended (interim) path — air-gapped fallback promoted to lead:** ${fallback.displayName} (${fallback.origin.vendor}, ${fallback.origin.license}).`,
    );
    blocks.push("");
    for (const line of bulletsForCandidate(fallback)) blocks.push(line);
  } else {
    blocks.push(
      "No US-origin, security-review-approved candidate ran. The framing rule precludes recommending any of the surveyed candidates.",
    );
  }

  if (fallback && lead) {
    blocks.push("");
    blocks.push(
      `**Air-gapped fallback:** ${fallback.displayName} (lead self-hosted candidate; provenance-safe).`,
    );
    blocks.push("");
    for (const line of bulletsForCandidate(fallback)) blocks.push(line);
  }

  if (pending.length > 0) {
    blocks.push("");
    blocks.push(
      "**Pending security review — not approved for Treasury workloads without executive review:**",
    );
    blocks.push("");
    const items = pending.map((c) => {
      const report = c.report;
      const rate = report ? fmtPct(report.falseNegativeRate.rate) : "n/a";
      const note = c.origin.notes ? ` ${c.origin.notes}` : "";
      return `${c.displayName} (${c.origin.vendor}, ${c.origin.countryOfOrigin}-origin): false-negative rate ${rate}.${note}`;
    });
    blocks.push(`  - ${items.join("\n  - ")}`);
  }

  return blocks.join("\n");
}

export function buildComparison(
  results: ReadonlyArray<PerProviderResult>,
  opts?: { budgetMs?: number },
): ComparisonRanking {
  const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS;

  const { ranked, survivors } = buildRanking(results, budgetMs);

  const lead = pickLeadCandidate(survivors);
  const fallback = pickAirGappedFallback(survivors, lead?.providerId ?? null);
  const pending = pickPendingReview(survivors);

  const recommendationText = renderRecommendationText(
    results,
    survivors,
    lead,
    fallback,
    pending,
  );

  const recommendationStructured: RecommendationStructured = {
    leadCandidate: lead?.providerId ?? null,
    airGappedFallback: fallback?.providerId ?? null,
    pendingReview: pending.map((p) => p.providerId),
  };

  return { ranked, recommendationText, recommendationStructured };
}
