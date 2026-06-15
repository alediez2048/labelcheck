/**
 * Access gate — SPEND SHIELD, not authentication.
 *
 * Sits in front of the deployed app so an open URL cannot drain the model
 * budget (NFR-8). When ACCESS_PASSCODE is unset, the gate is a no-op so
 * local `pnpm dev` works passcode-free. When set, requests must present a
 * valid `lc_access` cookie (HMAC of a fixed payload, see lib/access/cookie.ts)
 * or be redirected to `/access` (for browser GETs) or get a 401 (everything
 * else).
 *
 * Production identity is P6-3 — PIV/CAC + SSO + RBAC + audit logging within
 * the FedRAMP boundary. If anyone treats THIS as authentication, the
 * comment-and-README discipline of this ticket has failed.
 *
 * Matcher excludes:
 *   - `_next`        Next.js bundled assets, including the access page's CSS
 *   - `favicon.ico`  served from app/, would 401 otherwise
 *   - `access`       the entry page itself (would lock its own door)
 *   - `api/access`   the POST handler that sets the cookie
 *   - `api/health`   the deploy health probe
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyCookie } from "@/lib/access/cookie";

export const config = {
  matcher: ["/((?!_next|favicon.ico|access|api/access|api/health).*)"],
};

const COOKIE_NAME = "lc_access";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const passcode = process.env.ACCESS_PASSCODE;
  if (!passcode) {
    // Local-dev convenience: no gate when no passcode is configured.
    return NextResponse.next();
  }

  const secret = process.env.ACCESS_COOKIE_SECRET;
  if (!secret) {
    // Misconfiguration — passcode set but no HMAC secret. Fail closed.
    return new NextResponse(
      "Access gate misconfigured: ACCESS_COOKIE_SECRET not set",
      { status: 500 },
    );
  }

  const cookieValue = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (await verifyCookie(cookieValue, secret)) {
    return NextResponse.next();
  }

  // Unauthenticated. Redirect browsers, 401 everything else.
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const url = req.nextUrl.clone();
    url.pathname = "/access";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return new NextResponse("Unauthorized", { status: 401 });
}
