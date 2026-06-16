import { NextResponse } from "next/server";

import { withVerificationSpan } from "@/lib/observability/spans";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({
    alive: true,
    route: "verify2",
    spanOk: typeof withVerificationSpan === "function",
  });
}
