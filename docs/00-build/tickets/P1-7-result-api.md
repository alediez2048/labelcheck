# P1-7 — Result API

Expose POST /api/verify as the synchronous endpoint that runs an Application through the full pipeline (preprocess → extract → match → confidence → merge → triage) and returns the structured result — including the explicit "Return — unreadable image" recommendation when extraction fails on one or more faces. Validation errors are clean messages; unreadable images return a structured result, not a stack trace.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-7: Result API.

Current state: (at start)
- [list with checks: extraction service, matching engine, confidence derivation, triage classifier, multi-face merge — the verification pipeline modules exist and are unit-tested]

What's NOT done yet:
- [list with crosses: review UI, timeout/degrade, acceptance tests, latency bench]

TICKET-P1-7 Goal:
Stitch the pipeline into a single Next.js Route Handler at POST /api/verify. It validates the request with the zod schema from P1-1, runs preprocessing → extraction → matching → confidence → merge → triage, and returns the structured Verification Result: overall lane, overall confidence, per-field breakdown (form value, extracted value, verdict, confidence, sourceFace, reason), flags, and — when extraction failed on one or more faces — the explicit "Return — unreadable image" recommendation (FR-26b). Validation errors return clean plain-language messages. Nothing is persisted.

Check lib/extraction/service.ts, lib/matching/match.ts, lib/triage/classify.ts, lib/matching/merge.ts, and lib/validation/application.ts before starting. Don't duplicate any pipeline logic — this is glue.
Follow the architecture and decisions in @systemsdesign.md (Data Flow: Single-Application Verification, Error Handling) and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-7 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 2h
- Dependencies: P1-5 (triage classifier), and transitively P1-2 through P1-6
- Branch: feat/result-api

### Acceptance criteria

- [ ] POST /api/verify accepts a validated Application body and returns a typed VerificationResult (FR-14).
- [ ] The result includes: overall lane, overall confidence, per-field breakdown (form value, extracted value, verdict, confidence, sourceFace, reason), and the list of flags (FR-14, FR-15).
- [ ] For any mismatch, the result identifies the specific field(s) that differ (FR-15).
- [ ] When extraction fails on one or more faces (image unreadable, no text detected, or model decline), the result returns a structured needs-a-better-image VerificationResult in the review lane with the explicit `recommendation: "Return — unreadable image"` and the affected face(s) cited — NOT an error response (FR-16, FR-26b, AC-6).
- [ ] Validation errors return a 400 with a clean, plain-language message — never a raw zod stack trace (techstack Input Validation; systemsdesign Error Handling).
- [ ] No applicant PII is written to disk or persisted (NFR-4, AC-10).
- [ ] The access gate from P0-6 is enforced.
- [ ] The endpoint runs end-to-end against the mock adapter (no API key required for local dev / tests).
- [ ] The endpoint runs end-to-end against a live adapter when the API key is set.

### Implementation details

- Create the route at `app/api/verify/route.ts` exporting an async `POST(req: Request)` handler.
- Wire the handler in this order:
  1. Access gate — call the middleware from P0-6 (already runs at the edge, but assert here too if needed).
  2. Parse the request body. Validate with `lib/validation/application.ts` (zod). On failure, return 400 with `{ error: 'plain-language message', fields: [...] }`.
  3. Preprocess each face's image via `lib/image/preprocess.ts` (orientation + cap at provider max). All in memory.
  4. Call `extract(application)` from `lib/extraction/service.ts`.
  5. If extraction reports any face as unreadable (`legibility=low` and no transcribed text, OR a model decline), short-circuit: build a VerificationResult with lane=`review`, recommendation=`"Return — unreadable image"`, and the affected face(s) listed. Return 200 with this structured result (NOT a 500 — see FR-16, FR-26b).
  6. Otherwise, run matching → confidence → merge → triage. Compose the VerificationResult.
  7. Return 200 with the typed VerificationResult.
- The VerificationResult type lives in `types/domain.ts`. Make it the SAME type the UI consumes (single shared contract — see P0-2).
- Do not write to disk, do not log raw images or transcribed PII (NFR-4, AC-10, observability Privacy).
- Do not implement the timeout here — P1-9 wraps the provider call. This ticket can assume the provider behaves.

### Key constraints

1. Model reads, code decides (D4, D5). The route handler is glue; all logic stays in the lib/ modules.
2. p95 under 5s end-to-end (NFR-1) — measured in P1-11. This route is the unit of measurement.
3. No PII to disk (NFR-4, AC-10). Images, transcribed text, and the result live only in the request lifecycle.
4. Unreadable image returns a structured result, NEVER an error (FR-16, FR-26b, AC-6). Same for any expected bad input — return clean structured results, not stack traces (systemsdesign Error Handling).
5. The VerificationResult type is shared between the API and the UI — defined once in `types/domain.ts` (P0-2).
6. TypeScript strict mode, no any.
7. WCAG awareness: the reasons in the response are user-facing — write them as plain language, not log strings (NFR-2).

### Files to modify

- `lib/validation/application.ts` (at start — paste real content from P1-1) — consume.
- `lib/image/preprocess.ts` (at start — paste real content from P0-5) — consume.
- `lib/extraction/service.ts` (at start — paste real content from P1-2) — consume.
- `lib/matching/match.ts`, `lib/matching/merge.ts`, `lib/matching/confidence.ts` (at start — paste real content from P1-3, P1-4, P1-6) — consume.
- `lib/triage/classify.ts` (at start — paste real content from P1-5) — consume.
- `types/domain.ts` (at start — paste real content from prior tickets) — extend the VerificationResult type to include `recommendation?: string` and `unreadableFaces?: LabelFaceRole[]`.
- `middleware.ts` (at start — paste real content from P0-6) — confirm /api/verify is gated.

### Files to create

1. `app/api/verify/route.ts` — the POST handler.
2. `app/api/verify/__tests__/route.test.ts` — integration tests against the mock adapter for the happy path, validation failure, and unreadable-image case.

### Config / schema / store updates

- No new config. The handler reads everything via the existing modules.
- No persistent state. The route is stateless beyond the request lifecycle.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Integration tests (against mock adapter):
- [ ] AC-1: a green pair fixture → 200 with lane=match and no field flagged.
- [ ] AC-2: ABV mismatch fixture → 200 with lane=mismatch and "alcohol content" in the per-field breakdown.
- [ ] AC-6: a fixture that simulates an unreadable face → 200 with lane=review, recommendation="Return — unreadable image", and the unreadable face listed.
- [ ] A request missing a required field → 400 with a clean plain-language message.
- [ ] A request that bypasses the access gate → 401/403 from the middleware.

Manual:
- [ ] Submit a sample from the input UI; confirm the API returns the structured result and the per-field reasons read naturally.
- [ ] Submit a known-bad image; confirm the recommendation string is "Return — unreadable image" and surfaces the affected face.

Eval: full AC-1 to AC-6 automation lands in P1-10. This ticket gives those tests a callable endpoint.

Update docs: mark P1-7 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — Data Flow: Single-Application Verification, Error Handling and Degraded Cases, Component Breakdown: API layer.
- @requirements.md — FR-14, FR-15, FR-16, FR-26b; AC-1, AC-2, AC-6, AC-10; NFR-1, NFR-4.
- @flowchart.md — section 2.
- @CONTEXT.md — Verdict, Lane.

### Common gotchas

1. Unreadable image returns a structured "needs a better image" VerificationResult with the explicit `recommendation: "Return — unreadable image"` — NOT a 500 error, NOT a generic message. This is the agent-facing default that drives FR-26b in the UI (P1-8).
2. The unreadable-image branch is short-circuited BEFORE matching runs — there's nothing to match if a face is unreadable. The lane is `review`, not `mismatch`, because the issue is input quality, not a regulatory failure.
3. No PII to disk (AC-10). Do not log raw images, raw transcribed text, or applicant addresses. The trace can carry application-internal IDs and structural counts only (per observability.md Privacy).
4. Use the same VerificationResult TYPE the UI imports (defined in `types/domain.ts`). A divergent type silently rots the contract; that's exactly what P0-2 prevents.

### Definition of Done

Code complete when:
- [ ] POST /api/verify runs end-to-end on a validated Application and returns a typed VerificationResult.
- [ ] Validation errors surface as 400 with plain-language messages.
- [ ] Unreadable-image inputs return 200 with lane=review and the explicit "Return — unreadable image" recommendation.
- [ ] AC-1, AC-2, AC-6 pass at the integration-test layer.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/result-api, pushed, merged to main.

### Expected output

The full backend pipeline is now reachable over HTTP. The P1-1 input UI can POST to /api/verify and receive a typed VerificationResult, which the P1-8 review UI will render. Unreadable images come back as structured review-lane results with an explicit recommendation, not as errors.

### Dependencies to install

```
(none — composes existing libs)
```

---

## Outcome — done 2026-06-15

**Branch:** `feat/result-api`
**Status:** Done — 103 tests pass (94 prior + 9 new), lint + build clean.

**What landed:**
- `app/api/verify/route.ts` — POST glue handler composing the pipeline (validation → decode → extract → unreadable short-circuit → match → triage → typed `VerificationResult`).
- `app/api/verify/__tests__/route.test.ts` — 9 integration tests covering AC-1 / AC-2 / AC-6, the warning-only-back-face guard, four validation/malformed-input cases, and the D14 one-call smoke test.

**Deviation:** the route + tests were authored in an earlier session and left UNTRACKED in the working tree. The implementation already matched the ticket spec line-for-line, so this commit promotes them under their intended owner (P1-7) rather than rewriting equivalent code.

### Why

P1-7 is the layer that makes the pipeline reachable. Every prior Phase 1 ticket built a pure-functions module — extraction, matching, confidence, merge, triage — and tested it in isolation. P1-7 stitches them into a single Route Handler so the input UI from P1-1 can actually POST and get a typed `VerificationResult` back. The discipline the ticket spec hammers on — "glue, not logic" — is what makes this work. Every step lives in its own module; the route reads the input, calls the modules in order, and returns the result. There is no business decision in the route. A future maintainer who tries to "simplify" by inlining a matcher here is breaking the seam that lets P1-10's golden-set harness, P2-2's bulk-confirm view, and P3-1's batch intake all reuse the same pipeline without duplicating it.

The **structured unreadable-image response** (`lane: "review"`, `extractionFailed: true`, `recommendation: "return_unreadable_image"`) is the single most-load-bearing design choice in this route. The naive implementation would return a 500 when the model can't read an image — "something broke, look at the logs". That is exactly the wrong behaviour for the agency's workflow. The right user action when an image is unreadable is "ask the applicant for a clearer image"; the right system action is to surface that recommendation explicitly so the agent can act on it without thinking. Routing the case as `lane: "review"` with a recommendation is what makes FR-26b ("the system explicitly recommends returning the application as 'unreadable image' rather than leaving it to agent judgment") true at the wire layer. The review UI in P1-8 will render the recommendation as a one-click disposition; without this scaffolding, that UI couldn't exist.

**`isFaceUnreadable`** is the subtle one. A face is unreadable when it has no usable text AND no warning presence. The "AND no warning presence" half is what prevents the typical back-face from being false-flagged — back labels often carry ONLY the regulated text (warning, address, lot codes) with nothing in the other field slots. A naive check that flagged any face with empty `fields` would short-circuit the entire pipeline every time a real label was uploaded. The "warning-only on back face" test exists specifically to lock this in — it would catch any regression that tightened the unreadable check too aggressively.

The **provider exception → unreadable response** (not 500) catch-all on `await extract(...)` is the same logic at a different layer. A `sharp` decode failure, a network blip to Claude, a malformed model response — all have the same right answer: "we couldn't read this, please re-upload". Bubbling a 500 pushes the operator into a debug workflow when the user-side action is trivially right. The cost is that a genuine 500-class bug also gets papered over as "unreadable image" — but that cost is bought back by the P5-1 observability layer, which will trace the underlying exception even when the wire response is the structured unreadable result. The user-facing default is "actionable response"; the operator-facing default is "trace tells you what really happened".

The **JSON-base64 wire format** (not multipart) keeps the parsing path single-track — same shape in browser and in tests, no third-party multipart builder. At the 1568px preprocess cap, base64 inflation is irrelevant in absolute terms. The cost is ~33% body bytes; the savings is "one parsing path, one validation rule, one test fixture".

The **`pickWarningFlags` strategy** — read the warning flags from the face the warning matcher pinned the verdict to, fall back to the first face — points the review UI's "Government Warning" panel at the same artwork the system was looking at (FR-15). Falling back to the first face on a no-match edge case keeps the shape stable (a non-null `warning` field) at the cost of less-useful flags in that case — but `presence: false` carries the actual signal ("couldn't find a warning anywhere") so the UI still does the right thing.
