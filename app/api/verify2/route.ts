import { NextResponse } from "next/server";

import { runVerification } from "@/lib/verify/runVerification";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({
    alive: true,
    route: "verify2",
    runVerificationOk: typeof runVerification === "function",
  });
}
