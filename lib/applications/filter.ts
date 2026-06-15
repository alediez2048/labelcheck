/**
 * All Applications filter selector (P2-6).
 *
 * Pure function that produces the rows the All Applications table
 * renders. The store keeps two distinct collections after P2-6:
 *
 *  - `state.applications` — open work (status = `"in_queue"`).
 *  - `state.dispositionedApplications` — history (status set by the
 *    disposition, one of `approved | needs_correction | rejected`).
 *
 * The All Applications view is the full record (mockup.md), so it
 * unions both sets and lets the supervisor narrow with search, status,
 * date range, and assigned agent. Friendly UI labels are decoupled
 * from the schema enum (status values match `application.status` per
 * schema.md so a future prototype-to-production port is one-to-one).
 *
 * `now` is parameterised so range-boundary tests are deterministic;
 * production wires it to `Date.now()` (the default).
 */

import type {
  ApplicationStatus,
  DispositionedApplication,
  QueueApplication,
  QueueStoreState,
} from "@/lib/queue/types";
import type { BeverageType, Lane } from "@/types";

/**
 * Filter input the page owns in `useState`. Empty arrays / blank
 * search mean "no filter applied" so the default view shows the full
 * record.
 */
export type ApplicationFilterInput = {
  /** Free-text — matched case-insensitively against brand and TTB id. */
  search: string;
  /** Status multi-select; empty = all statuses. */
  statuses: ReadonlyArray<ApplicationStatus>;
  /** Date-range bucket. `all_time` disables the date filter. */
  range: "today" | "this_week" | "this_month" | "all_time";
  /** Agent multi-select; empty = all agents (incl. unassigned). */
  assignedAgentIds: ReadonlyArray<string>;
};

/** One row in the All Applications table. */
export type ApplicationsRow = {
  applicationId: string;
  brand: string;
  beverageType: BeverageType;
  status: ApplicationStatus;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  lane: Lane;
  receivedAt: string;
  /**
   * TTB id surrogate — the prototype fixtures do not carry a real
   * `ttb_id` column (schema.md), so the upper-cased applicationId
   * stands in for the public id. Documented as a prototype-only
   * substitution; production reads `application.ttb_id` directly.
   */
  ttbId: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the lower-bound timestamp for the requested range, given
 * `now`. `all_time` returns `-Infinity` so the filter is a no-op.
 *
 * `today` rounds back to the start of `now`'s calendar day in the
 * local timezone — the boundary the supervisor's "today" maps onto.
 * Week and month are simple rolling 7/30 day windows; these mirror
 * the dashboard math in the analytics selectors and match the
 * mockup's intuitive labels.
 */
function rangeStart(
  range: ApplicationFilterInput["range"],
  now: number,
): number {
  if (range === "all_time") return -Infinity;
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === "this_week") return now - 7 * MS_PER_DAY;
  return now - 30 * MS_PER_DAY;
}

/** Derive the synthetic TTB id used by the prototype rows. */
function ttbIdFor(applicationId: string): string {
  return applicationId.toUpperCase();
}

function rowFromOpen(
  app: QueueApplication,
  agentsById: Map<string, string>,
): ApplicationsRow {
  const agentId = app.assignedAgentId;
  const agentName = agentId !== null ? agentsById.get(agentId) ?? null : null;
  return {
    applicationId: app.applicationId,
    brand: app.brand,
    beverageType: app.beverageType,
    status: "in_queue",
    assignedAgentId: agentId,
    assignedAgentName: agentName,
    lane: app.verification.lane,
    receivedAt: app.receivedAt,
    ttbId: ttbIdFor(app.applicationId),
  };
}

function rowFromDispositioned(
  app: DispositionedApplication,
  agentsById: Map<string, string>,
): ApplicationsRow {
  const agentId = app.assignedAgentId ?? app.disposition.decidedBy;
  const agentName = agentsById.get(agentId) ?? null;
  return {
    applicationId: app.applicationId,
    brand: app.brand,
    beverageType: app.beverageType,
    status: app.status,
    assignedAgentId: agentId,
    assignedAgentName: agentName,
    lane: app.verification.lane,
    receivedAt: app.receivedAt,
    ttbId: ttbIdFor(app.applicationId),
  };
}

/**
 * Apply the filter input over the union of open + dispositioned rows.
 * The result is sorted by `receivedAt` descending so the most recent
 * intake floats to the top — matches the mockup's "most-recent first"
 * default.
 */
export function filterApplications(
  state: QueueStoreState & {
    dispositionedApplications?: ReadonlyArray<DispositionedApplication>;
  },
  input: ApplicationFilterInput,
  now: number = Date.now(),
): ApplicationsRow[] {
  const agentsById = new Map(state.agents.map((a) => [a.id, a.name]));

  const openRows = state.applications.map((a) => rowFromOpen(a, agentsById));
  const dispositioned = state.dispositionedApplications ?? [];
  const historyRows = dispositioned.map((a) =>
    rowFromDispositioned(a, agentsById),
  );
  const all: ApplicationsRow[] = [...openRows, ...historyRows];

  const term = input.search.trim().toLowerCase();
  const statusSet = new Set(input.statuses);
  const agentSet = new Set(input.assignedAgentIds);
  const lowerBound = rangeStart(input.range, now);

  const filtered = all.filter((row) => {
    if (term.length > 0) {
      const hay = `${row.brand} ${row.ttbId}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (statusSet.size > 0 && !statusSet.has(row.status)) return false;
    if (agentSet.size > 0) {
      if (row.assignedAgentId === null) return false;
      if (!agentSet.has(row.assignedAgentId)) return false;
    }
    if (lowerBound !== -Infinity) {
      const ts = Date.parse(row.receivedAt);
      if (Number.isNaN(ts) || ts < lowerBound) return false;
    }
    return true;
  });

  filtered.sort(
    (a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt),
  );
  return filtered;
}
