/**
 * GET /api/kb/sources — admin-only KB source list (P4-1).
 *
 * Thin pass-through onto `listSources` so the Knowledge Base UI can
 * poll for status transitions (`queued` → `indexing` → `ready` |
 * `failed`) while ingestion runs off the request path. The polling
 * cadence and stop condition are owned by the UI; the route is
 * stateless.
 *
 * Production note: in pgvector this becomes a `SELECT ... FROM
 * knowledge_base GROUP BY source_filename` aggregating chunk counts
 * and current status per source. The interface stays the same.
 */

import { NextResponse } from "next/server";

import { getStore } from "@/lib/kb/store";

export function GET(): NextResponse {
  return NextResponse.json({ sources: getStore().listSources() });
}
