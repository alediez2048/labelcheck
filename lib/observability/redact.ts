/**
 * PII redaction at the trace boundary (P5-1).
 *
 * Every string that touches a span attribute must pass through this
 * module — either the key is in the allow-list (and the value is safe
 * verbatim) or the value is hashed with a salted SHA-256. The hash is
 * irreversible by rainbow table because the salt comes from env; in
 * production `PII_HASH_SALT` is REQUIRED, in dev a fixed fallback is
 * used with a console warning.
 *
 * The hash format is `sha256:<8 hex chars>` — the first 8 hex chars of
 * the full digest. That keeps traces readable (you can tell two
 * different inputs apart) without making them rainbow-table-able.
 *
 * See `docs/PRIVACY-IN-TRACES.md` for the auditor-facing summary of
 * what's hashed vs. kept verbatim, and `docs/02-design/observability.md`
 * for the underlying policy (Privacy section).
 */

import { createHash } from "node:crypto";

const FALLBACK_SALT = "labelcheck-dev-salt-not-for-production";

let warnedFallback = false;

/**
 * Resolve the PII salt at call time. Reads `process.env.PII_HASH_SALT`
 * on every invocation so `vi.stubEnv` in tests is honoured. When the
 * env is unset we emit a single console.warn (in non-test envs) the
 * first time we fall back, then keep going with the dev default.
 *
 * Production deployments MUST set `PII_HASH_SALT` — see the README and
 * `docs/PRIVACY-IN-TRACES.md`. A missing salt does not throw because
 * traces are an out-of-band signal and a startup throw would take the
 * whole request hot path down with it; instead we warn loudly and
 * proceed with the fallback so dev keeps working.
 */
function getSalt(): string {
  const fromEnv = process.env.PII_HASH_SALT;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }
  if (!warnedFallback && process.env.NODE_ENV !== "test") {
    warnedFallback = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[observability/redact] PII_HASH_SALT is not set — using the development fallback. " +
        "This MUST be set to a real secret in production.",
    );
  }
  return FALLBACK_SALT;
}

/**
 * Salted SHA-256 hash. Returns `sha256:<8 hex chars>` of the salted
 * digest. The 8-character prefix is long enough that two distinct
 * applicant names produce visibly distinct hashes in a trace but
 * short enough that the trace stays readable.
 *
 * Same input + same salt → same output (stable; useful for grouping
 * a trace by hashed applicant identity).
 * Different salt → different output (the salt is the security barrier
 * against rainbow-table reversal).
 */
export function hashPii(value: string): string {
  const salt = getSalt();
  const digest = createHash("sha256").update(salt).update(value).digest("hex");
  return `sha256:${digest.slice(0, 8)}`;
}

/**
 * Allow-list of attribute keys whose values are safe to record on a
 * span verbatim — they are either system-internal ids, enums, or
 * derived numbers. Any string-valued attribute whose key is NOT in
 * this set must be passed through `hashPii` first.
 *
 * The list is authoritative — `lib/observability/spans.ts` filters
 * every `setAttributes` call against it. Adding a new safe key is a
 * deliberate audit step: cross-reference it against the
 * observability.md Privacy section and docs/PRIVACY-IN-TRACES.md.
 */
export const SAFE_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set<string>([
  // Verification span scalars (system ids / enums / derived numbers).
  "verification.id",
  "verification.lane",
  "verification.overall_confidence",
  "verification.face_count",

  // Extraction child-span scalars (no transcribed text).
  "extraction.provider",
  "extraction.outcome",
  "extraction.duration_ms",
  "extraction.face_count",

  // Assistant turn scalars (no message text — only structural facts).
  "assistant.role",
  "assistant.intent_tags",
  "assistant.refusal_template",
  "assistant.postcheck_action",
  "assistant.used_tool",
  "assistant.retrieved_count",
  "assistant.retrieved_sources",
  "assistant.total_ms",

  // Generic HTTP / request scalars.
  "http.status_code",
  "http.method",
  "request.duration_ms",
]);

/**
 * Per-field verdict/confidence/source-face attribute prefixes are
 * dynamically generated (`verification.field.<name>.verdict`). The
 * `isSafeAttributeKey` helper recognises the family without bloating
 * the static set.
 */
const PER_FIELD_PREFIX = /^verification\.field\.[a-z_]+\.(verdict|confidence|source_face)$/;

/**
 * True iff the attribute key is safe to record verbatim. Keys that
 * are not safe must have their string value hashed via `hashPii`
 * before being set.
 */
export function isSafeAttributeKey(key: string): boolean {
  if (SAFE_ATTRIBUTE_KEYS.has(key)) return true;
  if (PER_FIELD_PREFIX.test(key)) return true;
  return false;
}
