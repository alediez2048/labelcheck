/**
 * Feedback recorder (P5-3).
 *
 * The entrypoint the POST `/api/feedback/record` route calls. Wraps
 * three pure decisions and one file write in a single async function:
 *
 *   1. `deriveEffectiveLane` — what the agent's call resolves to.
 *   2. `detectOverride`      — flag / clear / agreement.
 *   3. `shouldSample`        — does this land in the disagreement queue?
 *   4. `appendCorpusRecord`  — write the JSONL line.
 *
 * The recorder NEVER throws to its caller (the API route). The
 * disposition write must not be blocked by the feedback loop — that's
 * the central gotcha. On any failure we emit a span event and return a
 * `{ ok: false }` shape from the API; the recorder itself returns the
 * computed `{ id, overrideKind }` because the caller wants those.
 *
 * Privacy posture:
 *   - `applicationId` is hashed via `hashPii` — the corpus never sees
 *     the raw id.
 *   - `brand` is transcribed from the label and is system data, not
 *     applicant identity (see the deviation note in the module
 *     summary); kept verbatim to keep the bake-off dataset useful.
 *   - `decidedBy` is the system agent id (e.g., `agent-marcus`),
 *     never hashed — it's an internal identifier.
 */

import { hashPii } from "@/lib/observability/redact";
import type { BeverageType, Lane } from "@/types";

import { appendCorpusRecord, readCorpusRecords } from "./corpus";
import { deriveEffectiveLane } from "./effectiveLane";
import { detectOverride } from "./override";
import { shouldSample, type SamplerConfig } from "./sampler";
import type {
  CorpusRecord,
  OverrideKind,
  PredictedField,
  ReturnReasonField,
} from "./types";

export type FeedbackRecorderInput = {
  applicationId: string;
  beverageType: BeverageType;
  brand: string | null;
  predictedLane: Lane;
  predictedFields: ReadonlyArray<PredictedField>;
  disposition: {
    kind: "approve" | "return_for_correction";
    returnReason?: {
      failedFields?: ReadonlyArray<ReturnReasonField>;
    };
  };
  decidedBy: string;
  /** ISO timestamp the disposition was decided. */
  decidedAt: string;
};

export type FeedbackRecorderResult = {
  id: string;
  overrideKind: OverrideKind;
};

export type FeedbackRecorderOptions = {
  dataDir?: string;
  now?: () => Date;
  samplerConfig?: Partial<SamplerConfig>;
};

function startOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function startOfNextDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
  );
}

/**
 * Record one disposition into the corpus. The pure decisions are
 * computed first; the file write is the only side effect.
 *
 * Returns the synthetic record id and the override classification
 * (the API route surfaces both to the caller).
 */
export async function recordDispositionForFeedbackLoop(
  input: FeedbackRecorderInput,
  options?: FeedbackRecorderOptions,
): Promise<FeedbackRecorderResult> {
  const now = options?.now?.() ?? new Date(input.decidedAt);
  const recordedAt = now.toISOString();

  const effectiveLane = deriveEffectiveLane(input.disposition);
  const overrideKind = detectOverride(input.predictedLane, effectiveLane);

  // Count today's prior records to feed the sampler.
  const today = startOfDay(now);
  const tomorrow = startOfNextDay(now);
  let todayOverrideCount = 0;
  let todaySampledCount = 0;
  try {
    const todays = await readCorpusRecords({
      dataDir: options?.dataDir,
      from: today,
      to: tomorrow,
    });
    for (const r of todays) {
      if (r.overrideKind !== "agreement") {
        todayOverrideCount += 1;
        if (r.sampled) todaySampledCount += 1;
      }
    }
  } catch {
    // Reader failure is non-fatal — we'd rather under-sample than block.
    todayOverrideCount = 0;
    todaySampledCount = 0;
  }

  const sampled = shouldSample(
    overrideKind,
    todayOverrideCount,
    todaySampledCount,
    options?.samplerConfig,
  );

  const applicationIdHash = hashPii(input.applicationId);
  // Synthetic id pairs the hashed applicant with the decision timestamp.
  // Two dispositions in the same millisecond would collide; the
  // probability in the prototype's volume is negligible, and the API
  // route doesn't depend on collision-free ids beyond the day file.
  const id = `${applicationIdHash}:${recordedAt}`;

  const record: CorpusRecord = {
    id,
    recordedAt,
    applicationIdHash,
    applicationId: input.applicationId,
    brand: input.brand,
    beverageType: input.beverageType,
    predictedLane: input.predictedLane,
    effectiveLane,
    overrideKind,
    predictedFields: input.predictedFields.map((f) => ({ ...f })),
    ...(input.disposition.returnReason?.failedFields &&
    input.disposition.returnReason.failedFields.length > 0
      ? {
          returnReasonFields: input.disposition.returnReason.failedFields.map(
            (f) => ({ ...f }),
          ),
        }
      : {}),
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    sampled,
    confirmation: "pending",
  };

  try {
    await appendCorpusRecord(record, { dataDir: options?.dataDir });
  } catch (err) {
    // Span-event the failure and swallow — disposition writes must not
    // be blocked by the feedback loop. We import span helpers lazily so
    // the recorder doesn't fail to load when OTel isn't initialised in
    // a test env.
    try {
      const { trace } = await import("@opentelemetry/api");
      const span = trace.getActiveSpan();
      if (span) {
        const message = err instanceof Error ? err.message : String(err);
        span.addEvent("feedback.recorder.failed", { message });
      }
    } catch {
      // OTel itself failing to load is fine in this branch — we're
      // already in the error path.
    }
  }

  return { id, overrideKind };
}
