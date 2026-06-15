# P2-3 — Work router

Build the work router: triaged exceptions enter a single prioritized shared pool; the match lane is bulk-confirmed and never assigned; agents claim items (which sets `assigned_agent_id` + `claimed_at`); a supervisor can hand-assign or reassign. The match lane never enters the router.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @mockup.md, and @TICKETS.md.

I'm working on TICKET-P2-3: Work router.

Current state: (at start)
- [list what is DONE so far, with ✅, including Phase 1 triage classifier (P1-5), P2-1 My Queue with its `claimNext` seam, and P2-2 Operations with its Distribute seam stub.]

What's NOT done yet:
- [P2-3] The router itself: pool admission, claim, supervisor hand-assign, supervisor reassign.
- [P2-4] Specialization-aware pull and overflow are blocked on this.
- [P2-5] The role-based shells need this router to power the Distribute action and the Get-next pull.

TICKET-P2-3 Goal:
Implement the work router as a pure module. The router takes the triaged exception applications (mismatch + review lanes only) and the agent roster, and exposes four operations: (1) admit-to-pool — add a freshly-triaged exception to the shared pool; (2) claim-next — atomically pick the next eligible item for an agent and set `assigned_agent_id` + `claimed_at`; (3) hand-assign — supervisor sets `assigned_agent_id` directly on a pool item or a claimed item; (4) reassign — supervisor moves a claimed item from agent A to agent B (or back to the pool). The match lane is never admitted (D15; CONTEXT.md Work pool). Specialization-aware selection lands in P2-4; here, claim-next is FIFO over the pool's priority order, with availability gating.

Check lib/router (the stub seam from P2-2) and lib/queue/claimNext.ts before starting; don't overwrite either. Replace the P2-2 distribute stub and rewire the P2-1 claimNext to call into this module.
Follow @systemsdesign.md (D15 work distribution and routing) and @CONTEXT.md (Work pool, Claim, Availability).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files and seams from P2-1 (`lib/queue/claimNext.ts`) and P2-2 (`lib/router/distribute.ts` stub).)_

### TICKET-P2-3 Scope

- Phase: Phase 2 — Queue, Routing, and Roles
- Time budget: 3h
- Dependencies: P1-5 (triage classifier; produces the lane on each application)
- Branch: `feat/router`

### Acceptance criteria

- [ ] Only exception-lane applications (`lane === 'mismatch'` or `lane === 'review'`) are admitted to the pool. Match-lane applications are explicitly rejected by the admit function (D15; CONTEXT.md Work pool).
- [ ] `claimNext(agentId)` picks the next eligible pool item and atomically sets `assigned_agent_id` and `claimed_at` (D15; CONTEXT.md Claim).
- [ ] Pool priority is: mismatch before review; within each lane, oldest `submitted_at` first.
- [ ] An out-of-office agent (`availability === 'out_of_office'`) cannot claim; `claimNext` returns null (CONTEXT.md Availability; D15).
- [ ] `handAssign(applicationId, agentId, actor)` lets a supervisor (role `admin`) set `assigned_agent_id` on a pool item or a claimed item (D15).
- [ ] `reassign(applicationId, fromAgentId, toAgentId, actor)` lets a supervisor move a claimed item between agents; passing `null` for `toAgentId` returns it to the pool (D15).
- [ ] Hand-assign and reassign are admin-only; calling them with a non-admin actor throws.
- [ ] Routing covers exceptions only — the bulk-confirm path on the match lane (P2-2) bypasses the router entirely (FR-28; D15).
- [ ] All four operations are pure and synchronous over the in-memory fixture store; they expose seams the production path (schema.md) plugs into without contract changes.

### Implementation details

1. Create `lib/router/types.ts` with the contract: `PoolItem`, `ClaimResult`, `AssignActor` (a `{ id, role }`), `RouterError`.
2. Create `lib/router/admit.ts` — `admitToPool(application): void`. Throws if `lane === 'match'` or `lane === null`. Idempotent on the same application id.
3. Create `lib/router/claim.ts` — `claimNext(agentId): ClaimResult | null`. Sorts pool by priority (mismatch < review) then by `submitted_at`. Skips if the agent is not `available`. P2-4 will replace the selection function with a specialization-aware version; export the selection step as a swappable strategy.
4. Create `lib/router/handAssign.ts` — `handAssign(applicationId, agentId, actor)`. Throws if `actor.role !== 'admin'`. Sets `assigned_agent_id`; if not already claimed, sets `claimed_at` too.
5. Create `lib/router/reassign.ts` — `reassign(applicationId, fromAgentId, toAgentId, actor)`. Throws if `actor.role !== 'admin'`. Validates the `from` matches the current `assigned_agent_id`. If `toAgentId === null`, clears `assigned_agent_id` and `claimed_at` (returns to pool).
6. Create `lib/router/distribute.ts` — replace the P2-2 stub. Iterates the pool, calls `claimNext` for each available agent until either the pool is empty or no agent can be matched. Returns a summary `{ assignedCount, byAgentId }`.
7. Rewire `lib/queue/claimNext.ts` (from P2-1) to delegate to `lib/router/claim.ts`. Keep the queue-facing function name stable.
8. Rewire `app/(admin)/operations/page.tsx` Distribute button to call `lib/router/distribute.ts`. The shared-pool counter and per-agent load bars should reflect the new state.
9. Add a "Reassign" affordance on the per-agent rows in the distribution board (open a small picker: pick a different agent or "Return to pool"). Wire to `reassign`.
10. Add a "Hand-assign" affordance on the shared-pool row in the distribution board (open a picker of available agents). Wire to `handAssign`.

### Key constraints

1. The match lane is never routed (D11, D15; CONTEXT.md Work pool). `admitToPool` must reject it; the bulk-confirm path on Operations writes dispositions directly and does not touch the router.
2. Claim is atomic: pick + set `assigned_agent_id` + set `claimed_at` happen as one synchronous step on the in-memory store, so two near-simultaneous calls cannot both win the same item (CONTEXT.md Claim).
3. Availability gates claim eligibility but does NOT remove an agent's currently-claimed items; supervisor reassign is the path for that (CONTEXT.md Availability; D15).
4. Specialization-aware selection lands in P2-4. Here, expose the selection step as a strategy parameter (`selectFromPool(pool, agent): PoolItem | null`) so P2-4 swaps the body, not the call site.
5. TypeScript strict, no `any`.
6. NFR-4: nothing persisted; all four operations mutate the in-memory fixture store and expose the same shape schema.md production tables will hold.

### Files to modify

Primary: `lib/router/distribute.ts` — replace the P2-2 stub with the real distribution loop.
Current contents: (at start) `export function distribute() { /* no-op */ }`.
Action: implement iteration + `claimNext` calls + summary return.

Secondary: `lib/queue/claimNext.ts` — delegate to `lib/router/claim.ts`; preserve the queue-facing signature.

Tertiary: `app/(admin)/operations/page.tsx` — wire the Distribute button and add the Hand-assign and Reassign pickers to the distribution board rows.

### Files to create

1. `lib/router/types.ts` — `PoolItem`, `ClaimResult`, `AssignActor`, `RouterError`, `SelectFromPoolStrategy`.
2. `lib/router/admit.ts` — `admitToPool`.
3. `lib/router/claim.ts` — `claimNext` with strategy parameter.
4. `lib/router/handAssign.ts` — supervisor hand-assign.
5. `lib/router/reassign.ts` — supervisor reassign + return-to-pool.
6. `lib/router/selectFifo.ts` — default FIFO + priority strategy (mismatch first, then review, oldest first).
7. `components/operations/HandAssignPicker.tsx` — small agent picker.
8. `components/operations/ReassignPicker.tsx` — small agent picker with "Return to pool" option.

### Config / schema / store updates

- The in-memory store gains a derived "pool" view (any exception application with `assigned_agent_id === null`). No new tables; mirrors schema.md `application.assigned_agent_id` / `application.claimed_at` semantics.
- Audit semantics: every claim, hand-assign, and reassign logs a synthetic `audit_event` entry into the in-memory store (`event_type: 'assigned'` for claim/hand-assign, `'override'` for reassign). Production maps this directly to `audit_event` (schema.md).

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add unit tests:
- `lib/router/admit.test.ts` — rejects `lane === 'match'`; rejects unverified (`lane === null`); accepts mismatch and review; idempotent.
- `lib/router/claim.test.ts` — priority order is correct (mismatch before review); within a lane, oldest first; out-of-office agent gets null; once claimed, the item leaves the pool; two sequential claims for two agents pick different items.
- `lib/router/handAssign.test.ts` — admin actor succeeds; non-admin actor throws; sets `claimed_at` if previously unclaimed.
- `lib/router/reassign.test.ts` — admin moves A→B; `from` must match current assignment; `to === null` returns to pool and clears `claimed_at`.
- `lib/router/distribute.test.ts` — clears the pool when capacity exists; partial when capacity is short; never touches match-lane applications.

Manual:
- [ ] On `/operations`, click Distribute → shared-pool count decreases and per-agent load bars increase to match.
- [ ] Open `/queue` (P2-1) as an agent who just received items → they appear in the claimed list.
- [ ] On `/operations`, open the Reassign picker on an agent row → move an item to another agent; refresh `/queue` → it has moved.
- [ ] On `/operations`, Hand-assign from the shared-pool row → the picked agent's row gains the item.
- [ ] Mark an agent out-of-office in the fixture; click Distribute → that agent is skipped.
- [ ] Bulk-confirm the match lane (P2-2) → confirm the router was not invoked; no match-lane application has `assigned_agent_id` set.

Eval: (not applicable in Phase 2 — UI work)

Update docs: Mark P2-3 done in TICKETS.md; add a DEV-LOG entry noting the four router operations, the strategy seam for P2-4, and the audit-event mirroring.

### Reference

- systemsdesign.md — D15 (work distribution and routing: pull-based shared pool, claim semantics, supervisor hand-assign and reassign, prototype simulation).
- CONTEXT.md — Work pool, Claim, Availability, Admin.
- mockup.md — Operations (review distribution board, Distribute action).
- requirements.md — FR-28 (routing over exceptions only, claim assigns + timestamps, supervisor reassign, specialization in P2-4).
- schema.md — `application.assigned_agent_id`, `application.claimed_at`, `application.lane`, `audit_event`.

### Common gotchas

1. The router only routes exceptions; the match lane is bulk-confirmed and never assigned (D11, D15; CONTEXT.md Work pool, Bulk confirm). `admitToPool` must hard-reject `lane === 'match'` — guard it with both a runtime check and a type narrowing so a refactor cannot silently re-introduce match-lane routing.
2. Claim sets BOTH `assigned_agent_id` and `claimed_at`; the supervisor's hand-assign sets the same two fields. Forgetting the timestamp breaks the queue-row sort in P2-1 (CONTEXT.md Claim; schema.md).
3. Availability gates claim but does not auto-release. An agent who goes out-of-office mid-shift keeps their claimed items until a supervisor reassigns them (CONTEXT.md Availability; D15). Do not silently re-pool their items.
4. The selection step is a strategy parameter so P2-4 can swap in the specialization-aware version without touching the claim site. Hard-coding FIFO at the call site forces a rewrite in P2-4 — avoid that.

### Definition of Done

Code complete when:
- [ ] All four operations (`admitToPool`, `claimNext`, `handAssign`, `reassign`) work against the in-memory store.
- [ ] `distribute` clears the pool to capacity and is wired to the Operations Distribute button.
- [ ] My Queue (P2-1) Get-next delegates to `claimNext`.
- [ ] Hand-assign and Reassign pickers work on the distribution board.
- [ ] No match-lane application is ever in the pool or carries `assigned_agent_id`.
- [ ] No console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/router`, pushed, merged to main.

### Expected output

The work router is the single coordination point for exceptions. Distribute on Operations clears the shared pool to capacity; Get-next on My Queue pulls the next eligible item; supervisor can hand-assign or reassign from the distribution board. The match lane is invisible to the router. P2-4 can drop in specialization-aware selection without changing the call sites.

### Dependencies to install

```
(none — all logic + UI; reuse Next.js, Tailwind, and the P0/P1 toolchain)
```

---

## Outcome — done 2026-06-15

**Branch:** `feat/router`
**Status:** Done — 215 tests pass + 1 skipped (+41 new); lint + build clean.
**Workflow:** First ticket executed by parallel subagents under the agent-dispatch preference. Agent A built `lib/router/` + the QueueProvider wiring; Agent B built the UI pickers + Operations page integration. Both ran simultaneously against a fixed contract dictated upfront; integration was clean on the first combined build.

**What landed:**
- `lib/router/{types,selectFifo,admit,claim,handAssign,reassign,distribute}.ts` — pure router module with strategy seam for P2-4.
- `lib/router/__tests__/` — 6 suites, 41 tests covering admit (match-lane reject, idempotent), claim (priority, availability, mutually exclusive between agents), selectFifo (ordering), handAssign (admin gate, claimedAt preservation), reassign (from validation, return-to-pool, audit event), distribute (full-pool clear, partial when short, no match-lane).
- `lib/queue/types.ts` — `AuditEvent` type; `auditEvents` field on `QueueStoreState`.
- `lib/queue/QueueProvider.tsx` — `applyDistribute`, `handAssign`, `reassign` actions. RouterError surfaced as `{ ok: false, error }`.
- `lib/queue/claimNext.ts` — delegates to `lib/router/claim.ts`, preserves queue-facing signature.
- `components/operations/{HandAssignPicker,ReassignPicker}.tsx` — popovers with availability + load + specialization, keyboard-navigable.
- `components/operations/ReviewDistributionBoard.tsx` — Hand-assign list inside the shared-pool row; Reassign list inside each per-agent row.
- `app/(admin)/operations/page.tsx` — wired to the provider's new actions; derives `poolItems` and `claimedByAgent` from state.

**Deviations:**
- `distribute()` filters admins out of the auto-routing pass — supervisors pull via hand-assign, not auto-routing.
- `claim.ts` returns `null` (not throw) on agent unavailability — out-of-office is a routing state, not an error.
- The reassign picker shows OOO agents with a greyed pill so supervisors can move work OFF them without forcing a Profile change first.

### Why

P2-3 was the first ticket worked by parallel agents. The contract-first dispatch — dictating the function signatures the UI would consume upfront, then handing each agent disjoint files — meant both halves arrived at the same seam from opposite directions and integration was clean on the first attempt. The parallel saving is real, but only when the work splits along a stable contract.

The **work router is the single coordination point for exceptions** (D15). Match-lane bypasses the router structurally — `admit` throws `RouterError("match_lane_rejected")` with a typed code so a refactor can't silently re-route match work. The bulk-confirm path on Operations is disjoint from the router, exactly the way CONTEXT.md draws the line between bulk-confirm and auto-clear.

The **strategy parameter on `claimNext`** is the seam P2-4 plugs into. Hardcoding FIFO at the call site would force a rewrite when specialization-aware routing lands; strategy-as-parameter means the call site stays stable.

The **availability-returns-null** rule is honest semantics. Out-of-office isn't an error; it's a routing state. `claim.ts` returns null so the caller decides (skip to the next agent, surface a notice). `handAssign` and `reassign` still throw because those are admin actions where a wrong actor is a real bug.

The **preserve-claimedAt-on-hand-off** rule makes the queue's "oldest first" sort honest. A supervisor can't "freshen" old items by reassigning them. Return-to-pool clears `claimedAt` because the item is genuinely re-entering pre-claim state.

The **audit-event log** mirrors the production `audit_event` table. Every router mutation emits an event with `actorId` + `eventType` + metadata. P6-2's persistence layer swaps the in-memory array for a database write; the producer side stays identical. Supervisor reassignments are defensible after the fact.

The **OOO-in-reassign-picker** judgment call is right. Hiding OOO agents would force the supervisor to wait for the agent to come back online before moving work off them. The greyed pill keeps the workflow possible.
