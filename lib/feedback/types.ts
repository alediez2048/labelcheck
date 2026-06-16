/**
 * Feedback-loop types (P5-3).
 *
 * The full shared shape set for the agent-correction feedback loop —
 * recorder, override detector, sampler, corpus store, agreement
 * snapshot, and HTTP boundary. `CorpusRecord` is the on-disk JSONL
 * line schema and is the most load-bearing type in this module:
 * once a line is written to `eval-data/agent-corrections/{date}.jsonl`
 * it accumulates as ground-truth signal forever. Schema choices here
 * matter — see `lib/feedback/corpus.ts` for the documented append-
 * only contract.
 *
 * No applicant PII appears in these types: `applicationIdHash` is the
 * salted-SHA-256 form of the system applicant id (via
 * `lib/observability/redact.ts`), and `brand` is transcribed from the
 * label (system data, not applicant identity — see the deviation note
 * in the recorder). The corpus is non-PII by construction (NFR-4).
 */

import type { BeverageType, Lane } from "@/types";

/**
 * Three buckets the override detector classifies into:
 *
 *   - `agreement` — predicted lane matches the agent's effective lane;
 *     recorded but never sampled into the disagreement queue.
 *   - `flag`      — the tool said `match` (or generally cleared the
 *     application to a lane the agent disagreed with) and the agent
 *     called it out; future bake-offs treat this as a tool error
 *     candidate.
 *   - `clear`     — the tool said `mismatch` or `review` and the agent
 *     approved; future bake-offs treat this as a tool error candidate
 *     in the OTHER direction (over-flagging).
 */
export type OverrideKind = "flag" | "clear" | "agreement";

/**
 * One per-field tool prediction captured at disposition time. Shape
 * matches the verification span's per-field event so the recorder
 * never has to translate.
 */
export type PredictedField = {
  field: string;
  verdict: string;
  confidence: number;
  sourceFace: string | null;
};

/**
 * One row from the agent's structured return reason (FR-26a). Stored
 * on the corpus record verbatim — the reason field is already a
 * structured summary produced by the matcher (D4), not free-text from
 * the agent, so it's safe to keep as-is for the future bake-off
 * dataset.
 */
export type ReturnReasonField = {
  field: string;
  formValue: string;
  extractedValue: string | null;
  reason: string;
};

/**
 * The confirmation state for a sampled disagreement. New records start
 * as `pending`; the team's Confirm/Reject choice on the disagreement
 * queue updates this to one of the two terminal values. The bake-off
 * (P5-4) and any future fine-tuner reads `confirmation` to know which
 * side of the override was the ACTUAL ground truth — disagreements
 * catch agent error too, not just tool error (observability.md).
 */
export type ConfirmationState =
  | "pending"
  | "tool_was_right"
  | "agent_was_right";

/**
 * The JSONL line schema for `eval-data/agent-corrections/{date}.jsonl`.
 *
 * Append-only. Field choices are downstream-load-bearing: the bake-off
 * (P5-4) reads this; a future fine-tuner reads this. Adding fields is
 * fine (older lines just lack them); renaming or removing fields is
 * not — every existing line on disk would break.
 *
 * Privacy posture:
 *   - `applicationIdHash` is the salted-SHA-256 of the system applicant
 *     id (via `hashPii`). Never the raw id.
 *   - `brand` is transcribed from the label (system data, like the
 *     fields the matcher already records). Kept verbatim, matching the
 *     eval report (P5-2). NOT applicant identity.
 *   - `decidedBy` is the agent's system id (e.g., `agent-marcus`), not
 *     hashed — it's an internal role/identity, not applicant PII.
 *   - `returnReasonFields[i].reason` is the matcher's structured reason
 *     output (D4), not free-text from the agent.
 */
export type CorpusRecord = {
  /** Stable synthetic id — `<applicationIdHash>:<decidedAt>` is fine. */
  id: string;
  /** ISO timestamp of when the disposition was recorded. */
  recordedAt: string;
  /** `sha256:<8 hex>` — the system applicant id, hashed. */
  applicationIdHash: string;
  /** Transcribed from the label; system data per the deviation note. */
  brand: string | null;
  beverageType: BeverageType;
  /** What the tool's triage classifier said for this application. */
  predictedLane: Lane;
  /** The agent's call, derived from the disposition + structured reason. */
  effectiveLane: Lane;
  overrideKind: OverrideKind;
  /** The per-field verdicts the tool produced. */
  predictedFields: PredictedField[];
  /**
   * Per-field rows the agent flagged via the structured return reason
   * (FR-26a). Absent on `approve` dispositions.
   */
  returnReasonFields?: ReturnReasonField[];
  /** Agent / admin system id (D16). */
  decidedBy: string;
  /** ISO timestamp the agent decided. */
  decidedAt: string;
  /** Sampler decision — did this land in the disagreement queue? */
  sampled: boolean;
  /** Team confirmation; starts `pending` until the queue is reviewed. */
  confirmation: ConfirmationState;
};

/**
 * Rolling-window slice of the agreement snapshot — exposed by the
 * `/api/feedback/agreement` route to the Operations widget.
 */
export type AgreementWindow = {
  /** Configured window size (default 100; env `FEEDBACK_AGREEMENT_WINDOW`). */
  windowSize: number;
  /** How many records fell in the window (may be < windowSize early in life). */
  sampleSize: number;
  /** Fraction (0..1) of in-window records whose override kind is `agreement`. */
  agreementRate: number;
  /** `1 - agreementRate`. */
  overrideRate: number;
};

/**
 * The agreement snapshot — the rolling window, the all-time number,
 * and a per-beverage-type breakdown (ties to FR-28 routing: a
 * specialization-specific weak spot surfaces here).
 */
export type AgreementSnapshot = {
  rolling: AgreementWindow;
  allTime: {
    sampleSize: number;
    agreementRate: number;
    overrideRate: number;
  };
  byBeverageType: ReadonlyArray<{
    beverageType: BeverageType;
    sampleSize: number;
    agreementRate: number;
  }>;
};
