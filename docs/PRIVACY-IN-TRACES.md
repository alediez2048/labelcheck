# Privacy in Traces

Status: draft for review
Owner: solo developer
Last updated: 2026-06-15

This document is the auditor-facing summary of what LabelCheck's
OpenTelemetry traces contain. It is a companion to
`docs/02-design/observability.md` (Privacy section) and is what a
reviewer reads to confirm the trace boundary does not leak applicant
PII.

The redaction logic lives in `lib/observability/redact.ts`; every
attribute set on a span is filtered through it. Trace attributes
that are not on the allow-list are passed through `hashPii` before
they touch a span.

## What's redacted, and how

Every applicant-touching string is hashed via `hashPii(value)`, which
returns `sha256:<first 8 hex chars of SHA-256(salt || value)>`. The
salt is `process.env.PII_HASH_SALT` (see "Salt source" below). Same
input + same salt produces the same hash; a different salt produces a
different hash, which means a leaked trace cannot be reversed by
rainbow table.

| Field | Surface | Redaction |
|---|---|---|
| Applicant name | verification span | `hashPii` |
| Applicant address | verification span | `hashPii` |
| Brand name (form value) | verification span | `hashPii` |
| Producer name | verification span | `hashPii` |
| Producer address | verification span | `hashPii` |
| Free-text agent note | (out of scope for spans) | omitted |
| User question | assistant turn span | `hashPii` as `assistant.question_hash` |
| User response (text) | assistant turn span | `hashPii` as `assistant.response_hash` (when set) |
| Per-field extracted text | NOT placed on span attributes | omitted at the seam |

Per-field extracted text (the model's transcription) is intentionally
NOT placed on a span attribute today; the per-field verdict and
confidence are the structured facts the observability backend needs to
score the system, and the extracted text would carry applicant
content. If a future ticket needs the raw transcription for replay,
hash it through `hashPii` before storing — never verbatim.

## What's kept verbatim

These keys are on the allow-list in `lib/observability/redact.ts`
(`SAFE_ATTRIBUTE_KEYS`). They are either system-internal ids, enums,
or derived numbers — nothing that ties to an applicant.

| Key | Value type | Why it's safe |
|---|---|---|
| `verification.id` | string | The system's internal application id. NOT an applicant identifier. |
| `verification.lane` | enum (`match` / `mismatch` / `review`) | Tool verdict, not personal data. |
| `verification.overall_confidence` | number | Derived (code, D5). |
| `verification.face_count` | number | Structural count (1–3). |
| `verification.field.<name>.verdict` | enum | Per-field tool verdict. |
| `verification.field.<name>.confidence` | number | Per-field code-derived confidence. |
| `verification.field.<name>.source_face` | enum (`front` / `back` / `neck`) | Structural pointer. |
| `extraction.provider` | string enum | Adapter name (`mock`, `anthropic`, etc.). |
| `extraction.outcome` | enum (`ok` / `timeout` / `transient` / `error`) | Structural. |
| `extraction.duration_ms` | number | Wall-clock. |
| `extraction.face_count` | number | Structural count. |
| `assistant.role` | enum (`agent` / `admin`) | Structural. |
| `assistant.intent_tags` | string[] | Classifier output — closed vocabulary. |
| `assistant.refusal_template` | enum | Refusal kind, not the message text. |
| `assistant.postcheck_action` | enum | Demotion kind, not the message text. |
| `assistant.used_tool` | enum (`get_my_rollup` \| undefined) | Closed vocabulary. |
| `assistant.retrieved_count` | number | Structural. |
| `assistant.retrieved_sources` | string[] | Admin-uploaded KB filenames (NFR-4 carve-out per P4-1). |
| `assistant.total_ms` | number | Wall-clock. |
| `http.status_code`, `http.method`, `request.duration_ms` | scalar | Standard HTTP attributes. |

## Image bytes

Label image bytes are NEVER recorded on a span. Only image dimensions
(`image.width`, `image.height`) and the provider's reported
`image.token_count` may be — they are derived numbers, not content.

## Salt source

`PII_HASH_SALT` is the env var. The salt is read on every `hashPii`
invocation (so `vi.stubEnv` in tests is honoured).

- Production: **required**. The salt MUST be a long-random secret
  rotated alongside other secrets. A weak or shared salt defeats the
  rainbow-table resistance the hashing is intended to provide.
- Prototype / dev: when the env is unset, the module falls back to a
  fixed string (`labelcheck-dev-salt-not-for-production`) and emits a
  single `console.warn`. This keeps dev mode working without requiring
  a setup step, while making it obvious in the logs that the deployed
  posture would be wrong.

## Exporter modes

`OTEL_EXPORTER` (env) selects the trace + metric sink:

- `"console"` (default) — `ConsoleSpanExporter` + `ConsoleMetricExporter`
  on a periodic reader. Spans appear on stdout. Good for dev.
- `"file"` — JSONL written to `OTEL_FILE_PATH` (default
  `.data/traces/otel.jsonl`). The `.data/` directory is gitignored
  (P4-1). Good for a local tail without scrolling the dev server.
- `"otlp"` — `OTLPTraceExporter` + `OTLPMetricExporter` posting to
  `OTEL_OTLP_ENDPOINT`. The production seam — P6-6 swaps the in-
  boundary Langfuse or Phoenix host in without touching call sites.

If the OTLP exporter packages cannot be loaded at runtime, the
exporter logs a warning and falls back to console; the OTLP seam is
still importable.

See `docs/02-design/observability.md` ("Privacy and Compliance of the
Observability Itself" and "Tooling Stack") for the underlying policy.
