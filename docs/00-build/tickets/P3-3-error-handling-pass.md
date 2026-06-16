# P3-3 — Error-handling pass

Sweep every expected bad input — invalid file, unreadable image, provider timeout, transient provider failure, batch item failure, validation error — and make sure each returns a clean, actionable, structured result rather than a stack trace or a hang. Bad inputs are normal outcomes, not errors.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P3-3: Error-handling pass.

Current state: (at start)
- [list what is DONE so far, with checks, including Phase 0, Phase 1 (per-application verify pipeline with the FR-16 unreadable path and the FR-26b recommendation, timeout + one retry per D10), Phase 2 (queue, routing, roles), P3-1 (batch orchestrator with in-memory job state), P3-2 (targeted warning re-read for imperfect images)]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: a systematic pass over every expected bad input — invalid file types, missing fields, unreadable images, provider timeouts, transient provider failures, batch item failures — to guarantee an actionable result (this ticket), performance hardening]

TICKET-P3-3 Goal:
Treat expected bad inputs as first-class outcomes, not errors. Walk every entry point (single verify, batch, image preprocessing, provider adapter, validation) and confirm each returns a structured, actionable result with a clean message. No stack traces reach the UI. A failed batch item is isolated and the run continues. Unreadable images route through FR-16 with the FR-26b recommendation. Provider timeouts degrade to a low-confidence "could not verify in time" result with one retry (D10). This is hardening, not new features.

Check the API routes (/api/verify, /api/batch), the extraction service, the provider adapter wrapper, the batch orchestrator and store, and the review UI before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (Error Handling and Degraded Cases — bad inputs are NORMAL OUTCOMES, not errors; D10 timeout + one retry; D2 ephemeral batch state).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P3-2: targeted warning re-read in `lib/extraction/service.ts`, crop helper, re-read provider call; plus the P3-1 batch orchestrator and store.)_

### TICKET-P3-3 Scope

- Phase: Phase 3 — Batch, imperfect images, hardening
- Time budget: 2h
- Dependencies: P1-7 (result API)
- Branch: feat/errors

### Acceptance criteria

- [ ] Every expected bad input returns a structured, actionable result; no stack trace reaches the UI (systemsdesign Error Handling).
- [ ] Invalid file types (e.g. PDF, .exe, oversize) are rejected at the API boundary with a plain-language message (techstack Input Validation; FR-1 only JPEG/PNG).
- [ ] Missing required fields for the selected beverage type return a clean validation message (FR-2, FR-3, FR-25).
- [ ] Unreadable, blank, or non-label images return the low-confidence "needs a better image" result with the FR-26b "Return — unreadable image" recommendation, not an error (FR-16, FR-26b; AC-6).
- [ ] Provider timeouts (~8s per call cap, D10) return a structured low-confidence "could not verify in time" result, offer one automatic retry, and never hang.
- [ ] Transient provider failures (5xx, rate limit) are retried once; persistent failure returns a degraded low-confidence result, not a raw error.
- [ ] In a batch, a failed item is marked failed within the job and the run continues; the agent sees which items need resubmission (systemsdesign Error Handling; FR-19).
- [ ] Errors are structured: `{ code, message, retryable, recommendation? }`, never a raw `Error.toString()` or a leaked stack.
- [ ] A consistent error-result type is shared between single verify and batch items, so the UI renders both the same way.
- [ ] No console errors and no unhandled promise rejections on any of the bad-input scenarios.

### Implementation details

- Audit every entry point and list the bad-input cases in a short table inside the ticket DEV-LOG. Entries:
  - `/api/verify`: invalid body (missing fields, wrong types), invalid file, oversize file, image preprocessing failure, provider timeout, provider 5xx, provider rate-limit, unreadable result.
  - `/api/batch`: same per-item, plus a malformed item inside an otherwise-valid batch, plus a wholly-malformed batch body.
  - Provider adapter wrapper: timeout, network error, schema-mismatch on response.
  - Image preprocessing: corrupt EXIF, zero-byte file, non-image bytes with an image extension.
- Add `lib/errors/types.ts`: a `StructuredError` discriminated union with codes like `INVALID_INPUT`, `UNREADABLE_IMAGE`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `INTERNAL`, each with a human-readable message and a `retryable: boolean`. For `UNREADABLE_IMAGE`, the structured error carries a `recommendation: 'return-unreadable-image'` field so the FR-26b path is deterministic in the UI.
- Add `lib/errors/toResult.ts`: converts a `StructuredError` into a `VerificationResult` shaped exactly like a successful low-confidence result so the UI renders one shape. `UNREADABLE_IMAGE` and `PROVIDER_TIMEOUT` map to the low-confidence lane with the appropriate recommendation. `INVALID_INPUT` is the only one that returns a 4xx with a clean message and no synthetic result.
- Update `app/api/verify/route.ts`: wrap the pipeline in a single try/catch that funnels any thrown error through `toResult`. Validation failures (zod) become `INVALID_INPUT` with a clean 4xx. Provider failures and timeouts become `PROVIDER_TIMEOUT` / `PROVIDER_UNAVAILABLE` and degrade to a low-confidence 200 result with the retry affordance (D10).
- Update the provider adapter wrapper: enforce the ~8s per-call timeout, perform one retry on transient failures, then surface a `StructuredError` (not a thrown exception that escapes the handler). The retry is on transient failures (timeout, 5xx, rate limit) only; not on 4xx-equivalents.
- Update `lib/batch/orchestrator.ts`: each item runs inside a `try/catch` that captures `StructuredError` and sets the item's status to `failed` with the structured error attached. The orchestrator continues processing other items unconditionally. The batch progress payload includes a `failed` count and a per-item `error` field.
- Update the review UI and the batch results UI: the FR-26b recommendation surfaces visibly when the result carries `recommendation: 'return-unreadable-image'`. A failed batch item renders the structured error message inline next to the item, with a retry button that re-submits just that item through `/api/verify`.
- Confirm AC-6 holds end to end: a blank, unreadable, or non-label image returns the low-confidence "needs a better image" result, not an error response.

### Key constraints

1. Bad inputs are NORMAL OUTCOMES, not errors (systemsdesign Error Handling). An agent should never see a stack trace.
2. Provider timeout → low-confidence "could not verify in time" + one retry (D10). Not a hang. Not a 500.
3. A failed batch item is marked failed and isolated; the batch continues (Error Handling; FR-19).
4. The error result type and the success result type share the same UI rendering shape so the agent's mental model is one outcome shape with a lane and a recommendation, not "result or error".
5. p95 under 5s for the happy path holds (NFR-1). The retry path can exceed; degrade is graceful.
6. TypeScript strict mode, no `any` (techstack). The `StructuredError` is a discriminated union, not an `Error & { code?: string }` patchwork.
7. No applicant PII in error messages, error logs, or retry payloads (NFR-4).

### Files to modify

- `app/api/verify/route.ts` (at start — paste real content from P1-7) — funnel all failure paths through `toResult`; clean 4xx for validation, degraded 200 for provider failures.
- `app/api/batch/route.ts` and `app/api/batch/[id]/route.ts` (at start — paste real content from P3-1) — surface batch-level validation errors cleanly; per-item failures handled in the orchestrator.
- `lib/batch/orchestrator.ts` (at start — paste real content from P3-1) — wrap each item; capture `StructuredError`; never abort the run.
- `lib/batch/types.ts` (at start — paste real content from P3-1) — extend `BatchItem` with `error?: StructuredError`.
- `lib/provider/wrapper.ts` (or the timeout-and-retry wrapper from P1-9 — paste real content) — enforce 8s timeout, one retry on transient failures, return `StructuredError` rather than throw.
- `lib/extraction/service.ts` (at start — paste real content from P1-2 + P3-2) — surface unreadable extraction as `UNREADABLE_IMAGE`, with the FR-26b recommendation attached.
- `app/verify/ReviewResult.tsx` and `app/batch/[id]/page.tsx` (paste real content from P1-8 and P3-1) — render the FR-26b recommendation; render a failed batch item's structured error inline with a retry control.

### Files to create

1. `lib/errors/types.ts` — `StructuredError` discriminated union.
2. `lib/errors/toResult.ts` — convert `StructuredError` into a `VerificationResult`-shaped low-confidence outcome where applicable; map `INVALID_INPUT` to a clean 4xx.
3. `tests/errors/scenarios.test.ts` — one test per bad-input scenario from the audit table.

### Config / schema / store updates

- No new config. The 8s timeout and one-retry policy already live in the provider wrapper (P1-9); this ticket just makes sure they degrade cleanly.
- No persistent state.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add Vitest tests covering one scenario per row of the audit table:
- Invalid file type rejected with a clean message and a 4xx code.
- Missing required field returns a clean validation message.
- Unreadable image → low-confidence lane + FR-26b recommendation, 200 response, AC-6.
- Provider timeout → low-confidence "could not verify in time", retry offered, no hang (D10).
- Provider 5xx → one retry, then degraded low-confidence result.
- Provider rate limit → one retry, then degraded low-confidence result.
- Batch with one malformed item → batch starts, malformed item marked failed with structured error, other items complete (FR-19; systemsdesign Error Handling).
- Wholly malformed batch body → clean 4xx with a plain message.

Manual:
- [ ] Submit an .exe renamed to .jpg; confirm clean rejection with a plain message, no stack trace.
- [ ] Submit a single verify with no form fields; confirm the validation message names the missing field, color + icon + text (NFR-2, AC-9).
- [ ] Force the mock adapter into a simulated timeout; confirm the result lands as low-confidence "could not verify in time" with a retry button, not a hang or a 500.
- [ ] Submit a batch with one malformed item; confirm the failed item is marked failed with a clean message, the rest run, and the per-item retry button works.
- [ ] Open the browser devtools console during all of the above; confirm zero console errors and zero unhandled promise rejections.

Eval: re-run the Phase 1 golden set; confirm no regression on AC-6 (unreadable image lands in the low-confidence lane, not an error).

Update docs: mark P3-3 done in TICKETS.md; add a DEV-LOG entry including the audit table.

### Reference

- @systemsdesign.md — Error Handling and Degraded Cases (bad inputs are normal outcomes), D10 (timeout + one retry), D2 (ephemeral batch state, per-item failure isolation), Failure Modes and Resilience.
- @techstack.md — Input Validation (zod), Vision Model (provider adapter and mock).
- @requirements.md — FR-16, FR-26b; NFR-1, NFR-4; AC-6.
- @CONTEXT.md — Verification (the act always produces a Verdict and a Lane, even on degraded inputs).

### Common gotchas

1. Per systemsdesign Error Handling, bad inputs are NORMAL OUTCOMES, not errors. An unreadable image is not an exception — it is a low-confidence lane result with the FR-26b "Return — unreadable image" recommendation. Treat exceptions as the failure mode, not as the way to signal a bad input.
2. Provider timeout → low-confidence result + one automatic retry (D10), not a hang and not a 500. The ~8s per-call timeout is the goal-protecting guardrail, not a hard per-request kill switch.
3. A failed batch item is marked failed within the job and the batch continues (Error Handling). Do not let one item's structured error escape and abort the whole run.
4. No applicant PII in error messages or retry payloads (NFR-4). Validation messages name the field, not the value. Error logs carry shape, not content.

### Definition of Done

Code complete when:
- [ ] Every entry point funnels failures through `StructuredError` + `toResult`.
- [ ] Validation errors return clean 4xx; provider failures return degraded 200 low-confidence results.
- [ ] Unreadable images land in the low-confidence lane with the FR-26b recommendation.
- [ ] Provider timeouts degrade to low-confidence + retry; one retry on transient failures.
- [ ] Failed batch items are isolated; the batch run continues.
- [ ] No console errors, no unhandled promise rejections.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass (including the new error-scenario tests).
- [ ] Manual checks above ticked.
- [ ] Phase 1 golden set re-runs without regression on AC-6.
- [ ] TICKETS.md and DEV-LOG updated with the audit table of bad-input scenarios.
- [ ] Committed to feat/errors, pushed, merged to main.

### Expected output

Every expected bad input produces a clean, actionable result the agent can act on: a clear 4xx for validation failures, a low-confidence result with the FR-26b "Return — unreadable image" recommendation for unreadable inputs, a low-confidence "could not verify in time" plus a one-tap retry on provider timeouts, and an isolated per-item failure inside a batch that does not abort the rest of the run. No stack traces reach the UI; no unhandled rejections in the console.

### Dependencies to install

No new dependencies. This ticket is a hardening pass over existing code.

---

## Outcome — done 2026-06-15

**Branch:** `feat/errors`
**Status:** Done — 308 tests pass + 1 skipped (+8 new); lint + build clean.
**Workflow:** Single-agent (hardening sweep across coupled files; parallel would have added overhead).

**What landed:**
- `lib/errors/types.ts` — `StructuredError` discriminated union (`INVALID_INPUT | UNREADABLE_IMAGE | PROVIDER_TIMEOUT | PROVIDER_RATE_LIMIT | PROVIDER_UNAVAILABLE | INTERNAL`) with `message`, `retryable`, optional `recommendation` + `fields`. Six helpers.
- `lib/errors/toResult.ts` — `toDegradedResult(applicationId, err)` converts a structured error to a `VerificationResult` shape so success + degraded render the same way. INVALID_INPUT is NOT routed through here.
- `lib/provider/withTimeout.ts` — `toStructuredError(err)` at the module boundary. `TimeoutError` → `providerTimeout(ms)`; 429 → `providerRateLimit`; 5xx → `providerUnavailable`; everything else non-transient → `internalError`.
- `lib/provider/types.ts` — `ExtractionResponse.degradedError?: StructuredError` (legacy `degraded` kept so existing tests pass unchanged).
- `lib/extraction/service.ts` — degraded paths populate `degradedError`.
- `lib/verify/runVerification.ts` — funnels degraded extraction through `toDegradedResult`. Non-transient extraction throw → `internalError` (real defects no longer paper over as "unreadable").
- `lib/batch/{types,orchestrator}.ts` — `BatchItem.error: StructuredError | undefined`; orchestrator normalises caught errors via `toStructuredError`.
- `app/api/batch/route.ts` — pre-failed items use `invalidInput(message, fields)`.
- `app/batch/[id]/{page,types}.tsx` — FailedPanel renders the structured code pill + message + per-item Retry button (hidden when `error.retryable === false`).
- `tests/errors/scenarios.test.ts` — 8 audit-table scenarios end-to-end.

**Audit table (covered scenarios):**
- INVALID_INPUT: PDF mime on a face → 400 + plain message.
- INVALID_INPUT: missing `brandName` → 400 names the field.
- UNREADABLE_IMAGE: empty face → 200, lane=review, recommendation=return_unreadable_image (AC-6).
- PROVIDER_TIMEOUT: TimeoutError x2 → 200 degraded.
- PROVIDER_UNAVAILABLE: 503 x2 → 200 degraded.
- PROVIDER_RATE_LIMIT: 429 x2 → 200 degraded.
- Batch malformed body → 400 plain message.
- Batch mixed (good + bad item) → bad ends failed with INVALID_INPUT retryable=false; good ends done.

**Deviations:**
- Provider helpers carry `recommendation: "return_unreadable_image"` so the UnreadableBanner renders consistently for every "can't verify" outcome (the existing `buildTimeoutResult` from P1-9 set the same recommendation; preserving it keeps the existing tests green).
- `unreadableImage` reason still cites face names ("Front face is unreadable — ...") so the existing AC-6 test still passes.
- `lib/verify/result.ts`'s `buildUnreadableResult` helper is now unreferenced but left in place; hardening pass shouldn't strip exports.
- Poll endpoint serializes `BatchItem.faces` as `Buffer` objects — bandwidth-heavy on large batches. Flagged for future cleanup.

### Why

P3-3 systematises the "bad inputs are normal outcomes, not errors" posture across every entry point. One shape, six codes, one converter, one UI rendering path. The agent's mental model collapses from "result or error" to "always a result, sometimes degraded with a recommendation".

The **discriminated-union `StructuredError`** is the type system's leverage. Every consumer pattern-matches on `code`; missing a code is a compile error. Adding a new code means adding a new helper, a new toResult branch, and getting compile errors at every existing consumer — exactly where to be reminded that the UI needs updating.

The **single converter `toDegradedResult`** enforces "success and degraded render the same way". The verify route and the batch orchestrator both funnel non-INVALID_INPUT failures through it; the UI components don't have separate "success path" and "error path" rendering. The `<UnreadableBanner>` from P1-8 already handles every recommendation; no UI change for the timeout / 503 / 429 cases.

The **INVALID_INPUT carve-out** is the right boundary. A wrong file mime isn't a "we couldn't verify"; it's a "you sent something unverifiable". The 4xx with field reference is correct; a synthetic 200 "review" result would be misleading.

The **`internalError` mapping** is the honest path. Before P3-3 the route's catch on extraction throws mapped to `buildUnreadableResult` — papering over real defects as "image unreadable". After P3-3 an unexpected throw maps to `internalError` with a defensive flag. User-facing surface stays actionable; the log carries the actual error for the operator.

The **batch-side typed `error: StructuredError`** is what lets the UI hide the Retry button on `retryable: false` cleanly. No string-matching.

The **per-item Retry button** is the small-but-load-bearing affordance for the workflow. A supervisor can re-submit just the failed items, not the whole 300-app batch. Batches become incrementally fixable.
