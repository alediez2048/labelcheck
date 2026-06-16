/**
 * P5-4 bake-off comparison ranking tests.
 *
 * The framing rule is enforced in code (lib/eval/bakeoff/comparison.ts).
 * The load-bearing assertions:
 *
 *   1. A Chinese-origin candidate is NEVER in the leadCandidate slot,
 *      even when it has the lowest measured false-negative rate.
 *   2. The 5s p95 latency budget is a hard gate — a candidate failing it
 *      is excluded with a reason citing the budget.
 *   3. A not-run candidate is excluded with a reason citing the not-run.
 *   4. The air-gapped fallback slot prefers olmOCR over GLM-OCR / Qwen.
 *   5. Empty input yields leadCandidate: null and a recommendation that
 *      says no candidates ran.
 *   6. Recommendation text contains "Pending security review" when any
 *      pending-review candidate is in the input.
 *
 * These assertions encode the techstack.md "Stakeholder framing rule" —
 * not a policy in a doc, a contract in code.
 */

import { describe, expect, it } from "vitest";

import {
  buildComparison,
  type PerProviderResult,
} from "@/lib/eval/bakeoff/comparison";
import type { EvalReport } from "@/lib/eval/types";

function emptyReport(p95: number, fnr: number, ece: number = 0.05): EvalReport {
  return {
    runStartedAt: "2025-01-01T00:00:00.000Z",
    provider: "mock",
    caseCount: 10,
    falseNegativeRate: {
      totalRealNegatives: 10,
      leakedToMatch: Math.round(fnr * 10),
      rate: fnr,
      leakedCaseIds: [],
    },
    laneConfusion: {
      matrix: {
        match: { match: 1, mismatch: 0, review: 0 },
        mismatch: { match: 0, mismatch: 1, review: 0 },
        review: { match: 0, mismatch: 0, review: 1 },
      },
      perLaneAccuracy: { match: 1, mismatch: 1, review: 1 },
      overall: 1,
    },
    warningCheck: {
      presence: { tp: 1, tn: 1, fp: 0, fn: 0, accuracy: 1 },
      verbatim: { tp: 1, tn: 1, fp: 0, fn: 0, accuracy: 1 },
      allCaps: { tp: 1, tn: 1, fp: 0, fn: 0, accuracy: 1 },
    },
    calibration: { buckets: [], ece },
    perField: [],
    latency: {
      count: 10,
      p50: p95 / 2,
      p95,
      p99: p95,
      max: p95,
      budgetMs: 5000,
      budgetBreaches: [],
    },
  };
}

function mockEntry(): PerProviderResult {
  return {
    providerId: "mock",
    displayName: "Mock (CI baseline)",
    origin: {
      vendor: "LabelCheck",
      countryOfOrigin: "n/a",
      license: "Internal",
      inBoundary: "yes",
      securityReview: "not_required",
      notes: "Deterministic; for CI.",
    },
    estimatedCostPerCallUsd: 0,
    status: "ok",
    report: emptyReport(50, 0.15),
  };
}

function azureGovEntry(fnr: number = 0.05): PerProviderResult {
  return {
    providerId: "azure-openai-gov",
    displayName: "Azure OpenAI GPT-4o (Azure Government)",
    origin: {
      vendor: "Microsoft",
      countryOfOrigin: "United States",
      license: "Commercial SaaS",
      inBoundary: "via-azure-government",
      securityReview: "approved",
      notes: "Recommended production path. FedRAMP High; no external endpoint.",
    },
    estimatedCostPerCallUsd: 0.008,
    status: "ok",
    report: emptyReport(800, fnr),
  };
}

function olmocrEntry(fnr: number = 0.08): PerProviderResult {
  return {
    providerId: "olmocr",
    displayName: "olmOCR (self-hosted)",
    origin: {
      vendor: "Allen Institute for AI",
      countryOfOrigin: "United States",
      license: "Apache 2.0",
      inBoundary: "yes",
      securityReview: "approved",
      notes: "Provenance-safe lead for air-gapped deploys.",
    },
    estimatedCostPerCallUsd: 0,
    status: "ok",
    report: emptyReport(1200, fnr),
  };
}

function glmOcrEntry(fnr: number = 0.01, p95: number = 900): PerProviderResult {
  return {
    providerId: "glm-ocr",
    displayName: "GLM-OCR (self-hosted)",
    origin: {
      vendor: "Zhipu AI",
      countryOfOrigin: "China",
      license: "Custom OSS",
      inBoundary: "yes",
      securityReview: "pending",
      notes: "PENDING SECURITY REVIEW — Chinese-origin model.",
    },
    estimatedCostPerCallUsd: 0,
    status: "ok",
    report: emptyReport(p95, fnr),
  };
}

function qwenEntry(fnr: number = 0.02): PerProviderResult {
  return {
    providerId: "qwen-vl",
    displayName: "Qwen2.5-VL (self-hosted)",
    origin: {
      vendor: "Alibaba",
      countryOfOrigin: "China",
      license: "Custom OSS",
      inBoundary: "yes",
      securityReview: "pending",
      notes: "PENDING SECURITY REVIEW — Chinese-origin model.",
    },
    estimatedCostPerCallUsd: 0,
    status: "ok",
    report: emptyReport(1000, fnr),
  };
}

describe("buildComparison — stakeholder framing rule", () => {
  it("places Azure OpenAI in the lead even when a Chinese-origin candidate has the lowest false-negative rate", () => {
    // GLM-OCR has fnr 1%, the lowest. Azure has fnr 5%, second-lowest.
    // The framing rule MUST keep Azure in the lead.
    const results = [
      azureGovEntry(0.05),
      olmocrEntry(0.08),
      glmOcrEntry(0.01),
    ];
    const comparison = buildComparison(results);
    expect(comparison.recommendationStructured.leadCandidate).toBe(
      "azure-openai-gov",
    );
    expect(
      comparison.recommendationStructured.pendingReview,
    ).toContain("glm-ocr");
  });

  it("never seats a Chinese-origin candidate in the lead slot even with the best metrics by every tie-break", () => {
    // GLM has fnr 0%, p95 well under budget, lowest ECE. Azure is worse on
    // every axis. The framing rule still wins.
    const azure = azureGovEntry(0.3);
    if (azure.report) {
      azure.report.calibration = { buckets: [], ece: 0.5 };
    }
    const glm = glmOcrEntry(0.0, 100);
    if (glm.report) {
      glm.report.calibration = { buckets: [], ece: 0.001 };
    }
    const results = [azure, glm];
    const comparison = buildComparison(results);
    expect(comparison.recommendationStructured.leadCandidate).toBe(
      "azure-openai-gov",
    );
    expect(comparison.recommendationStructured.leadCandidate).not.toBe(
      "glm-ocr",
    );
  });

  it("never seats a Chinese-origin candidate in the lead slot when it is the ONLY survivor with the best metrics", () => {
    // Only GLM-OCR ran; no Azure / olmOCR in pool. The lead MUST be null
    // (not GLM-OCR) — and the recommendation surfaces the pending caveat.
    const results = [glmOcrEntry(0.0)];
    const comparison = buildComparison(results);
    expect(comparison.recommendationStructured.leadCandidate).toBeNull();
    expect(
      comparison.recommendationStructured.airGappedFallback,
    ).toBeNull();
    expect(comparison.recommendationStructured.pendingReview).toEqual([
      "glm-ocr",
    ]);
    expect(comparison.recommendationText).toContain(
      "Pending security review",
    );
  });

  it("excludes a candidate whose p95 exceeds the 5000ms budget with a reason citing the budget", () => {
    const slow = azureGovEntry(0.02);
    if (slow.report) {
      slow.report.latency = {
        ...slow.report.latency,
        p95: 6000,
      };
    }
    const results = [slow, olmocrEntry(0.08)];
    const comparison = buildComparison(results);
    const excluded = comparison.ranked.find(
      (r) => r.providerId === "azure-openai-gov",
    );
    expect(excluded?.reasonIfExcluded).toMatch(/p95.*5000/);
    expect(comparison.recommendationStructured.leadCandidate).not.toBe(
      "azure-openai-gov",
    );
  });

  it("excludes a not-run candidate with a reason citing the not-run", () => {
    const results: PerProviderResult[] = [
      {
        providerId: "azure-openai-gov",
        displayName: "Azure OpenAI GPT-4o (Azure Government)",
        origin: {
          vendor: "Microsoft",
          countryOfOrigin: "United States",
          license: "Commercial SaaS",
          inBoundary: "via-azure-government",
          securityReview: "approved",
        },
        estimatedCostPerCallUsd: 0.008,
        status: "not-run",
        reason: "Azure OpenAI Gov not provisioned",
      },
      olmocrEntry(0.08),
    ];
    const comparison = buildComparison(results);
    const excluded = comparison.ranked.find(
      (r) => r.providerId === "azure-openai-gov",
    );
    expect(excluded?.reasonIfExcluded).toMatch(/not provisioned/);
  });

  it("prefers olmOCR for the air-gapped fallback slot even if a Chinese-origin candidate has better metrics", () => {
    // GLM has fnr 1%, olmOCR has fnr 8%. The fallback slot still goes to olmOCR.
    const results = [
      azureGovEntry(0.05),
      olmocrEntry(0.08),
      glmOcrEntry(0.01),
      qwenEntry(0.02),
    ];
    const comparison = buildComparison(results);
    expect(comparison.recommendationStructured.airGappedFallback).toBe(
      "olmocr",
    );
    expect(
      comparison.recommendationStructured.airGappedFallback,
    ).not.toBe("glm-ocr");
    expect(
      comparison.recommendationStructured.airGappedFallback,
    ).not.toBe("qwen-vl");
  });

  it("returns leadCandidate: null and a no-candidates recommendation on empty input", () => {
    const comparison = buildComparison([]);
    expect(comparison.recommendationStructured.leadCandidate).toBeNull();
    expect(
      comparison.recommendationStructured.airGappedFallback,
    ).toBeNull();
    expect(comparison.recommendationStructured.pendingReview).toEqual([]);
    expect(comparison.recommendationText).toMatch(/no.*candidates/i);
  });

  it("surfaces 'Pending security review' in the recommendation text when any pending candidate is in the input", () => {
    const results = [azureGovEntry(0.05), olmocrEntry(0.08), glmOcrEntry(0.01)];
    const comparison = buildComparison(results);
    expect(comparison.recommendationText).toContain(
      "Pending security review",
    );
  });

  it("promotes the air-gapped fallback to the lead role when Azure is not in the pool", () => {
    const results = [olmocrEntry(0.05), glmOcrEntry(0.01)];
    const comparison = buildComparison(results);
    expect(comparison.recommendationStructured.leadCandidate).toBeNull();
    expect(comparison.recommendationStructured.airGappedFallback).toBe(
      "olmocr",
    );
    expect(comparison.recommendationText).toContain(
      "air-gapped fallback below is the operative recommendation",
    );
  });

  it("excludes the mock CI baseline from the lead slot (security review: not_required)", () => {
    // Mock has fnr 15% — the worst, but should never be the lead anyway
    // because its security-review status is "not_required" (CI fixture,
    // not a production candidate).
    const results = [mockEntry(), azureGovEntry(0.05)];
    const comparison = buildComparison(results);
    expect(comparison.recommendationStructured.leadCandidate).toBe(
      "azure-openai-gov",
    );
    expect(comparison.recommendationStructured.leadCandidate).not.toBe(
      "mock",
    );
  });
});

describe("buildComparison — ranking and tie-breaks", () => {
  it("ranks survivors by false-negative rate ASC", () => {
    const results = [
      olmocrEntry(0.1),
      azureGovEntry(0.05),
    ];
    const comparison = buildComparison(results);
    // Survivors come first, ordered by FN rate ASC.
    const survivorIds = comparison.ranked
      .filter((r) => r.reasonIfExcluded === undefined)
      .map((r) => r.providerId);
    expect(survivorIds[0]).toBe("azure-openai-gov");
    expect(survivorIds[1]).toBe("olmocr");
  });

  it("uses the budgetMs override when supplied", () => {
    const fast = olmocrEntry(0.05);
    if (fast.report) {
      fast.report.latency = { ...fast.report.latency, p95: 2000 };
    }
    const comparison = buildComparison([fast], { budgetMs: 1000 });
    const excluded = comparison.ranked.find((r) => r.providerId === "olmocr");
    expect(excluded?.reasonIfExcluded).toMatch(/p95.*1000/);
  });
});
