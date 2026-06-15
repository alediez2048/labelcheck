/**
 * GET /api/batch/[id] — poll batch progress and per-item results.
 *
 * Returns `BatchPollResponse` (jobId, createdAt, progress, items,
 * finished). The UI polls this on a short interval (P3-1 results view)
 * until `finished === true`. State lives in `lib/batch/store.ts` — a
 * module-level Map; a restart returns 404 by design (D2, NFR-4).
 */

import { NextResponse } from "next/server";

import { getJob, summarizeProgress } from "@/lib/batch/store";
import type { BatchPollResponse } from "@/lib/batch/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: Request,
  context: Params,
): Promise<NextResponse> {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json(
      { error: `Batch ${id} not found.` },
      { status: 404 },
    );
  }

  const progress = summarizeProgress(job);
  const finished = job.items.every(
    (item) => item.status === "done" || item.status === "failed",
  );
  const response: BatchPollResponse = {
    jobId: job.jobId,
    createdAt: job.createdAt,
    progress,
    items: job.items,
    finished,
  };
  return NextResponse.json(response);
}
