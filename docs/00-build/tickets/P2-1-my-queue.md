# P2-1 — My Queue (agent)

Build the Agent shell's primary screen: a worklist of the agent's claimed exceptions, problems first, with a Get-next pull action that opens into the existing P1-8 review flow and auto-advances to the next item on disposition.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @mockup.md, and @TICKETS.md.

I'm working on TICKET-P2-1: My Queue (agent).

Current state: (at start)
- [list what is DONE so far, with ✅, including Phase 0 + Phase 1 — sample fixtures, verification pipeline, P1-7 result API, P1-8 review UI + dispositions + auto-advance.]

What's NOT done yet:
- [P2-1] My Queue screen (the Agent shell's home) does not exist.
- [P2-2..P2-6] Operations view, work router, specialization routing, role-based shells, and the Admin views (All Applications, Analytics, Team) are blocked on this and on P2-3.

TICKET-P2-1 Goal:
Build the My Queue screen for the Agent shell — a one-queue worklist showing only the agent's claimed exceptions (mismatch + review lanes), sorted problems-first, with a Get-next pull action that claims the next item from the shared exception pool (the P2-3 router will own pool selection; here, mock it against fixtures), and a claim bar stating "X claimed, Y in pool". Clicking a row opens the existing P1-8 review detail; auto-advance walks the queue. The match lane never appears here (CONTEXT.md Work pool).

Check app/(agent)/queue (or app/queue) and lib/queue before starting. Don't overwrite existing P1-8 review code; My Queue opens into it.
Follow the architecture and decisions in @systemsdesign.md (D11 review-model default, D15 pull-based shared queue, D16 role-based shells) and the rules in @CONTEXT.md (Work pool, Claim, Disposition, Agent).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P1-8's real output: the review UI components, the lane banner, the per-field breakdown table, the two-disposition action row with auto-advance, and the fixtures wiring.)_

### TICKET-P2-1 Scope

- Phase: Phase 2 — Queue, Routing, and Roles
- Time budget: 3h
- Dependencies: P1-8 (review UI + dispositions + auto-advance)
- Branch: `feat/my-queue`

### Acceptance criteria

- [ ] Only the logged-in agent's CLAIMED exceptions are shown (CONTEXT.md Work pool; FR-29 row-scoped agent shell).
- [ ] The match lane never appears in My Queue — it is bulk-confirmed on the Admin Operations view (D11; D15; CONTEXT.md Bulk confirm).
- [ ] Rows are sorted problems-first: mismatch lane before review lane; within each, oldest `claimed_at` first.
- [ ] Each row shows the brand, the one-line plain-language issue ("Alcohol content: form 40% vs label 45%"), and a colour-plus-icon-plus-text lane pill (NFR-2; AC-9).
- [ ] A claim bar at the top states "N claimed · M in pool" with a primary Get-next-from-pool action (mockup.md My Queue).
- [ ] Get-next claims the next eligible item from the shared exception pool (sets `assigned_agent_id`, `claimed_at`); in the prototype this is a fixture mutation, but the seam matches D15.
- [ ] Clicking a row opens the P1-8 review detail in the queue context.
- [ ] After a disposition, auto-advance moves to the next queued item; finishing shows a caught-up empty state with a "Get next from pool" affordance (mockup.md).
- [ ] All interactive elements meet WCAG AA: large targets (≥46px), full keyboard nav, status never colour-alone (NFR-2; AC-9).

### Implementation details

1. Create `app/(agent)/queue/page.tsx` (Agent shell route, gated by P2-5 in a later ticket; for now reachable directly via the nav and the role switcher placeholder).
2. Build `components/queue/QueueClaimBar.tsx`: shows claimed count, pool count, and the Get-next action.
3. Build `components/queue/QueueRow.tsx`: brand, plain-language issue summary, lane pill (colour + icon + text), large click target.
4. Build `lib/queue/myQueue.ts`: a pure selector taking the fixture set and the current agent id, returning only that agent's claimed exception applications sorted by lane priority then claimed_at.
5. Build `lib/queue/issueSummary.ts`: derives the single-line issue summary from the latest verification's `field_result` rows (the worst-verdict field + `form_value` vs `extracted_value`); reuse the result contract from P1-7.
6. Build `lib/queue/claimNext.ts`: a fixture-backed function that picks the next eligible exception from the pool and mutates `assigned_agent_id` + `claimed_at`. Expose the same seam shape the P2-3 router will plug into.
7. Wire row click → `app/(agent)/queue/[applicationId]/page.tsx`, which renders the P1-8 review detail; after disposition, navigate to the next queue item (or the caught-up state) using `useRouter`.
8. Empty state: when claimed count is zero, show "You're all caught up." with a Get-next-from-pool button.
9. Use the fixture agent id (`agents[0]`) as the "logged-in" agent until P2-5 lands the role switcher.

### Key constraints

1. Model reads, code decides — D4/D5 (no model calls here; this is a worklist over precomputed verification results).
2. The match lane is NEVER in My Queue (D11, D15, CONTEXT.md Work pool); only routed exceptions reach an agent.
3. Disposition is whole-application only (CONTEXT.md Disposition; FR-26); auto-advance moves to the next application, never to the next face or field of the same one.
4. TypeScript strict, no `any`.
5. WCAG AA — colour + icon + text on every lane pill (NFR-2; AC-9).
6. NFR-4: nothing persisted; queue state lives in the in-memory fixture store.

### Files to modify

Primary: `types/domain.ts` — extend with `QueueItem` derived type (application + latest verification + one-line issue summary) if not already present.
Current contents: (at start) the P0-2 result contract and Application/LabelFace/Verdict/Lane types.
Action: add the derived `QueueItem` and re-export; no schema-level changes.

Secondary: `fixtures/samples.ts` — add `claimed_at` / `assigned_agent_id` to exception fixtures so the claimed-vs-pool split renders.

### Files to create

1. `app/(agent)/queue/page.tsx` — My Queue route.
2. `app/(agent)/queue/[applicationId]/page.tsx` — review detail in queue context (hosts the P1-8 review components and auto-advance).
3. `components/queue/QueueClaimBar.tsx` — claimed/pool counts + Get-next.
4. `components/queue/QueueRow.tsx` — single row with brand, issue summary, lane pill.
5. `components/queue/EmptyQueue.tsx` — caught-up state.
6. `lib/queue/myQueue.ts` — selector for "this agent's claimed exceptions".
7. `lib/queue/issueSummary.ts` — derives the plain-language one-liner from `field_result` rows.
8. `lib/queue/claimNext.ts` — pool-picker + claim mutation seam (the P2-3 router will reuse this contract).
9. `lib/queue/types.ts` — `QueueItem`, `QueueSelector`, `ClaimResult`.

### Config / schema / store updates

- In-memory fixture store gains `claimed_at` and `assigned_agent_id` on exception rows. No schema/config files added.
- Mirrors schema.md `application.assigned_agent_id` and `application.claimed_at`; production semantics are identical, only persistence differs.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add unit tests:
- `lib/queue/myQueue.test.ts` — only the current agent's claimed exceptions returned; match-lane rows are filtered out; sort order is mismatch→review then by claimed_at ascending.
- `lib/queue/issueSummary.test.ts` — uses the worst-verdict field; formats values cleanly for ABV, net contents, brand, and the warning.
- `lib/queue/claimNext.test.ts` — mutates `assigned_agent_id` and `claimed_at`; respects out-of-office (returns no claim if agent unavailable, anticipating P2-4 + Profile).

Manual:
- [ ] Open `/queue` as the fixture agent — only their claimed exceptions render; the match-lane samples (Old Tom, Silver Branch, Maple Hollow, Juniper Coast) are nowhere on this page.
- [ ] Claim bar shows correct claimed/pool counts.
- [ ] Click a row → P1-8 review detail opens; Approve or Return → auto-advances to the next claimed exception.
- [ ] When the last claimed item is dispositioned → caught-up state, Get-next button visible.
- [ ] Click Get-next → next pool item appears in the list and is auto-opened (or stays in the list if Get-next is from the empty state; pick one behaviour and document it).
- [ ] Keyboard-only: tab to a row, Enter opens it; tab to Get-next, Enter claims.
- [ ] Manually verify the role-switcher gate placeholder: until P2-5 lands, the Agent shell is reachable but admin-only actions (bulk-confirm on Operations) are not visible from this route.

Eval: (not applicable in Phase 2 — UI work)

Update docs: Mark P2-1 done in TICKETS.md; add a DEV-LOG entry noting the queue selector + claim seam and how P2-3 will plug into it.

### Reference

- systemsdesign.md — D11 (review-model default), D15 (pull-based shared queue, claim semantics), D16 (role-based shells).
- CONTEXT.md — Work pool, Claim, Availability, Disposition, Agent.
- mockup.md — My Queue, Review detail (auto-advance), The Lane Visual Language.
- requirements.md — FR-13 (lanes), FR-22 (status pills), FR-24 (per-field expand from review detail), FR-26 (two dispositions, whole-application), FR-28 (routing, the seam this page consumes), FR-29 (role shells, agent scope).
- schema.md — `application.assigned_agent_id`, `application.claimed_at`, `application.lane`, `field_result`.

### Common gotchas

1. Only the agent's CLAIMED exceptions appear here. The match lane is NEVER routed to an agent — it is bulk-confirmed on the Admin Operations view (CONTEXT.md Work pool; D11; D15). The shared exception pool is a separate concept from My Queue; My Queue holds what the agent has already pulled.
2. Auto-advance is per-application, not per-face or per-field. The P1-8 review is whole-application, and the queue's auto-advance must match (CONTEXT.md Disposition; FR-26).
3. The one-line issue summary comes from the latest `field_result` rows on the current verification — not from a model self-report. Pick the worst verdict's field (mismatch beats not_found beats low_confidence) so the agent sees the real problem first (FR-15; D5).
4. Get-next must respect agent availability. An out-of-office agent should not be able to pull (CONTEXT.md Availability; D15). Even though the Profile screen lands in P2-5/P2-6, wire the eligibility check now so the seam is right.

### Definition of Done

Code complete when:
- [ ] My Queue renders only the current agent's claimed exceptions, sorted problems-first.
- [ ] Match-lane applications never appear on this page (verified by a unit test and a manual check against the fixture set).
- [ ] Get-next claims the next pool item and shows it on the list (and respects availability).
- [ ] Row click → P1-8 review detail; disposition auto-advances; finishing shows the caught-up state.
- [ ] No console errors. WCAG AA on lane pills and targets.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/my-queue`, pushed, merged to main.

### Expected output

The Agent shell has a working My Queue: the agent lands in their claimed exceptions, sees problems first, pulls more from the pool with one click, and walks through the P1-8 review with auto-advance until caught up. The match lane is invisible to the agent.

### Dependencies to install

```
(none — all UI work; reuse Next.js, Tailwind, and the P0/P1 toolchain)
```
