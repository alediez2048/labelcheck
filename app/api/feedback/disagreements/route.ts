/**
 * GET /api/feedback/disagreements — today's sampled disagreement queue
 * (P5-3).
 *
 * Reads today's corpus records (UTC day window), filters to
 * `sampled: true`, and shapes the rows into the UI contract the
 * parallel agent built against. The route is the only place the
 * corpus-record → UI-row mapping lives.
 *
 * Admin-only at the UI layer (D16); the route itself doesn't gate
 * because there's no auth in the prototype. P6-3 (PIV/CAC + SSO +
 * RBAC) replaces the middleware-level gate with real role checks.
 */

import { NextResponse } from "next/server";

import { readCorpusRecords } from "@/lib/feedback/corpus";

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function startOfNextUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const now = new Date();
    const from = startOfUtcDay(now);
    const to = startOfNextUtcDay(now);
    const records = await readCorpusRecords({ from, to });
    const items = records
      .filter((r) => r.sampled)
      .map((r) => ({
        id: r.id,
        recordedAt: r.recordedAt,
        applicationIdHash: r.applicationIdHash,
        brand: r.brand,
        beverageType: r.beverageType,
        predictedLane: r.predictedLane,
        effectiveLane: r.effectiveLane,
        // The disagreement queue never shows agreement rows by
        // construction (the sampler skips them), so the wire type is
        // narrower than the corpus enum.
        overrideKind:
          r.overrideKind === "clear" ? ("clear" as const) : ("flag" as const),
        predictedFields: r.predictedFields,
        ...(r.returnReasonFields
          ? { returnReasonFields: r.returnReasonFields }
          : {}),
        confirmation: r.confirmation,
      }));
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
