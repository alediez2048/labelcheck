# P1-8 — Review UI and dispositions

Build the review page: application-as-submitted on one side, application-versus-label per-field on the other with differing fields visibly flagged, a lane banner, and the two whole-application dispositions (Approve, Return for correction with a structured reason summary). Disposition is atomic — never per-face, never per-field. Accessible (color + icon + text, large targets, keyboard navigable). Auto-advance after disposition.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-P1-8: Review UI and dispositions.

Current state: (at start)
- [list with checks: input UI, the verify API returning a typed VerificationResult, all pipeline modules, fixtures with green and red samples]

What's NOT done yet:
- [list with crosses: timeout/degrade wrapper, acceptance tests, latency bench]

TICKET-P1-8 Goal:
Build the agent-facing review surface. Render the VerificationResult: a clear lane banner (color + icon + text), the per-field breakdown with the bad field(s) highlighted (FR-15), the application-as-submitted next to the application-versus-label view, and two and only two disposition actions — Approve and Return for correction. Disposition is whole-application only (FR-26): an agent cannot approve face A while returning face B, and cannot approve some fields while rejecting others. Return for correction captures a structured reason summary derived from the latest field_results (FR-26a). When extraction failed, surface the explicit "Return — unreadable image" recommendation (FR-26b). Color is paired with icon + text (NFR-2, AC-9). Auto-advance after a disposition. Records the choice in session only — nothing persists.

Check the VerificationResult type in types/domain.ts and the input UI from P1-1 before starting.
Follow the architecture and decisions in @systemsdesign.md (D6 bold best-effort, D11 review-model default) and the rules in @CONTEXT.md (Disposition — whole-application only).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output.)_

### TICKET-P1-8 Scope

- Phase: Phase 1 — Core single-application verification (MVP)
- Time budget: 5h
- Dependencies: P1-7 (result API)
- Branch: feat/review-ui

### Acceptance criteria

- [ ] The page renders the VerificationResult from /api/verify (FR-14).
- [ ] Lane banner uses color + icon + plain-text label together, never color alone (NFR-2, AC-9, FR-22).
- [ ] A per-field table shows form value, extracted value, verdict, confidence, and the source face; differing or flagged field(s) are visibly highlighted (FR-15, FR-24).
- [ ] Application-as-submitted view sits alongside the application-versus-label per-field view (FR-21).
- [ ] Exactly two disposition actions are offered: Approve, and Return for correction. No manual reject (FR-26; CONTEXT.md: Disposition).
- [ ] Disposition is whole-application only — there is no per-face or per-field Approve / Return UI (FR-26 atomic constraint).
- [ ] Return for correction opens a panel that auto-fills a structured reason summary from the latest field_results (the failed fields, the system's read of each, the form value), plus a free-text agent note field (FR-26a).
- [ ] When the result carries the "Return — unreadable image" recommendation (FR-26b), it is surfaced prominently above the dispositions, citing the affected face(s); the agent can still override by choosing Approve.
- [ ] Large click / touch targets, full keyboard navigation, readable type sizes (NFR-2).
- [ ] After a disposition is recorded, the UI auto-advances (back to the input page in single-application mode; this becomes the queue auto-advance in P2-1).
- [ ] Disposition records to in-session state only; nothing persists (NFR-4, AC-10).

### Implementation details

- Create the review page at `app/verify/result/page.tsx` (or co-locate with the verify page in a two-step layout).
- Build presentation components:
  - `app/verify/result/LaneBanner.tsx` — color + icon + text. Use three distinct visual treatments (e.g. green-check-"Match", red-x-"Mismatch", amber-warning-"Review") and confirm each conveys the lane without color (AC-9).
  - `app/verify/result/FieldTable.tsx` — the per-field breakdown. Row layout: field name, form value, extracted value, source face, verdict, confidence. Highlight flagged rows with the same color + icon + text triple (FR-15).
  - `app/verify/result/AsSubmittedView.tsx` — a read-only view of the Application as the agent entered it (FR-21).
  - `app/verify/result/UnreadableBanner.tsx` — surfaces the "Return — unreadable image" recommendation when present (FR-26b), citing affected faces.
  - `app/verify/result/DispositionPanel.tsx` — the two-button panel (Approve, Return for correction). Whole-application only (FR-26).
  - `app/verify/result/ReturnForCorrectionForm.tsx` — auto-fills the structured reason summary from VerificationResult.fieldResults; lets the agent add a free-text note; serializes to a typed return_reason payload (FR-26a).
- Use shared types from `types/domain.ts`. Define the Disposition shape there if not already there (CONTEXT.md, schema.md).
- State management: keep the disposition in client state for the prototype. There is no persistence (NFR-4). Auto-advance routes back to /verify.
- Accessibility: every status-conveying element pairs color with an icon and a text label. Test with keyboard-only navigation. Use semantic HTML (h1, h2, dl, ul, button) so screen readers announce structure.
- Bold-uncertain in the warning result (D6) should render in the review lane with a clear "bold formatting uncertain — please verify visually" reason, not a hidden flag.

### Key constraints

1. Disposition is whole-application only (FR-26). UI must not even expose per-face or per-field disposition controls — the actions are atomic.
2. Two dispositions only: Approve and Return for correction (FR-26). No manual reject; rejection happens automatically when a returned application's 30-day window lapses (FR-27, out of scope for the prototype).
3. Color + icon + text together, never color alone (NFR-2, AC-9, FR-22). Verified by an automated a11y check (axe-core or @testing-library/jest-dom) plus a manual screen-reader pass (P1-10).
4. Return for correction must carry the structured reason summary derived from VerificationResult.fieldResults (FR-26a). Without it, applicants resubmit blind.
5. Unreadable-image cases get the explicit "Return — unreadable image" recommendation surfaced (FR-26b).
6. No PII to disk (NFR-4, AC-10). The disposition is in-session.
7. Large click targets, keyboard navigation, readable type — WCAG 2.1 AA (NFR-2).
8. TypeScript strict mode, no any.

### Files to modify

- `types/domain.ts` (at start — paste real content from prior tickets) — extend with the Disposition type (`'approve' | 'return_for_correction'`) and the ReturnReason payload type if not already there.
- `app/verify/page.tsx` (at start — paste real content from P1-1) — wire so submission navigates to /verify/result with the VerificationResult.

### Files to create

1. `app/verify/result/page.tsx` — the review page composing the components below.
2. `app/verify/result/LaneBanner.tsx`
3. `app/verify/result/FieldTable.tsx`
4. `app/verify/result/AsSubmittedView.tsx`
5. `app/verify/result/UnreadableBanner.tsx`
6. `app/verify/result/DispositionPanel.tsx`
7. `app/verify/result/ReturnForCorrectionForm.tsx`
8. `app/verify/result/__tests__/*.test.tsx` — render tests and a11y assertions (axe-core / jest-dom).

### Config / schema / store updates

- No new config. The Disposition enum lives in `types/domain.ts` (already present per CONTEXT.md / schema.md; just confirm).
- No persistent state in the prototype (NFR-4). The disposition is held in component / context state only.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Automated a11y:
- [ ] axe-core against the result page produces zero violations (AC-9).
- [ ] Per-field flagged rows include both an icon and a text label, asserted by @testing-library/jest-dom queries.

Manual:
- [ ] Keyboard-only run-through: tab from the lane banner through the field table to the disposition buttons. Confirm focus is visible at every step (NFR-2).
- [ ] Screen-reader pass (VoiceOver on macOS or NVDA on Windows): confirm each lane and each flagged field is announced with its text label, not by color.
- [ ] Submit a green sample, see Match banner, press Approve → auto-advance back to /verify.
- [ ] Submit a red sample (ABV mismatch), see Mismatch banner with alcohol content highlighted, press Return for correction → confirm the reason form auto-fills the field summary.
- [ ] Submit an unreadable sample → confirm the "Return — unreadable image" banner surfaces with the affected face(s).
- [ ] Resize the window narrow — confirm large targets and readable type hold (NFR-2).

Eval: AC-9 is asserted by the automated a11y check in P1-10; this ticket should already pass that check.

Update docs: mark P1-8 done in TICKETS.md; add a DEV-LOG entry.

### Reference

- @systemsdesign.md — D6 (bold best-effort), D11 (review model default), Component Breakdown: Client.
- @requirements.md — FR-14, FR-15, FR-21, FR-22, FR-24, FR-26, FR-26a, FR-26b; NFR-2; AC-9.
- @flowchart.md — section 5 (Disposition Rules and Outcomes).
- @CONTEXT.md — Disposition (whole-application only), Verdict, Lane.

### Common gotchas

1. Disposition is whole-application only (FR-26 atomic constraint; CONTEXT.md). The UI must not even allow approving face A while returning face B. The dispositions act on the application as a unit.
2. Color + icon + text together, never color alone (AC-9, NFR-2). A red row without a text label or icon fails AC-9. Pair every status surface with all three.
3. Return for correction captures a STRUCTURED reason summary auto-derived from VerificationResult.fieldResults (FR-26a). Do not ship a free-text-only "tell us what was wrong" textarea — without the structured payload, applicants resubmit blind.
4. The unreadable-image recommendation ("Return — unreadable image") is the DEFAULT recommendation when extraction failed (FR-26b). The agent may override (e.g. choose Approve if they verify visually), but the default must be deterministic.
5. No manual reject button. Rejection is automatic when a returned application's 30-day window lapses (FR-27, production). Two dispositions only.

### Definition of Done

Code complete when:
- [ ] The review page renders the VerificationResult with a clear lane banner, the as-submitted view, the per-field table, and the two-button disposition panel.
- [ ] The Return-for-correction form auto-fills the structured reason summary from field_results.
- [ ] The unreadable-image recommendation surfaces when present.
- [ ] axe-core reports zero violations against the page.
- [ ] Keyboard-only navigation reaches every interactive element with a visible focus indicator.
- [ ] Auto-advance fires after a disposition is recorded.
- [ ] No console or test errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Manual screen-reader check done.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/review-ui, pushed, merged to main.

### Expected output

A reviewer can load or enter an application, press Verify, see the structured result with the lane unmistakably conveyed, expand the per-field breakdown, and record one of two dispositions. Unreadable images surface the explicit recommendation. The screen is WCAG 2.1 AA, keyboard-friendly, and works without color. Nothing persists.

### Dependencies to install

```
pnpm add -D @axe-core/react jest-axe
```

Use jest-axe for the automated a11y assertion in component tests; @axe-core/react is helpful during local dev for live a11y warnings.
