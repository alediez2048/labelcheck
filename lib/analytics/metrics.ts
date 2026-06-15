/**
 * Analytics metric selectors (P2-6).
 *
 * Pure functions over `QueueStoreState.dispositionedApplications` that
 * mirror the shape of `metric_rollup` in schema.md. The prototype
 * computes each rollup on the fly from the in-memory historical list;
 * the production swap is a read off the materialized table — same
 * return shape, same call site.
 *
 * Date math is parameterised through `now` so range-boundary tests are
 * deterministic. The default uses `Date.now()` (the page passes
 * `Date.now()` once and threads it through).
 *
 * The agent-scoped variants take an explicit `agentId` and filter on
 * `disposition.decidedBy`. The supervisor (admin role) decides match-
 * lane bulk-approvals; per-agent throughput is "exception work the
 * agent dispositioned" — so an admin's bulk-approve work shows up on
 * the division KPIs but NOT on per-agent throughput (the agent slice
 * filters by `decidedBy === agentId` and the throughput chart drops
 * admins).
 */

import {
  AVG_MANUAL_HANDLING_SECONDS,
} from "@/lib/queue/fixtures";
import type {
  DispositionedApplication,
  QueueStoreState,
} from "@/lib/queue/types";
import type { FieldName } from "@/types";

import type {
  AgentThroughput,
  AnalyticsRange,
  KpiSnapshot,
  MismatchReason,
  RecentDecision,
  TrendBucket,
  TriageBreakdown,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Friendly UI labels for the failing-field axis on the top-mismatch-
 * reasons chart. The schema names (FieldName) are wire-format snake_case;
 * the chart should read like English.
 */
const FIELD_LABEL: Record<FieldName, string> = {
  brand_name: "Brand name",
  fanciful_name: "Fanciful name",
  class_type: "Class/Type",
  alcohol_content: "Alcohol content",
  net_contents: "Net contents",
  producer_name: "Producer name",
  producer_address: "Producer address",
  country_of_origin: "Country of origin",
  government_warning: "Government warning",
};

/**
 * Number of days a range spans. Week = last 7 days; month = last 30
 * (calendar months are uneven, so 30 days is the dashboard convention
 * — same shape `metric_rollup` will materialize against).
 */
function daysForRange(range: AnalyticsRange): number {
  return range === "week" ? 7 : 30;
}

/**
 * Half-open window `[start, end)` covering the last `daysForRange(range)`
 * days, anchored on `now`. Exported for tests and consumers that need
 * to drive their own filtering.
 */
export function bucketsForRange(
  range: AnalyticsRange,
  now: number,
): { startMs: number; endMs: number } {
  const endMs = now;
  const startMs = endMs - daysForRange(range) * MS_PER_DAY;
  return { startMs, endMs };
}

/**
 * Predicate: `app` was dispositioned inside the `[startMs, endMs)`
 * window. Reads `disposition.decidedAt` — the moment the row left the
 * queue, which is the production source for the rollup.
 */
function dispositionedInRange(
  app: DispositionedApplication,
  startMs: number,
  endMs: number,
): boolean {
  const t = Date.parse(app.disposition.decidedAt);
  return t >= startMs && t < endMs;
}

/**
 * Build the four KPI numbers from a list of dispositioned applications.
 * Shared between `divisionKpis` and `agentKpis` — only the filter
 * differs.
 */
function kpisFrom(rows: ReadonlyArray<DispositionedApplication>): KpiSnapshot {
  const processed = rows.length;
  if (processed === 0) {
    return {
      processed: 0,
      matchRate: 0,
      exceptionRate: 0,
      avgHandlingSeconds: 0,
      hoursSaved: 0,
    };
  }
  const matchCount = rows.filter(
    (r) => r.verification.lane === "match",
  ).length;
  const matchRate = matchCount / processed;
  const exceptionRate = 1 - matchRate;

  const handlingSecondsSum = rows.reduce((sum, r) => {
    const received = Date.parse(r.receivedAt);
    const decided = Date.parse(r.disposition.decidedAt);
    return sum + Math.max(0, (decided - received) / 1000);
  }, 0);
  const avgHandlingSeconds = handlingSecondsSum / processed;

  const hoursSavedRaw =
    ((AVG_MANUAL_HANDLING_SECONDS - avgHandlingSeconds) * processed) / 3600;
  const hoursSaved = Math.max(0, hoursSavedRaw);

  return {
    processed,
    matchRate,
    exceptionRate,
    avgHandlingSeconds,
    hoursSaved,
  };
}

/**
 * Division-wide KPIs for the range. Reads every dispositioned row
 * regardless of who decided it (admin bulk-approve included).
 */
export function divisionKpis(
  state: QueueStoreState,
  range: AnalyticsRange,
  now: number = Date.now(),
): KpiSnapshot {
  const { startMs, endMs } = bucketsForRange(range, now);
  const rows = state.dispositionedApplications.filter((a) =>
    dispositionedInRange(a, startMs, endMs),
  );
  return kpisFrom(rows);
}

/**
 * Per-agent KPIs — same shape, filtered to `decidedBy === agentId`.
 * The supervisor's bulk-confirm work won't appear under an agent's id
 * (it's decided by the admin), so this is the agent's own throughput.
 */
export function agentKpis(
  state: QueueStoreState,
  agentId: string,
  range: AnalyticsRange,
  now: number = Date.now(),
): KpiSnapshot {
  const { startMs, endMs } = bucketsForRange(range, now);
  const rows = state.dispositionedApplications.filter(
    (a) =>
      a.disposition.decidedBy === agentId &&
      dispositionedInRange(a, startMs, endMs),
  );
  return kpisFrom(rows);
}

/**
 * Compute the start-of-week (Monday, UTC) for a given timestamp. The
 * volume trend uses Monday-anchored buckets so the week labels read
 * consistently regardless of which day the chart loads.
 */
function startOfIsoWeek(ms: number): number {
  const d = new Date(ms);
  // UTC day-of-week: 0 (Sun) .. 6 (Sat). Convert so Monday = 0.
  const day = d.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const mondayMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysFromMonday,
  );
  return mondayMs;
}

/** ISO date string (YYYY-MM-DD) for a UTC midnight timestamp. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * N-bucket volume trend, oldest first. Each bucket counts dispositioned
 * applications whose `receivedAt` falls inside that Monday-anchored
 * week. `weekStart` is the ISO date for the bucket's Monday.
 */
export function volumeTrend(
  state: QueueStoreState,
  weeks: number,
  now: number = Date.now(),
): TrendBucket[] {
  const currentMondayMs = startOfIsoWeek(now);
  const buckets: TrendBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStartMs = currentMondayMs - i * MS_PER_WEEK;
    const weekEndMs = weekStartMs + MS_PER_WEEK;
    const count = state.dispositionedApplications.reduce((c, a) => {
      const t = Date.parse(a.receivedAt);
      return t >= weekStartMs && t < weekEndMs ? c + 1 : c;
    }, 0);
    buckets.push({ weekStart: isoDate(weekStartMs), count });
  }
  return buckets;
}

/**
 * Triage breakdown over the AI lanes (not the agent dispositions).
 * Optional `agentId` filters to dispositions the named agent made.
 */
export function triageBreakdown(
  state: QueueStoreState,
  range: AnalyticsRange,
  agentId?: string,
  now: number = Date.now(),
): TriageBreakdown {
  const { startMs, endMs } = bucketsForRange(range, now);
  const rows = state.dispositionedApplications.filter((a) => {
    if (!dispositionedInRange(a, startMs, endMs)) return false;
    if (agentId !== undefined && a.disposition.decidedBy !== agentId) {
      return false;
    }
    return true;
  });
  const breakdown: TriageBreakdown = { match: 0, mismatch: 0, review: 0 };
  for (const a of rows) {
    breakdown[a.verification.lane] += 1;
  }
  return breakdown;
}

/**
 * Top mismatch reasons — counts of failing fields across the range.
 * Walks `verification.fields[]` for `verdict === "mismatch"`, groups by
 * `field`, returns rows sorted descending. Optional `agentId` filter
 * follows the same `decidedBy` rule.
 */
export function topMismatchReasons(
  state: QueueStoreState,
  range: AnalyticsRange,
  agentId?: string,
  now: number = Date.now(),
): MismatchReason[] {
  const { startMs, endMs } = bucketsForRange(range, now);
  const counts = new Map<FieldName, number>();
  for (const a of state.dispositionedApplications) {
    if (!dispositionedInRange(a, startMs, endMs)) continue;
    if (agentId !== undefined && a.disposition.decidedBy !== agentId) continue;
    for (const f of a.verification.fields) {
      if (f.verdict !== "mismatch") continue;
      counts.set(f.field, (counts.get(f.field) ?? 0) + 1);
    }
  }
  const rows: MismatchReason[] = [];
  for (const [field, count] of counts) {
    rows.push({ field, label: FIELD_LABEL[field], count });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

/**
 * Throughput by agent — one row per `role: "agent"` agent with their
 * processed count in the range. Admins (the bulk-approve supervisor)
 * are excluded because they're a different category of throughput
 * (they don't take from the work pool).
 */
export function throughputByAgent(
  state: QueueStoreState,
  range: AnalyticsRange,
  now: number = Date.now(),
): AgentThroughput[] {
  const { startMs, endMs } = bucketsForRange(range, now);
  const counts = new Map<string, number>();
  for (const a of state.dispositionedApplications) {
    if (!dispositionedInRange(a, startMs, endMs)) continue;
    const id = a.disposition.decidedBy;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rows: AgentThroughput[] = [];
  for (const agent of state.agents) {
    if (agent.role !== "agent") continue;
    rows.push({
      agentId: agent.id,
      agentName: agent.name,
      processed: counts.get(agent.id) ?? 0,
    });
  }
  // Sort descending by processed so the chart reads top-down.
  rows.sort((a, b) => b.processed - a.processed);
  return rows;
}

/**
 * The agent's most recent dispositions, newest first. Drives the
 * "recent decisions" list on My Stats. Row-scoped (D16; FR-29): an
 * agent only ever sees their own rows.
 */
export function recentDecisions(
  state: QueueStoreState,
  agentId: string,
  limit: number = 10,
): RecentDecision[] {
  const rows = state.dispositionedApplications
    .filter((a) => a.disposition.decidedBy === agentId)
    .slice()
    .sort(
      (a, b) =>
        Date.parse(b.disposition.decidedAt) -
        Date.parse(a.disposition.decidedAt),
    )
    .slice(0, limit);
  return rows.map((a) => ({
    applicationId: a.applicationId,
    brand: a.brand,
    decidedAt: a.disposition.decidedAt,
    disposition: a.disposition.disposition,
    lane: a.verification.lane,
  }));
}
