/**
 * POST /api/access — handle passcode submission, set the HMAC cookie on
 * success, redirect back to the originating path.
 *
 * SPEND SHIELD only. Production is P6-3 (PIV/CAC + SSO + RBAC + audit).
 */

import { NextResponse, type NextRequest } from "next/server";

import { signCookie, timingSafeEqualString } from "@/lib/access/cookie";

const COOKIE_NAME = "lc_access";

/** Constrain the `next` redirect target to same-origin, non-protocol-relative. */
function sanitizeNext(input: unknown): string {
  if (typeof input !== "string") return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  return input;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const passcode = process.env.ACCESS_PASSCODE;
  const secret = process.env.ACCESS_COOKIE_SECRET;

  // If misconfigured server-side, fail back to the entry page with error.
  if (!passcode || !secret) {
    return NextResponse.redirect(new URL("/access?error=1", req.url), { status: 303 });
  }

  const form = await req.formData();
  const submitted = form.get("passcode");
  const nextPath = sanitizeNext(form.get("next"));

  if (typeof submitted !== "string" || !timingSafeEqualString(submitted, passcode)) {
    const url = new URL("/access", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, { status: 303 });
  }

  const cookieValue = await signCookie(secret);
  const res = NextResponse.redirect(new URL(nextPath, req.url), { status: 303 });
  res.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
