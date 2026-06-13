# P2-2 — Operations view (admin)

Build the Admin shell's home — the intake funnel, the supervisor's aggregate review surface for the match lane (the page above the bulk-confirm action), and the review-distribution board over the exception work pool. This is where a supervisor sees applications arrive, get auto-triaged, and get routed.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @mockup.md, and @TICKETS.md.

I'm working on TICKET-P2-2: Operations view (admin).

Current state: (at start)
- [list what is DONE so far, with ✅, including Phase 1 result API + review UI, and P2-1 My Queue if landed first.]

What's NOT done yet:
- [P2-2] Operations view does not exist. The match lane has no aggregate review surface and no bulk-confirm action; the supervisor has no review-distribution board.
- [P2-3..P2-6] Work router, specialization routing, role-based shells, and the remaining Admin views are blocked on this (P2-3 and P2-5 in particular).

TICKET-P2-2 Goal:
Build the Operations view for the Admin shell. Three sections: (1) the intake funnel strip — received → auto-verified (with avg latency) → ready-to-approve match count → needs-review exception count; (2) the aggregate review surface above the match-lane bulk-confirm action — count, bottom-quartile-confidence matches surfaced inline and tap-expandable to the P1-8 per-field breakdown, any match-lane application with a single flagged field highlighted, deltas vs. the rolling baseline match rate, then the single "Approve all N" action (FR-20, FR-23); (3) the review-distribution board over the exception work pool — a highlighted shared-pool row split by beverage type, then a row per agent with their load, count, and specialization, plus a Distribute action and a live-intake feed.

Check app/(admin)/operations and lib/operations before starting. Don't overwrite P1-8 review code; the bottom-quartile expansions reuse it inline.
Follow @systemsdesign.md (D11 review-model default, D15 routing, D16 role shells) and @CONTEXT.md (Bulk confirm vs Auto-clear, Work pool).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P1-7 + P1-8 and P2-1 if landed.)_

### TICKET-P2-2 Scope

- Phase: Phase 2 — Queue, Routing, and Roles
- Time budget: 4h
- Dependencies: P1-7 (result API, structured per-field result the bottom-quartile expansions render); benefits from P2-1 if landed
- Branch: `feat/operations`

### Acceptance criteria

- [ ] Intake funnel strip across the top with four ordered numbers (received, auto-verified with avg latency in seconds, ready-to-approve match count, needs-review exception count) (mockup.md Operations).
- [ ] Aggregate review surface above the bulk-confirm action shows: total match-lane count; the bottom-quartile-confidence matches surfaced inline and tap-expandable to the P1-8 per-field breakdown; any match-lane application with a single flagged-but-still-match field highlighted; the delta vs. the rolling baseline match rate (FR-23; CONTEXT.md Bulk confirm).
- [ ] Single primary action "Approve all N" sits at the bottom of the aggregate review surface; one click confirms the entire match lane (FR-20).
- [ ] Review-distribution board: a highlighted shared-pool row at the top labelled "X waiting to be pulled" split by beverage type (wine / spirits / malt); below, one row per agent with a load bar, claimed count, and specialization pill; a Distribute action triggers the P2-3 router pass (mockup.md Operations).
- [ ] Live-intake feed lists the most recent applications with their lane and destination ("Auto-cleared → approval pool", "→ review pool", "→ Marcus Lee") (mockup.md Operations).
- [ ] Admin-only: the bulk-confirm and Distribute actions are wired but gated; the gating itself lands in P2-5, but the actions live on a route that P2-5 will scope to admin.
- [ ] Status conveyed by colour + icon + text everywhere (NFR-2; AC-9).

### Implementation details

1. Create `app/(admin)/operations/page.tsx` (Admin shell route).
2. Build `components/operations/IntakeFunnel.tsx`: four ordered figures with arrow separators; the auto-verified figure includes "avg N.Ns".
3. Build `components/operations/MatchLaneApprovalPanel.tsx`: the aggregate review surface + the single bulk-confirm action.
   - Top: count + delta-vs-baseline pill.
   - Inline list of bottom-quartile-confidence match applications (sorted ascending by `overall_confidence`); each row is tap-expandable to the P1-8 per-field breakdown (`<details>` or a controlled accordion).
   - A separate inline row for any match-lane application carrying a single flagged-but-still-match field (any `field_result` where `verdict` is not `match` while `lane === 'match'` — that combination is the "soft flag" case).
   - Bottom: "Approve all N" primary button. On click, bulk-confirm via `lib/operations/bulkConfirmMatchLane.ts`.
4. Build `components/operations/ReviewDistributionBoard.tsx`:
   - Top row: shared pool count, split into per-beverage-type counters with badges.
   - Per-agent rows: name, specialization pill, load bar (claimed / capacity), claimed count, availability pill.
   - Distribute action: calls into the P2-3 router seam (`lib/router/distribute.ts`); if P2-3 is not yet landed, a stub that no-ops is acceptable as long as the seam is named correctly.
5. Build `components/operations/LiveIntakeFeed.tsx`: the most recent N applications (default 10) with lane + destination string derived from `assigned_agent_id` (or "approval pool" / "review pool" when unassigned).
6. Build `lib/operations/funnel.ts`, `lib/operations/aggregateReview.ts`, `lib/operations/distribution.ts` as pure selectors over the fixture store.
7. Build `lib/operations/bulkConfirmMatchLane.ts`: marks every current match-lane application as `approved` and writes a disposition with `decision = approve` and a synthetic supervisor `agent_id` (the supervisor fixture). Audit semantics align with schema.md, but persistence is in-memory.
8. Compute the rolling baseline match rate from a fixture (e.g., last 14 days of `metric_rollup` placeholder); the delta is current-day match rate minus baseline, signed.
9. Use the supervisor fixture as the "logged-in" admin until P2-5 lands the role switcher.

### Key constraints

1. The match lane is NEVER in the exception work pool (D11, D15, CONTEXT.md Work pool). The aggregate review surface and the distribution board are two separate panels and they must not share a list.
2. Bulk confirm is NOT auto-clear (CONTEXT.md Bulk confirm vs Auto-clear; D11). The supervisor still glances at the aggregate (count, bottom-quartile, deltas) before clicking; that surface is what makes this a human-in-the-loop step, not unattended auto-clear.
3. The bottom-quartile expansion reuses the P1-8 per-field breakdown — do not reimplement it. Render it inline on `<details>` open.
4. The Distribute action triggers routing over exceptions only (FR-28; D15). The match lane is invisible to the router.
5. TypeScript strict, no `any`.
6. WCAG AA — colour + icon + text on every lane and availability pill (NFR-2; AC-9).
7. NFR-4: nothing persisted; state in the in-memory fixture store.

### Files to modify

Primary: `fixtures/samples.ts` — add a rolling-baseline match rate value and a supervisor agent fixture with `role = 'admin'`.
Current contents: (at start) the nine sample applications and the verification + field_result data from Phase 1.
Action: extend with `intake_baseline_match_rate`, the supervisor agent row, and `assigned_agent_id` / `claimed_at` on the exception fixtures so the distribution board renders correctly.

Secondary: `types/domain.ts` — add `FunnelSnapshot`, `AggregateReviewSnapshot`, `DistributionSnapshot`, `LiveIntakeEntry` derived types.

### Files to create

1. `app/(admin)/operations/page.tsx` — Operations route, three panels stacked.
2. `components/operations/IntakeFunnel.tsx` — funnel strip.
3. `components/operations/MatchLaneApprovalPanel.tsx` — aggregate review surface + bulk-confirm.
4. `components/operations/ReviewDistributionBoard.tsx` — shared pool row + per-agent rows + Distribute.
5. `components/operations/LiveIntakeFeed.tsx` — recent intake list.
6. `lib/operations/funnel.ts` — funnel selector.
7. `lib/operations/aggregateReview.ts` — bottom-quartile + flagged-field-in-match selectors + delta-vs-baseline.
8. `lib/operations/distribution.ts` — shared-pool count by beverage + per-agent load.
9. `lib/operations/bulkConfirmMatchLane.ts` — bulk-confirm action (in-memory).
10. `lib/router/distribute.ts` (stub) — P2-3 will own the body; export a no-op + named seam now so this page wires cleanly.

### Config / schema / store updates

- Add an `intake_baseline_match_rate` constant to fixtures (number, 0..1) so the delta is renderable.
- Add a supervisor agent fixture with `role: 'admin'` (matches schema.md trimmed enum: `agent`, `admin`).
- No new config files.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add unit tests:
- `lib/operations/funnel.test.ts` — counts match the fixture, latency average is correct.
- `lib/operations/aggregateReview.test.ts` — bottom-quartile cut is correct on small N (use `Math.ceil(N/4)`); a `lane === 'match'` application with a non-`match` `field_result` row surfaces in the flagged-field-in-match list; delta sign and magnitude are correct.
- `lib/operations/distribution.test.ts` — shared-pool count excludes match-lane apps and excludes already-claimed exceptions; per-agent counts are exact.
- `lib/operations/bulkConfirmMatchLane.test.ts` — writes one disposition per match-lane application with `decision = approve`; no exception-lane application is touched.

Manual:
- [ ] Open `/operations` as the supervisor fixture — funnel strip shows four figures; the auto-verified figure shows "avg N.Ns".
- [ ] Match-lane panel: count matches the four clean fixtures (Old Tom, Silver Branch, Maple Hollow, Juniper Coast); the bottom-quartile section is non-empty; the delta-vs-baseline pill renders signed.
- [ ] Tap-expand a bottom-quartile row → P1-8 per-field breakdown renders inline; collapsing hides it.
- [ ] Click "Approve all N" → every match-lane application transitions to `approved`; the panel re-renders with count 0 and shows a caught-up empty state.
- [ ] Distribution board: shared pool count is the unclaimed exceptions; the per-beverage split adds up.
- [ ] Live-intake feed shows lane + destination strings.
- [ ] Verify the supervisor surface for bulk-confirm shows the count, the bottom-quartile-confidence matches inline + tap-expandable, and the delta vs. baseline (FR-23 spot-check).
- [ ] Keyboard-only: tab through the panels; Enter on Approve all triggers confirmation.

Eval: (not applicable in Phase 2 — UI work)

Update docs: Mark P2-2 done in TICKETS.md; add a DEV-LOG entry noting the aggregate review surface contract and the router-seam stub for P2-3.

### Reference

- systemsdesign.md — D11 (review-model default), D15 (routing, shared pool, supervisor reassign), D16 (role-based shells).
- CONTEXT.md — Bulk confirm vs Auto-clear, Work pool, Admin.
- mockup.md — Operations.
- requirements.md — FR-20 (supervisor bulk-confirm of match lane), FR-23 (aggregate review surface: count, bottom-quartile inline + tap-expandable, deltas vs. baseline), FR-13 (lanes), FR-22 (status colour + icon + text), FR-28 (routing covers only exceptions), FR-29 (admin shell scope).
- schema.md — `application.lane`, `application.status`, `disposition` (append-only), `metric_rollup` (baseline source).

### Common gotchas

1. The aggregate review surface for bulk-confirm MUST include all three signals: count, bottom-quartile-confidence matches surfaced inline + tap-expandable, and deltas vs. baseline (FR-23). Missing any of these reduces it to "approve all" with no review, which is auto-clear — a different and off-by-default agency policy (CONTEXT.md Auto-clear; D11).
2. The match lane is NOT in the exception work pool. The distribution board and the match-lane approval panel must read from disjoint slices of the fixture store; never let a match-lane application appear in the shared-pool count or on an agent's row.
3. The Approve-all action writes one disposition per match-lane application with `decision = approve`. It does not mark them auto-cleared, and it does not bypass the disposition record (CONTEXT.md Bulk confirm; FR-20; schema.md disposition append-only).
4. The "single flagged field in an otherwise-match application" case (a `field_result` with `verdict != match` on a `lane === 'match'` application) must be surfaced inline in the aggregate review surface. This is the highest-value glance signal — a near-pass that the supervisor may want to spot-check (FR-23).

### Definition of Done

Code complete when:
- [ ] Operations page renders the funnel, the aggregate review surface (count + bottom-quartile inline + flagged-field-in-match inline + delta-vs-baseline), the bulk-confirm action, the review-distribution board, and the live-intake feed.
- [ ] Approve-all marks every match-lane application as approved with a disposition row each.
- [ ] No exception-lane application is touched by Approve-all; no match-lane application appears in the distribution board.
- [ ] WCAG AA pills; no console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/operations`, pushed, merged to main.

### Expected output

The Admin shell has a working Operations home: the supervisor sees the day's funnel, reviews the match-lane aggregate (count, bottom-quartile, flagged-in-match, delta-vs-baseline), clears it in one click, and sees the exception work pool distributed across agents with a Distribute action and a live-intake feed.

### Dependencies to install

```
(none — all UI work; reuse Next.js, Tailwind, and the P0/P1 toolchain)
```
