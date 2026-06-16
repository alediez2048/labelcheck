/**
 * Tool-vs-agent agreement metric (P5-3).
 *
 * Computes the live accuracy proxy observability.md names as the
 * highest-signal number the product produces. Three views over the
 * same corpus:
 *
 *   1. Rolling window — the last `windowSize` records by `recordedAt`
 *      descending. The Operations widget shows this as "today's pulse";
 *      a single bad batch surfaces immediately.
 *   2. All-time — every record ever written. The slow-moving baseline.
 *   3. Per beverage type — surfaces a specialization-specific weak
 *      spot (ties to FR-28 routing — D15 specializations).
 *
 * Pure function over `CorpusRecord[]`. The reader is the I/O layer
 * (`corpus.ts`); this module's only job is the math.
 *
 * Window size resolution: explicit argument > env
 * `FEEDBACK_AGREEMENT_WINDOW` > default 100.
 */

import type { BeverageType } from "@/types";

import type {
  AgreementSnapshot,
  AgreementWindow,
  CorpusRecord,
} from "./types";

const DEFAULT_WINDOW = 100;

function readWindowSizeEnv(): number {
  const raw = process.env.FEEDBACK_AGREEMENT_WINDOW;
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_WINDOW;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WINDOW;
  return parsed;
}

function safeRate(numerator: number, denom: number): number {
  return denom === 0 ? 0 : numerator / denom;
}

function summarise(records: ReadonlyArray<CorpusRecord>): {
  agreements: number;
  total: number;
  agreementRate: number;
} {
  let agreements = 0;
  for (const r of records) {
    if (r.overrideKind === "agreement") agreements += 1;
  }
  const total = records.length;
  return {
    agreements,
    total,
    agreementRate: safeRate(agreements, total),
  };
}

export function computeAgreement(
  records: ReadonlyArray<CorpusRecord>,
  options?: { windowSize?: number },
): AgreementSnapshot {
  const windowSize = options?.windowSize ?? readWindowSizeEnv();

  // Sort newest-first by recordedAt so the rolling window is the head.
  const sorted = [...records].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
  const windowSlice = sorted.slice(0, windowSize);

  const rollingStats = summarise(windowSlice);
  const allStats = summarise(records);

  const rolling: AgreementWindow = {
    windowSize,
    sampleSize: rollingStats.total,
    agreementRate: rollingStats.agreementRate,
    overrideRate: rollingStats.total === 0 ? 0 : 1 - rollingStats.agreementRate,
  };

  // Per-beverage breakdown across the full corpus. The Operations
  // widget renders the per-specialization view; surfacing a small
  // window per-type would be noisy at the volumes this proxy sees.
  const byType = new Map<BeverageType, CorpusRecord[]>();
  for (const r of records) {
    const list = byType.get(r.beverageType) ?? [];
    list.push(r);
    byType.set(r.beverageType, list);
  }
  const byBeverageType: AgreementSnapshot["byBeverageType"] = Array.from(
    byType.entries(),
  )
    .map(([beverageType, rows]) => {
      const s = summarise(rows);
      return {
        beverageType,
        sampleSize: s.total,
        agreementRate: s.agreementRate,
      };
    })
    .sort((a, b) => a.beverageType.localeCompare(b.beverageType));

  return {
    rolling,
    allTime: {
      sampleSize: allStats.total,
      agreementRate: allStats.agreementRate,
      overrideRate:
        allStats.total === 0 ? 0 : 1 - allStats.agreementRate,
    },
    byBeverageType,
  };
}
