/**
 * Access-gate cookie sign/verify — HMAC-SHA256 over a fixed payload.
 *
 * Edge-runtime compatible — uses WebCrypto (`crypto.subtle`), no
 * `node:crypto`. This file is imported by both `middleware.ts` (runs at
 * the Edge) and `app/api/access/route.ts` (Node runtime by default);
 * WebCrypto is available in both.
 *
 * Scheme:
 *   - Server has two env vars: ACCESS_PASSCODE (what the user types) and
 *     ACCESS_COOKIE_SECRET (long random server-side secret for HMAC).
 *   - On a correct passcode submission the server signs a fixed payload
 *     with HMAC-SHA256(secret, "ok") and sets the result as the cookie.
 *   - On every subsequent request, the middleware recomputes the HMAC
 *     and uses `crypto.subtle.verify` (constant-time by spec) to compare.
 *   - The cookie is NEVER the passcode itself — it's a proof-of-
 *     knowledge token signed by the server.
 *
 * SPEND SHIELD, not security. This file protects the model budget. It is
 * NOT authentication, RBAC, or audit (those are P6-3, PIV/CAC + SSO).
 */

const COOKIE_PAYLOAD = "ok";

function toBase64Url(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < u8.length; i++) {
    bin += String.fromCharCode(u8[i] as number);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  // Allocate a concrete ArrayBuffer (not SharedArrayBuffer) so the typed
  // array is assignable to `BufferSource` under TS 5.7+'s stricter generic
  // typing of Uint8Array.
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(
  secret: string,
  usage: "sign" | "verify",
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/**
 * Sign the fixed payload with the server secret. Called once on a
 * correct passcode submission. Returns the base64url-encoded HMAC, ready
 * to be set as the cookie value.
 */
export async function signCookie(secret: string): Promise<string> {
  const key = await importHmacKey(secret, "sign");
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(COOKIE_PAYLOAD),
  );
  return toBase64Url(sig);
}

/**
 * Verify a cookie value. Returns true iff the HMAC matches.
 * `crypto.subtle.verify` is constant-time by spec — preferred over a
 * manual string compare.
 */
export async function verifyCookie(
  cookieValue: string,
  secret: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromBase64Url(cookieValue);
  } catch {
    return false;
  }
  const key = await importHmacKey(secret, "verify");
  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      new TextEncoder().encode(COOKIE_PAYLOAD),
    );
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison for the one place we compare user
 * input to a server secret directly — the passcode submission. A naive
 * `===` invites timing oracle attacks even on a "just a spend shield"
 * passcode; this is cheaper than explaining why later.
 *
 * Length leak: this returns early on length mismatch. The passcode
 * length is fixed per deploy and known to operators, so the leak is
 * not material; the alternative (padding to a fixed length) is more
 * code without a real defensive gain.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
