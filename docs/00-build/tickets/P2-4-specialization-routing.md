# P2-4 — Specialization routing

Make the router specialization-aware: an exception's `beverage_type` matches an available agent whose `specialization` includes that type; if no specialist is free, overflow to any available agent so the pool does not stall. Admins assign specializations from the Team view.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @mockup.md, and @TICKETS.md.

I'm working on TICKET-P2-4: Specialization routing.

Current state: (at start)
- [list what is DONE so far, with ✅, including P2-3 router with FIFO + priority selection strategy.]

What's NOT done yet:
- [P2-4] The router's selection step is FIFO over the whole pool; it ignores beverage type and the agent's specialization. There is no overflow fallback. Admin has no Team-view control for specialization yet (the Team view itself is P2-6, but the data + an inline edit lands here in P2-4 as the schema-level dependency).
- [P2-5] Role-based shells still need to gate Team-view specialization editing to admins.

TICKET-P2-4 Goal:
Replace the P2-3 FIFO selection strategy with a specialization-aware selection that matches an application's `beverage_type` to an agent whose `specialization` includes that type. If no specialist is available, the same pool item overflows to any available agent — the pool never starves on a thin specialty (D15; FR-28). Add the `specialization` data on the agent fixture, expose an admin-only `setSpecialization(agentId, types, actor)` operation, and surface a minimal inline editor that P2-6 will wrap in the full Team view.

Check lib/router/selectFifo.ts (the P2-3 strategy) before starting; don't replace it — add a new strategy alongside and switch the call site.
Follow @systemsdesign.md (D15 specialization-aware routing with overflow) and @CONTEXT.md (Specialization, Availability).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files and seams from P2-3 (`lib/router/claim.ts`, `lib/router/selectFifo.ts`, `lib/router/distribute.ts`).)_

### TICKET-P2-4 Scope

- Phase: Phase 2 — Queue, Routing, and Roles
- Time budget: 2.5h
- Dependencies: P2-3 (router with strategy seam)
- Branch: `feat/specialization`

### Acceptance criteria

- [ ] Each agent fixture has a `specialization` set (zero or more of `wine`, `distilled_spirits`, `malt_beverage`) (schema.md `agent.specialization`).
- [ ] The selection strategy `selectBySpecialization(pool, agent)` returns the highest-priority pool item whose `beverage_type` is in the agent's `specialization` set (D15; FR-28).
- [ ] When no pool item matches the agent's specialization and the agent is available, the strategy overflows to any pool item (priority order preserved) — the pool never starves (D15; FR-28).
- [ ] An out-of-office agent still returns null (the P2-3 availability gate remains the outer guard) (CONTEXT.md Availability).
- [ ] An admin-only `setSpecialization(agentId, types, actor)` operation sets the agent's `specialization`. Throws if actor is not `admin`.
- [ ] The Operations distribution board shows each agent's specialization as a pill (already in P2-2; verify it now reflects fixture data and updates after `setSpecialization`).
- [ ] Distribute respects specialization first, then overflows — a per-Distribute summary lists how many were matched-to-specialist vs overflow.
- [ ] An inline specialization editor is reachable from the per-agent rows on the distribution board (the full Team view lands in P2-6; this is the minimum the router needs to validate).

### Implementation details

1. Extend `fixtures/samples.ts`: add a `specialization` array to every agent (e.g., wine specialist gets `['wine']`, a generalist may have all three or none). Include at least one agent per specialty plus one generalist (no specialization) to make the overflow path observable.
2. Create `lib/router/selectBySpecialization.ts`: the new strategy.
   - Step 1 (specialist match): scan pool in priority order (mismatch first, oldest first); return the first item whose `beverage_type` is in `agent.specialization`.
   - Step 2 (overflow): if no specialist match, return the first item in priority order regardless of type.
   - If the pool is empty or the agent is not available (caller's responsibility), return null.
3. Switch the default strategy used by `lib/router/claim.ts` and `lib/router/distribute.ts` from `selectFifo` to `selectBySpecialization`. Keep `selectFifo` exported for tests and for the documented configurable-alternative path (round-robin push, per D15).
4. Create `lib/router/setSpecialization.ts`: admin-only mutation on the agent fixture. Throws if actor is not `admin`. Updates the agent's `specialization` array; existing claimed items are NOT reassigned (the supervisor uses `reassign` from P2-3 if they want to move them).
5. Update `lib/router/distribute.ts` to track and return a `{ specialistMatches, overflowMatches }` count in its summary.
6. Add an inline editor on the per-agent rows of `components/operations/ReviewDistributionBoard.tsx`: clicking the specialization pill opens a small multi-select (wine / spirits / malt); on save, calls `setSpecialization`.
7. Wire the actor: until P2-5 lands the role switcher, the page uses the supervisor fixture as the actor.

### Key constraints

1. Specialization is a soft partition with overflow, not a hard partition (D15; FR-28). A thin specialty (e.g., only one malt-beverage specialist who is out-of-office) must not stall the pool — the overflow fallback is mandatory.
2. The match lane is still never routed (D11, D15; CONTEXT.md Work pool). Specialization changes nothing here; it only refines selection within the exception pool.
3. Specialization is per-agent and admin-assigned. Agents do not self-assign. The `setSpecialization` operation is admin-only and must throw for any non-admin actor (D16).
4. Availability is the outer gate. An out-of-office specialist is skipped just like any other; the work overflows to whoever is available (CONTEXT.md Availability).
5. TypeScript strict, no `any`. The `specialization` field is typed as `BeverageType[]` (or readonly tuple); a missing or empty array means "no specialty" (treated as a generalist in the overflow branch).
6. NFR-4: nothing persisted; mutation lives in the in-memory fixture store. The data shape mirrors schema.md `agent.specialization`.

### Files to modify

Primary: `lib/router/claim.ts` — switch the default selection strategy to `selectBySpecialization`; keep the strategy parameter exposed.
Current contents: (at start) calls `selectFifo` as the default.
Action: change the default import; tests for P2-3 should still pass with `selectFifo` injected.

Secondary: `lib/router/distribute.ts` — track specialist vs overflow counts in the summary.

Tertiary: `fixtures/samples.ts` — add `specialization` to every agent; ensure at least one agent per beverage type and one generalist.

Quaternary: `components/operations/ReviewDistributionBoard.tsx` — add the inline specialization editor on the agent rows.

### Files to create

1. `lib/router/selectBySpecialization.ts` — the new selection strategy (specialist-first, then overflow).
2. `lib/router/setSpecialization.ts` — admin-only mutation.
3. `components/operations/SpecializationEditor.tsx` — small multi-select popover.
4. `lib/router/selectBySpecialization.test.ts` — strategy tests.
5. `lib/router/setSpecialization.test.ts` — role-gate + mutation tests.

### Config / schema / store updates

- Agent fixture rows gain `specialization: BeverageType[]`.
- No new config files.
- Mirrors schema.md `agent.specialization` (enum set null); the in-memory representation is an array.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add unit tests:
- `lib/router/selectBySpecialization.test.ts`
  - Specialist match: a wine specialist picks the oldest wine mismatch even if an older spirits mismatch exists.
  - Priority within specialty: a mismatch wine beats a review wine even if the review wine is older.
  - Overflow: when no wine items remain, the wine specialist picks the next item regardless of type.
  - Generalist (`specialization: []`) goes straight to the overflow branch.
  - Empty pool returns null.
- `lib/router/setSpecialization.test.ts`
  - Admin actor sets the array; agent fixture is mutated.
  - Non-admin actor throws.
  - Setting an empty array makes the agent a generalist (overflow-only).
  - Existing claimed items are NOT reassigned by `setSpecialization`.

Manual:
- [ ] In `fixtures/samples.ts`, set agent A as wine specialist, agent B as spirits, agent C as malt, agent D as generalist.
- [ ] On `/operations`, click Distribute → wine apps go to A, spirits to B, malt to C; leftover or thin-specialty apps go to D (or to a specialist whose specialty is empty).
- [ ] Mark agent A out-of-office → Distribute again → wine apps overflow to whoever is available.
- [ ] On `/operations`, click agent A's specialization pill → editor opens; change A from `wine` to `spirits`; verify the next Distribute behaves accordingly.
- [ ] Open `/queue` as agent A → only the items the router claimed for A appear.
- [ ] Bulk-confirm the match lane (P2-2) → confirm no match-lane application got specialized routing (sanity check).

Eval: (not applicable in Phase 2 — UI work)

Update docs: Mark P2-4 done in TICKETS.md; add a DEV-LOG entry noting the strategy swap, the specialist-vs-overflow counts in the distribute summary, and the admin-only `setSpecialization` operation that P2-6 wraps in the full Team view.

### Reference

- systemsdesign.md — D15 (specialization-aware routing with overflow; admins assign specializations in the Team view).
- CONTEXT.md — Specialization, Availability, Admin.
- mockup.md — Operations (specialization pill on agent rows), Team (specialization assignment).
- requirements.md — FR-28 (routing is specialization-aware with overflow; admins assign in Team view).
- schema.md — `agent.specialization` (enum set null), `application.beverage_type`.

### Common gotchas

1. Each application's `beverage_type` matches a specialist's `specialization`; overflow to any available agent applies only when no specialist is free (D15; FR-28). Hard-partitioning by specialty (no overflow) creates pool starvation on thin specialties and is the documented anti-pattern.
2. Specialization is assigned by admin in the Team view (CONTEXT.md Specialization). The agent cannot self-edit; the `setSpecialization` operation must throw for non-admin actors, mirroring the D16 admin-gated actions.
3. Availability is the outer gate; specialization is the inner selection step. An out-of-office specialist is skipped before the strategy even runs (CONTEXT.md Availability; P2-3 contract).
4. Changing an agent's specialization does NOT auto-reassign their currently-claimed items (they keep working what they already pulled). The supervisor uses `reassign` from P2-3 to move work if they want to. Auto-reassigning on edit would yank work mid-disposition.

### Definition of Done

Code complete when:
- [ ] `selectBySpecialization` matches specialists first, overflows when no match, and respects priority order in both branches.
- [ ] `claim.ts` and `distribute.ts` use the new strategy by default; `selectFifo` is still exported for tests.
- [ ] `setSpecialization` mutates the fixture and is admin-gated.
- [ ] The Operations distribution board shows specialization pills that reflect fixture data and update after the inline editor saves.
- [ ] Distribute summary reports specialist vs overflow counts.
- [ ] No console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/specialization`, pushed, merged to main.

### Expected output

The router routes wine exceptions to wine specialists, spirits to spirits, malt to malt, and overflows the rest to whoever is available; admins can edit specializations and the next Distribute reflects the change. Pool never stalls on a thin specialty.

### Dependencies to install

```
(none — all logic + UI; reuse Next.js, Tailwind, and the P0/P1 toolchain)
```
