/**
 * Wire types for the feedback-loop UI surface.
 *
 * Mirrors the contract the parallel agent's API routes return
 * (GET /api/feedback/agreement, GET /api/feedback/disagreements,
 * POST /api/feedback/disagreements/[id]/confirm). Kept here — not in
 * `types/domain.ts` — because these are response shapes, not core domain
 * concepts. If the API moves, this file moves with it; the rest of the
 * domain stays untouched.
 */

import type { BeverageType } from "@/types";

export type FeedbackBeverageType = BeverageType;

export type FeedbackAgreementResponse = {
  rolling: {
    windowSize: number;
    sampleSize: number;
    agreementRate: number; // 0..1
    overrideRate: number;
  };
  allTime: {
    sampleSize: number;
    agreementRate: number;
    overrideRate: number;
  };
  byBeverageType: ReadonlyArray<{
    beverageType: FeedbackBeverageType;
    sampleSize: number;
    agreementRate: number;
  }>;
};

export type FeedbackDisagreementItem = {
  id: string;
  recordedAt: string;
  applicationIdHash: string;
  brand: string | null;
  beverageType: FeedbackBeverageType;
  predictedLane: "match" | "mismatch" | "review";
  effectiveLane: "match" | "mismatch" | "review";
  overrideKind: "flag" | "clear";
  predictedFields: ReadonlyArray<{
    field: string;
    verdict: string;
    confidence: number;
    sourceFace: string | null;
  }>;
  returnReasonFields?: ReadonlyArray<{
    field: string;
    formValue: string;
    extractedValue: string | null;
    reason: string;
  }>;
  confirmation: "pending" | "tool_was_right" | "agent_was_right";
};

export type FeedbackDisagreementsResponse = {
  items: ReadonlyArray<FeedbackDisagreementItem>;
};

export type FeedbackConfirmResponse =
  | { ok: true }
  | { ok: false; error: string };
