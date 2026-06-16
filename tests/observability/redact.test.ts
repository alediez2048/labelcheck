/**
 * Tests for `lib/observability/redact.ts`.
 *
 * These tests are the audit boundary for the privacy posture in
 * `docs/PRIVACY-IN-TRACES.md`. The contract: applicant strings hashed,
 * system ids verbatim, salt swap produces a different hash, the input
 * substring never appears in the output.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  hashPii,
  isSafeAttributeKey,
  SAFE_ATTRIBUTE_KEYS,
} from "@/lib/observability/redact";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("hashPii", () => {
  it("returns the sha256: prefix and an 8-char hex suffix", () => {
    const h = hashPii("Marcus Lee");
    expect(h.startsWith("sha256:")).toBe(true);
    expect(h.length).toBe("sha256:".length + 8);
    expect(/^sha256:[0-9a-f]{8}$/.test(h)).toBe(true);
  });

  it("is stable: same input + same salt produces the same hash", () => {
    vi.stubEnv("PII_HASH_SALT", "test-salt-A");
    const a = hashPii("Marcus Lee");
    const b = hashPii("Marcus Lee");
    expect(a).toBe(b);
  });

  it("changes when PII_HASH_SALT changes (rainbow-table resistance)", () => {
    vi.stubEnv("PII_HASH_SALT", "salt-A");
    const a = hashPii("Marcus Lee");
    vi.stubEnv("PII_HASH_SALT", "salt-B");
    const b = hashPii("Marcus Lee");
    expect(a).not.toBe(b);
  });

  it("does not contain any substring of the plain input", () => {
    const input = "123 Vine St";
    const hash = hashPii(input);
    expect(hash.includes("Vine")).toBe(false);
    expect(hash.includes("123")).toBe(false);
    expect(hash.includes(input)).toBe(false);
  });

  it("differentiates two distinct inputs", () => {
    vi.stubEnv("PII_HASH_SALT", "test-salt");
    const a = hashPii("Marcus Lee");
    const b = hashPii("Anna Reyes");
    expect(a).not.toBe(b);
  });
});

describe("SAFE_ATTRIBUTE_KEYS", () => {
  it("includes the verification span scalars", () => {
    expect(SAFE_ATTRIBUTE_KEYS.has("verification.id")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("verification.lane")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("verification.overall_confidence")).toBe(
      true,
    );
    expect(SAFE_ATTRIBUTE_KEYS.has("verification.face_count")).toBe(true);
  });

  it("includes the extraction child-span scalars", () => {
    expect(SAFE_ATTRIBUTE_KEYS.has("extraction.provider")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("extraction.outcome")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("extraction.duration_ms")).toBe(true);
  });

  it("includes the assistant turn scalars", () => {
    expect(SAFE_ATTRIBUTE_KEYS.has("assistant.role")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("assistant.intent_tags")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("assistant.retrieved_sources")).toBe(true);
    expect(SAFE_ATTRIBUTE_KEYS.has("assistant.total_ms")).toBe(true);
  });

  it("does NOT include applicant-data fields", () => {
    expect(SAFE_ATTRIBUTE_KEYS.has("applicant.name")).toBe(false);
    expect(SAFE_ATTRIBUTE_KEYS.has("applicant.address")).toBe(false);
    expect(SAFE_ATTRIBUTE_KEYS.has("assistant.question")).toBe(false);
  });
});

describe("isSafeAttributeKey", () => {
  it("returns true for static safe keys", () => {
    expect(isSafeAttributeKey("verification.id")).toBe(true);
    expect(isSafeAttributeKey("extraction.provider")).toBe(true);
  });

  it("returns true for the dynamic per-field family", () => {
    expect(isSafeAttributeKey("verification.field.brand_name.verdict")).toBe(
      true,
    );
    expect(
      isSafeAttributeKey("verification.field.alcohol_content.confidence"),
    ).toBe(true);
    expect(
      isSafeAttributeKey("verification.field.government_warning.source_face"),
    ).toBe(true);
  });

  it("returns false for arbitrary keys", () => {
    expect(isSafeAttributeKey("applicant.name")).toBe(false);
    expect(isSafeAttributeKey("free.text.note")).toBe(false);
    expect(isSafeAttributeKey("verification.field.brand_name.value")).toBe(
      false,
    );
  });
});
