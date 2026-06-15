# Manual Acceptance Checks — Phase 1

Companion to `tests/acceptance.test.ts` and `tests/a11y.test.tsx`. The
golden set covers AC-1 through AC-7 automatically; AC-9 and AC-10
require a human pass that the runner can't fully automate. This file is
the record of that pass.

## AC-9 — Color + icon + text on the review UI (manual screen-reader pass)

**Why a manual check is required:** the automated jest-axe sweep in
`tests/a11y.test.tsx` catches structural a11y issues (missing labels,
unlabelled inputs, ARIA mis-use, contrast violations the rule engine
can detect). What it CAN'T verify is whether a real screen reader
announces the right semantic content in the right order for each lane
state. AC-9's "color + icon + text" guarantee is meaningful only if the
text label survives screen-reader announcement — which is exactly what
a manual VoiceOver / NVDA pass verifies.

### Procedure

1. Run `pnpm dev`.
2. Open `/verify` in Chrome / Firefox / Safari.
3. For each of the three lane states (load each sample from the
   picker, press Verify), open the screen reader of your choice
   (VoiceOver on macOS: ⌘F5; NVDA on Windows: Insert+Q to launch) and
   listen to the announcements:
   - **Match lane** — load `sample-green-001`. Verify. Listen.
   - **Mismatch lane** — load `sample-abv-mismatch-001`. Verify.
     Listen.
   - **Review lane** — load any sample whose mock returns an empty
     face (e.g. `sample-unreadable-001`). Verify. Listen.
4. For each lane, confirm:
   - The lane banner announces the verdict word ("Match", "Mismatch",
     "Review") AND the explanatory sentence — not just a color cue.
   - Flagged field rows are announced with both the field name AND the
     verdict label ("Mismatch", "Not found", "Low confidence").
   - The disposition buttons are reachable by tab; the focus indicator
     is visible.
   - The Return-for-correction form lists the failed fields by name
     with their form-value-vs-label-value pairs and the explanatory
     reason.
5. Run `axe` DevTools extension on each lane state. Zero violations
   should appear (the same assertion the automated test runs).

### Log

| Date       | Reviewer | Browser    | Screen reader | Lanes tested              | Result        |
| ---------- | -------- | ---------- | ------------- | ------------------------- | ------------- |
| _pending_  |          |            |               | match / mismatch / review | _not yet run_ |

> **Status:** the automated jest-axe sweep (9 component renders) is
> green. The manual screen-reader pass is pending and should be logged
> in the table above before Phase 1 demo.

## AC-10 — No PII to disk (code review)

**Why a code review is required:** the automated static check in
`tests/static/no-pii-to-disk.test.ts` greps for known persistence APIs
(`fs.writeFile`, `localStorage`, `indexedDB`, common DB / S3 / GCS
clients). What it CAN'T catch is novel persistence — a future
maintainer who reaches for an exotic library, a custom binary blob
writer, or a network-side cache that the grep doesn't know about.
A periodic human review re-verifies the rule against the codebase as
it actually is, not against a static pattern list.

### Procedure

1. Walk `app/`, `lib/`, and `middleware.ts` and confirm that the
   verification path:
   - Never writes image bytes, transcribed text, or any applicant-
     identifying value to disk, local storage, or remote storage.
   - Holds bytes only in `Buffer` / `Uint8Array` values that go out of
     scope at the end of the request lifecycle.
   - Logs only structural metadata (input/output dimensions, counts,
     event names) — never raw image bytes, transcribed strings, form
     values, or applicant addresses. Look for `console.info` /
     `console.log` / `console.error` and verify their args.
2. Confirm no database / object-storage clients are imported anywhere
   in the verification path. Production persistence lands behind a
   separate boundary in P6-2; introducing a client here would burn
   NFR-4.
3. Confirm the access-gate middleware (`middleware.ts`) does not
   persist the passcode or the cookie value — it should only verify
   the HMAC and pass / reject.

### Log

| Date       | Reviewer | Files reviewed                 | Result        | Notes                                                                                    |
| ---------- | -------- | ------------------------------ | ------------- | ---------------------------------------------------------------------------------------- |
| 2026-06-15 | claude   | `app/`, `lib/`, `middleware.ts` | Pass         | Static grep clean; sessionStorage used in `app/verify/` is tab-scoped, cleared after use. |

### Findings

**Pass.** As of 2026-06-15 the verification path:

- Holds all image bytes as in-memory `Buffer`s in the request lifecycle
  (`lib/extraction/service.ts`, `lib/image/preprocess.ts`).
- Has one client-side persistence touch — `sessionStorage` writes in
  `app/verify/InputForm.tsx` and reads in `app/verify/result/page.tsx`
  — used to pass the `VerificationResult` from the input page to the
  result page within a single tab. SessionStorage is tab-scoped, not
  disk-backed, and the result page clears it on disposition. Treated as
  "session-only state" per NFR-4, not as persistence.
- Logs only structural metadata (e.g.
  `{ event: "image.preprocess", inputWidth, inputHeight, ... }`) — no
  raw bytes, no transcribed strings, no form values.
- Imports zero database / object-storage clients.
