/**
 * Cookie sign/verify tests — skeleton until P0-7 wires Vitest.
 *
 * Verifies the round-trip works, the wrong secret fails, and a tampered
 * cookie value fails. The `timingSafeEqualString` happy path / mismatch
 * cases are smoke-tested too.
 */

import {
  signCookie,
  verifyCookie,
  timingSafeEqualString,
} from "../cookie";

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): {
  toBe(expected: T): void;
  toBeDefined(): void;
  toMatch(expected: RegExp): void;
};

describe("signCookie / verifyCookie", () => {
  it("round-trips with the same secret", async () => {
    const secret = "super-long-random-secret-32-bytes-min";
    const cookie = await signCookie(secret);
    expect(typeof cookie).toBe("string");
    expect(await verifyCookie(cookie, secret)).toBe(true);
  });

  it("fails when the secret differs", async () => {
    const cookie = await signCookie("secret-A");
    expect(await verifyCookie(cookie, "secret-B")).toBe(false);
  });

  it("fails on empty cookie value", async () => {
    expect(await verifyCookie("", "any-secret")).toBe(false);
  });

  it("fails on garbage cookie value", async () => {
    expect(await verifyCookie("not-a-valid-base64url-token!!", "any-secret")).toBe(false);
  });

  it("produces a base64url-safe cookie (no +, /, =)", async () => {
    const cookie = await signCookie("secret");
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("timingSafeEqualString", () => {
  it("returns true on equal strings", () => {
    expect(timingSafeEqualString("abcdef", "abcdef")).toBe(true);
  });

  it("returns false on different strings of same length", () => {
    expect(timingSafeEqualString("abcdef", "abcdez")).toBe(false);
  });

  it("returns false on different-length strings", () => {
    expect(timingSafeEqualString("abc", "abcdef")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqualString("", "")).toBe(true);
  });
});
