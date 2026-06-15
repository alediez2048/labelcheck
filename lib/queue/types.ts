/**
 * Types for the agent worklist (P2-1).
 *
 * The queue model in code matches the schema in `docs/02-design/schema.md`
 * — `assignedAgentId` + `claimedAt` are the production fields the
 * persistence layer in P6-2 will own. Today they live in an in-memory
 * fixture store; the SHAPE is the same, so the route module that
 * consumes them is identical between prototype and production.
 *
 * A `QueueItem` is a derived view: the application plus its latest
 * VerificationResult plus the plain-language issue summary the queue
 * row renders. Derived means the route never re-runs the verification
 * pipeline to display a queue — that's the precomputation contract
 * from D15 (the router triages at intake, the agent worklist consumes).
 */

import type {
  BeverageType,
  FaceKind,
  Lane,
  VerificationResult,
} from "@/types";

/**
 * Production identity (PIV/CAC + SSO, P6-3) maps onto this shape.
 * Specialization drives the routing in P2-4; availability drives
 * eligibility per D15.
 *
 * `role` distinguishes Agent shells from Admin shells (D16); the P2-5
 * role switcher will swap the current id between agents and admins.
 * Today the operations page reads the supervisor from the seeded set
 * without a switcher.
 */
export type QueueAgent = {
  id: string;
  name: string;
  /** Role drives the shell (D16): `agent` sees My Queue, `admin` sees Operations. */
  role: "agent" | "admin";
  /** Beverage type(s) this agent is specialised in (FR-28, D15). */
  specializations: ReadonlyArray<BeverageType>;
  /** "available" can pull; "out_of_office" cannot (D15; CONTEXT.md Availability). */
  availability: "available" | "out_of_office";
};

/**
 * An application as the queue store sees it — the form input, the
 * uploaded faces (their public preview URL only, never bytes), the
 * latest verification result, and the routing / claim state.
 *
 * No PII to disk (NFR-4): the store holds metadata + the precomputed
 * verification, not raw image bytes. Faces carry a preview URL only,
 * which points at a sample fixture in `public/` for the prototype.
 */
export type QueueApplication = {
  applicationId: string;
  /** Display label for the row — usually the brand. */
  brand: string;
  beverageType: BeverageType;
  /** Uploaded faces (preview URLs only). */
  faces: ReadonlyArray<{ kind: FaceKind; previewUrl: string }>;
  /** The latest verification result the queue row renders. */
  verification: VerificationResult;
  /** Routing / claim state — null until claimed (CONTEXT.md Claim). */
  assignedAgentId: string | null;
  /** ISO timestamp set on claim; null while unclaimed. */
  claimedAt: string | null;
  /** ISO timestamp when the application arrived at intake. */
  receivedAt: string;
  /** Wall-clock duration the verification took, in milliseconds — feeds the funnel's avg latency (P1-11 instrumentation). */
  verifiedDurationMs: number;
};

/** Derived row view the queue UI consumes. */
export type QueueItem = {
  application: QueueApplication;
  /** Worst-verdict-field one-line summary, rendered on the row. */
  issueSummary: string;
  /** Lane copied off the verification for sort + render. */
  lane: Lane;
};

/** Shape stored in the React context. */
export type QueueStoreState = {
  agents: ReadonlyArray<QueueAgent>;
  applications: ReadonlyArray<QueueApplication>;
  currentAgentId: string;
  /**
   * Rolling baseline match rate (0..1) — what fraction of past
   * applications the system landed in the match lane. Today's match
   * rate is compared against this to produce the delta-vs-baseline
   * pill on the Operations view (FR-23). In production this is a
   * `metric_rollup` read; the prototype seeds a constant.
   */
  baselineMatchRate: number;
  /**
   * Synthetic audit log — every router-driven assignment, hand-assign,
   * and reassign appends an entry here (P2-3). Production maps these
   * 1:1 onto the `audit_event` table in schema.md; the prototype
   * surfaces them inline (no persistence, NFR-4).
   */
  auditEvents: ReadonlyArray<AuditEvent>;
};

export type ClaimOutcome =
  | { ok: true; claimed: QueueApplication }
  | { ok: false; reason: "no_eligible_pool_item" | "agent_unavailable" };

/**
 * Audit log entry written by router operations (P2-3).
 *
 * `eventType: "assigned"` covers claim and supervisor hand-assign;
 * `eventType: "override"` covers supervisor reassign (incl. return-to-
 * pool) and the implicit "prior claim cleared" case in admitToPool.
 * Production's `audit_event` table holds the same shape (schema.md);
 * `metadata` carries the operation-specific context (previous
 * assignee, actor role, from/to ids).
 */
export type AuditEvent = {
  id: string;
  applicationId: string;
  actorId: string;
  eventType: "assigned" | "override";
  occurredAt: string;
  metadata?: Readonly<Record<string, unknown>>;
};
