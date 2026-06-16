/**
 * QueueProvider → /api/feedback/record bridge (P5-3).
 *
 * Builds the recorder payload from a dispositioned application + the
 * `DispositionRecord` the pure mutation produced, then fires the POST.
 *
 * Fire-and-forget by design — the disposition write MUST NOT be
 * blocked by the feedback recorder (the central gotcha). Every error
 * is silently swallowed; the recorder side logs a span event. The
 * caller wraps this in `void` to silence the floating-promise warning.
 *
 * The pure splitting (separate file) keeps QueueProvider free of fetch
 * machinery and lets the bridge be unit-tested in isolation if we ever
 * want to. Today it's tiny enough that the API-route tests cover the
 * recorder contract end-to-end.
 */

import type { DispositionRecord } from "@/types";

import type { QueueApplication } from "./types";

type FeedbackRecordRequest = {
  applicationId: string;
  beverageType: string;
  brand: string | null;
  predictedLane: string;
  predictedFields: Array<{
    field: string;
    verdict: string;
    confidence: number;
    sourceFace: string | null;
  }>;
  disposition:
    | { kind: "approve" }
    | {
        kind: "return_for_correction";
        returnReason: {
          failedFields: Array<{
            field: string;
            formValue: string;
            extractedValue: string | null;
            reason: string;
          }>;
        };
      };
  decidedBy: string;
  decidedAt: string;
};

function buildPayload(
  application: QueueApplication,
  record: DispositionRecord,
): FeedbackRecordRequest {
  const predictedFields = application.verification.fields.map((f) => ({
    field: f.field,
    verdict: f.verdict,
    confidence: f.confidence,
    sourceFace: f.sourceFace,
  }));

  const base = {
    applicationId: application.applicationId,
    beverageType: application.beverageType,
    brand: application.brand,
    predictedLane: application.verification.lane,
    predictedFields,
    decidedBy: record.decidedBy,
    decidedAt: record.decidedAt,
  };

  if (record.disposition === "approve") {
    return { ...base, disposition: { kind: "approve" } };
  }
  const failedFields = record.returnReason?.failedFields.map((f) => ({
    field: f.field,
    formValue: f.formValue,
    extractedValue: f.extractedValue,
    reason: f.reason,
  })) ?? [];
  return {
    ...base,
    disposition: {
      kind: "return_for_correction",
      returnReason: { failedFields },
    },
  };
}

export async function postFeedbackRecord(args: {
  application: QueueApplication;
  record: DispositionRecord;
}): Promise<void> {
  // Server-side rendering: `fetch` exists in Next.js 15 on the server,
  // but the QueueProvider is a client component. The relative URL
  // works in both contexts.
  try {
    const payload = buildPayload(args.application, args.record);
    await fetch("/api/feedback/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // No-cors-style fire-and-forget: we don't read the response.
      keepalive: true,
    });
  } catch {
    // Silently swallow — feedback loop never blocks dispositions.
  }
}
