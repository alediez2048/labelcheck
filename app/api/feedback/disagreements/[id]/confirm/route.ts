/**
 * POST /api/feedback/disagreements/[id]/confirm — record the team's
 * confirmation for a sampled disagreement (P5-3).
 *
 * Body: `{ confirmation: "tool_was_right" | "agent_was_right" }`.
 *
 * The confirmation closes the loop on a sampled disagreement — without
 * it, every override would be treated downstream as a tool error and
 * the corpus would drift. Disagreements catch agent error too
 * (observability.md), so the queue is bidirectional.
 */

import { NextResponse } from "next/server";

import { updateCorpusRecord } from "@/lib/feedback/corpus";

type ConfirmBody = { confirmation?: unknown };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await req.json()) as ConfirmBody;
    const confirmation = body.confirmation;
    if (
      confirmation !== "tool_was_right" &&
      confirmation !== "agent_was_right"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Confirmation must be 'tool_was_right' or 'agent_was_right'.",
        },
        { status: 200 },
      );
    }
    const updated = await updateCorpusRecord(id, { confirmation });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: `No disagreement found for id ${id}.` },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 200 },
    );
  }
}
