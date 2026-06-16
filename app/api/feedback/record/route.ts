/**
 * POST /api/feedback/record — agent-correction feedback loop write
 * endpoint (P5-3).
 *
 * Called by the QueueProvider as a fire-and-forget after a disposition
 * is recorded. The handler MUST NOT return a non-2xx on internal
 * failure — the gotcha is explicit: the disposition write must not be
 * blocked by the feedback recorder. So:
 *
 *   - On success: 202 Accepted with `{ ok: true, id, overrideKind }`.
 *   - On any error: 200 OK with `{ ok: false, error }` — same as a
 *     swallowed failure, so the caller never sees a network-level
 *     failure that might propagate. The span event in the recorder
 *     carries the actual error signal for observability.
 *
 * No auth: the gate at `middleware.ts` covers the route. The recorder
 * itself is server-side; there's no cross-origin write surface.
 */

import { NextResponse } from "next/server";

import {
  recordDispositionForFeedbackLoop,
  type FeedbackRecorderInput,
} from "@/lib/feedback/recorder";
import type { BeverageType, Lane } from "@/types";

type JsonField = { field?: unknown; verdict?: unknown; confidence?: unknown; sourceFace?: unknown };
type JsonReturnField = {
  field?: unknown;
  formValue?: unknown;
  extractedValue?: unknown;
  reason?: unknown;
};
type JsonDisposition = {
  kind?: unknown;
  returnReason?: { failedFields?: unknown } | undefined;
};
type JsonBody = {
  applicationId?: unknown;
  beverageType?: unknown;
  brand?: unknown;
  predictedLane?: unknown;
  predictedFields?: unknown;
  disposition?: JsonDisposition;
  decidedBy?: unknown;
  decidedAt?: unknown;
};

const BEVERAGE_TYPES: ReadonlySet<BeverageType> = new Set<BeverageType>([
  "wine",
  "distilled_spirits",
  "malt_beverage",
]);

const LANES: ReadonlySet<Lane> = new Set<Lane>([
  "match",
  "mismatch",
  "review",
]);

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function decodeInput(raw: JsonBody): FeedbackRecorderInput | null {
  if (
    !isString(raw.applicationId) ||
    !isString(raw.beverageType) ||
    !BEVERAGE_TYPES.has(raw.beverageType as BeverageType) ||
    !isString(raw.predictedLane) ||
    !LANES.has(raw.predictedLane as Lane) ||
    !isString(raw.decidedBy) ||
    !isString(raw.decidedAt)
  ) {
    return null;
  }
  if (!Array.isArray(raw.predictedFields)) return null;
  if (
    !raw.disposition ||
    typeof raw.disposition !== "object" ||
    !isString(raw.disposition.kind) ||
    (raw.disposition.kind !== "approve" &&
      raw.disposition.kind !== "return_for_correction")
  ) {
    return null;
  }

  const predictedFields = raw.predictedFields
    .map((f: unknown): { field: string; verdict: string; confidence: number; sourceFace: string | null } | null => {
      const row = f as JsonField;
      if (!isString(row.field) || !isString(row.verdict)) return null;
      const confidence =
        typeof row.confidence === "number" ? row.confidence : 0;
      const sourceFace =
        isString(row.sourceFace) ? row.sourceFace : null;
      return {
        field: row.field,
        verdict: row.verdict,
        confidence,
        sourceFace,
      };
    })
    .filter((f): f is { field: string; verdict: string; confidence: number; sourceFace: string | null } => f !== null);

  const failedFieldsRaw = raw.disposition.returnReason?.failedFields;
  const failedFields = Array.isArray(failedFieldsRaw)
    ? failedFieldsRaw
        .map((f: unknown): { field: string; formValue: string; extractedValue: string | null; reason: string } | null => {
          const row = f as JsonReturnField;
          if (!isString(row.field) || !isString(row.formValue) || !isString(row.reason)) {
            return null;
          }
          const extractedValue = isString(row.extractedValue)
            ? row.extractedValue
            : null;
          return {
            field: row.field,
            formValue: row.formValue,
            extractedValue,
            reason: row.reason,
          };
        })
        .filter((f): f is { field: string; formValue: string; extractedValue: string | null; reason: string } => f !== null)
    : [];

  const brand: string | null = isString(raw.brand) ? raw.brand : null;

  return {
    applicationId: raw.applicationId,
    beverageType: raw.beverageType as BeverageType,
    brand,
    predictedLane: raw.predictedLane as Lane,
    predictedFields,
    disposition:
      raw.disposition.kind === "approve"
        ? { kind: "approve" }
        : {
            kind: "return_for_correction",
            returnReason: { failedFields },
          },
    decidedBy: raw.decidedBy,
    decidedAt: raw.decidedAt,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const json = (await req.json()) as JsonBody;
    const input = decodeInput(json);
    if (!input) {
      return NextResponse.json(
        { ok: false, error: "Invalid feedback record payload." },
        { status: 200 },
      );
    }
    const { id, overrideKind } =
      await recordDispositionForFeedbackLoop(input);
    return NextResponse.json(
      { ok: true, id, overrideKind },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 200 },
    );
  }
}
