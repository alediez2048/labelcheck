/**
 * GET /api/health — deploy probe. Excluded from the access gate so health
 * checks don't depend on a passcode being set.
 *
 * Intentionally minimal. Operator-facing observability lands in P5-1 (OTel).
 */

import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json({ ok: true });
}
