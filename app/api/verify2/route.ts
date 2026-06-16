import { NextResponse } from "next/server";

import { getWarningConfig } from "@/lib/config";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({
    alive: true,
    route: "verify2",
    warningOk: typeof getWarningConfig === "function",
  });
}
