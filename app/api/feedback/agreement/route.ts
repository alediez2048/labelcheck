/**
 * GET /api/feedback/agreement — tool-vs-agent agreement snapshot (P5-3).
 *
 * Reads the full corpus, computes the rolling window + all-time +
 * per-beverage-type breakdown, returns the snapshot. Consumed by the
 * Operations widget the parallel UI agent is building.
 *
 * No applicant data on the wire: every field in the response is a
 * count, a rate, an enum, or a window-size integer. Same NFR-4
 * posture as the rest of the corpus surface.
 */

import { NextResponse } from "next/server";

import { computeAgreement } from "@/lib/feedback/agreement";
import { readCorpusRecords } from "@/lib/feedback/corpus";

export async function GET(): Promise<NextResponse> {
  try {
    const records = await readCorpusRecords();
    const snapshot = computeAgreement(records);
    return NextResponse.json(snapshot, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
