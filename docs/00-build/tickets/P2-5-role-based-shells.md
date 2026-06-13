# P2-5 — Role-based shells

Wrap the existing screens in two role shells: Admin (Operations, All Applications, Analytics, Team, Knowledge Base) and Agent (My Queue, My Stats, Profile). A sidebar role switcher simulates identity; queries are row-scoped (admin global, agent own-data only); admin-only actions are gated server-side too.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @mockup.md, and @TICKETS.md.

I'm working on TICKET-P2-5: Role-based shells.

Current state: (at start)
- [list what is DONE so far, with ✅, including P2-1 My Queue, P2-2 Operations (bulk-confirm + distribution board), P2-3 router (with admin-only handAssign/reassign), P2-4 specialization (with admin-only setSpecialization). The agent fixture has `role: agent | admin`; the supervisor fixture has `role: admin`.]

What's NOT done yet:
- [P2-5] There is no sidebar shell, no role switcher, no client-side route gating, and no row-scoping for agent-shell queries. The admin-only operations throw at the lib layer but the buttons are reachable from non-admin contexts.
- [P2-6] All Applications, Analytics, and Team are blocked on the Admin shell landing.

TICKET-P2-5 Goal:
Build the two-shell navigation and the role-switcher. Admin shell exposes Operations, All Applications (P2-6), Analytics (P2-6), Team (P2-6), Knowledge Base (placeholder; P4-1 fills it). Agent shell exposes My Queue, My Stats (P2-6 placeholder), Profile. The role switcher in the sidebar swaps the active identity between the supervisor and an agent (simulated; production: PIV/CAC/SSO per NFR-8). All Agent-shell queries are row-scoped to the active agent id; Admin-shell queries are global. Admin-only actions (bulk-confirm, distribute, hand-assign, reassign, set-specialization) are visible only in the Admin shell and gated at every call site.

Check app/(admin) and app/(agent) (the route groups from P2-1 and P2-2) and lib/auth (does not exist yet) before starting.
Follow @systemsdesign.md (D16 role-based shells: two effective roles, row-scoped data, admin-only actions) and @CONTEXT.md (Admin).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the route-group files from P2-1 (`app/(agent)/queue`) and P2-2 (`app/(admin)/operations`), the admin-only operations from P2-3 and P2-4, and the supervisor + agent fixtures with the `role` field.)_

### TICKET-P2-5 Scope

- Phase: Phase 2 — Queue, Routing, and Roles
- Time budget: 3h
- Dependencies: P2-1 (My Queue), P2-2 (Operations)
- Branch: `feat/roles`

### Acceptance criteria

- [ ] Two effective roles, `agent` and `admin`, matching the trimmed schema.md enum and D16. No third role anywhere in code (D16; schema.md `agent.role`).
- [ ] Admin shell sidebar shows: Operations, All Applications, Analytics, Team, Knowledge Base. (All Applications, Analytics, Team land in P2-6; Knowledge Base is a navigation placeholder that lands in P4-1.) (mockup.md; FR-29).
- [ ] Agent shell sidebar shows: My Queue, My Stats, Profile. (My Stats and Profile land in P2-6 as placeholders.) (mockup.md; FR-29).
- [ ] A role switcher at the bottom of the sidebar toggles between the supervisor identity and a chosen agent identity; switching re-renders the shell and the routes (FR-29 prototype; D16).
- [ ] Agent-shell data is row-scoped to the active agent id (their claimed items, their stats, their profile — never anyone else's) (FR-29; D16).
- [ ] Admin-shell data is global (the whole division) (FR-29; D16).
- [ ] Admin-only actions are gated:
  - Bulk-confirm the match lane (P2-2) — admin-only.
  - Distribute (P2-3) — admin-only.
  - Hand-assign and reassign (P2-3) — admin-only.
  - Set specialization (P2-4) — admin-only.
  - Each is hidden in the Agent shell AND throws at the lib layer if invoked with a non-admin actor (defense in depth) (D16).
- [ ] Visiting an admin-only route (e.g. `/operations`) while in the Agent shell redirects to `/queue` (route-level gate) (FR-29).
- [ ] Visiting an agent-only route (e.g. `/queue`) while in the Admin shell redirects to `/operations` (consistency).
- [ ] An information banner under the role switcher states plainly: "Prototype: role is simulated. Production uses PIV/CAC and SSO." (NFR-8).

### Implementation details

1. Create `lib/auth/activeAgent.ts`: a tiny in-memory store of the currently-active agent id, with `getActiveAgent()`, `setActiveAgent(agentId)`, and `getActor()` (returns `{ id, role }`). Wired to the supervisor fixture by default.
2. Create `lib/auth/scope.ts` with `requireAdmin(actor)` (throws on non-admin) and `scopeToAgent(agentId, query)` helpers. Re-export from `lib/router` so existing call sites can adopt the helper without rewriting their guards.
3. Refactor the existing admin-only operations (`handAssign`, `reassign`, `setSpecialization`, `bulkConfirmMatchLane`, `distribute`) to call `requireAdmin(actor)` instead of inline `actor.role !== 'admin'` checks. Functionally identical; centralises the check.
4. Create `components/shell/AdminShell.tsx` and `components/shell/AgentShell.tsx`: each renders a sidebar with the role-specific nav items plus the role switcher.
5. Create `components/shell/RoleSwitcher.tsx`: a dropdown listing the supervisor and the seeded agents; selecting one calls `setActiveAgent`, navigates to the role's default route (`/operations` for admin, `/queue` for agent), and re-renders.
6. Create `app/(admin)/layout.tsx`: wraps every admin route with `AdminShell`. If the active actor is not admin, redirect to `/queue` (use `redirect` from `next/navigation` in a server component).
7. Create `app/(agent)/layout.tsx`: wraps every agent route with `AgentShell`. (Agents include admin users only when they are explicitly viewing as an agent via the switcher.) If the active actor is admin, redirect to `/operations`. Note: when the admin switches to an agent via the role switcher, the active actor becomes that agent — so the redirect logic is based on the active actor, not on the user's underlying role.
8. Create placeholder routes that P2-6 and P4-1 will fill:
   - `app/(admin)/applications/page.tsx` — "All Applications (coming in P2-6)" placeholder.
   - `app/(admin)/analytics/page.tsx` — "Analytics (coming in P2-6)" placeholder.
   - `app/(admin)/team/page.tsx` — "Team (coming in P2-6)" placeholder.
   - `app/(admin)/knowledge-base/page.tsx` — "Knowledge Base (coming in P4-1)" placeholder.
   - `app/(agent)/stats/page.tsx` — "My Stats (coming in P2-6)" placeholder.
   - `app/(agent)/profile/page.tsx` — "Profile (coming in P2-6)" placeholder, but include the Availability control now since the router (P2-3, P2-4) already reads `agent.availability`.
9. The Profile placeholder should expose an Availability toggle (`available` ↔ `out_of_office`) that mutates the active agent's fixture row. This is the bare minimum to let testers exercise the P2-3 availability gate. The full Profile UI lands later.
10. Wire the My Queue (P2-1) and Operations (P2-2) routes under the new layouts; nothing else changes in those pages.
11. Update the existing Operations page so the Distribute / Hand-assign / Reassign / Bulk-confirm buttons read the active actor from `getActor()` rather than the hard-coded supervisor.

### Key constraints

1. Two effective roles only — `agent` and `admin` (D16; schema.md `agent.role` trimmed enum). Do not introduce a third role or a "supervisor" string that is not `admin`.
2. Admin sees global; Agent sees row-scoped own work only (D16). Every Agent-shell data fetch must filter by the active agent id; a forgotten filter is a defect.
3. The role switcher simulates identity in the prototype. Production uses PIV/CAC and SSO (NFR-8). State this in-shell so the reviewer knows it is not a real auth control.
4. Admin-only actions are gated at both the route layer (redirect on visit) and the lib layer (`requireAdmin` throws). Defense in depth — if the route gate is bypassed, the lib layer still refuses.
5. TypeScript strict, no `any`. `Actor` is `{ id: AgentId; role: 'agent' | 'admin' }`.
6. WCAG AA — sidebar nav items and the role switcher meet the same 46px-target rule as queue rows (NFR-2).
7. NFR-4: nothing persisted; role state lives in the in-memory `activeAgent` store.

### Files to modify

Primary: `app/(admin)/operations/page.tsx`, `app/(agent)/queue/page.tsx` — wrap under the new layouts; read `getActor()` for any admin-gated action.
Current contents: (at start) hard-coded supervisor or agent fixture references.
Action: replace hard-coded ids with `getActiveAgent()` / `getActor()`.

Secondary: `lib/router/handAssign.ts`, `lib/router/reassign.ts`, `lib/router/setSpecialization.ts`, `lib/operations/bulkConfirmMatchLane.ts`, `lib/router/distribute.ts` — call `requireAdmin(actor)` instead of inline role checks.

Tertiary: `lib/queue/myQueue.ts` — accepts an `agentId` parameter (no behaviour change; verify the call site passes `getActiveAgent()`).

### Files to create

1. `lib/auth/activeAgent.ts` — active-agent store + `getActor`.
2. `lib/auth/scope.ts` — `requireAdmin`, `scopeToAgent`.
3. `components/shell/AdminShell.tsx` — Admin sidebar shell.
4. `components/shell/AgentShell.tsx` — Agent sidebar shell.
5. `components/shell/RoleSwitcher.tsx` — identity dropdown.
6. `app/(admin)/layout.tsx` — admin route group layout with redirect gate.
7. `app/(agent)/layout.tsx` — agent route group layout with redirect gate.
8. `app/(admin)/applications/page.tsx` — placeholder for P2-6.
9. `app/(admin)/analytics/page.tsx` — placeholder for P2-6.
10. `app/(admin)/team/page.tsx` — placeholder for P2-6.
11. `app/(admin)/knowledge-base/page.tsx` — placeholder for P4-1.
12. `app/(agent)/stats/page.tsx` — placeholder for P2-6.
13. `app/(agent)/profile/page.tsx` — placeholder + Availability toggle (the rest of Profile lands in P2-6).

### Config / schema / store updates

- `agent.role` is already `agent | admin` in the trimmed schema; no enum change.
- The active-agent store is purely in-memory.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add unit tests:
- `lib/auth/scope.test.ts` — `requireAdmin` throws for `role: 'agent'`, passes for `role: 'admin'`.
- `lib/queue/myQueue.test.ts` (extend) — passing a different agent id returns only that agent's claimed items; never leaks across agents.
- `lib/router/handAssign.test.ts` (extend) — non-admin actor still throws after the refactor; behaviour unchanged.

Manual:
- [ ] Open the app — default lands as supervisor on `/operations`; sidebar shows the five admin nav items.
- [ ] Open the role switcher → pick an agent → page navigates to `/queue`; sidebar shows the three agent nav items. Verify the role switcher gates correctly: the agent-shell sidebar does NOT show Operations, All Applications, Analytics, Team, or Knowledge Base.
- [ ] In the Agent shell, type `/operations` in the URL bar → redirected to `/queue`.
- [ ] Switch back to supervisor → `/queue` redirects to `/operations`.
- [ ] In the Agent shell, verify only the active agent's claimed items show; switch to a different agent → the queue contents change.
- [ ] In the Admin shell, click Distribute → succeeds. Switch to Agent shell → the Distribute button is not visible on any route reachable from the agent sidebar.
- [ ] Open the Profile placeholder → toggle Availability to `out_of_office` → return to Operations → Distribute → confirm the now-out-of-office agent is skipped.
- [ ] Information banner under the role switcher reads the prototype-vs-PIV-CAC line.

Eval: (not applicable in Phase 2 — UI work)

Update docs: Mark P2-5 done in TICKETS.md; add a DEV-LOG entry noting the two shells, the role switcher seam, the route gates + lib-layer `requireAdmin` defense-in-depth, and the production swap point (NFR-8).

### Reference

- systemsdesign.md — D16 (role-based shells: two effective roles, row-scoped Agent queries, global Admin queries, admin-only actions gated, prototype simulates with role switcher).
- CONTEXT.md — Admin, Agent, Availability.
- mockup.md — Screens (Admin shell vs Agent shell), Assistant (role-aware).
- requirements.md — FR-29 (two role-based shells, role switcher in prototype, RBAC in production), NFR-8 (PIV/CAC/SSO in production), NFR-2 (accessibility).
- schema.md — `agent.role` enum trimmed to `agent`, `admin`.

### Common gotchas

1. Two effective roles, `agent` and `admin`, per D16 and the schema-trim. Admin sees global; Agent sees row-scoped own work only. The role switcher simulates identity in the prototype; production uses PIV/CAC/SSO (NFR-8) — call this out in the in-shell banner so the reviewer does not mistake the switcher for a real auth control.
2. Gating is defense-in-depth: route-layer redirect AND lib-layer `requireAdmin`. Trusting only the UI hide (display:none on the button) is a defect — a future refactor or a direct call from another component would bypass it.
3. The agent layout redirect must use the active actor (from the switcher), not the underlying user's role. When the supervisor switches to "view as agent", the active actor is the agent — `/queue` must not redirect them away.
4. Every Agent-shell query takes the active agent id as a parameter and filters by it. A query that quietly returns "all agents' claimed items" because the filter was omitted is the exact row-scope leak D16 forbids — write a unit test that asserts cross-agent isolation.

### Definition of Done

Code complete when:
- [ ] Admin and Agent shells render with the right sidebars; role switcher works and persists across navigations.
- [ ] Route gates redirect cross-shell visits (admin route → `/queue` for agents; agent route → `/operations` for admins).
- [ ] All admin-only actions are hidden in the Agent shell AND throw on direct call with a non-admin actor.
- [ ] My Queue is row-scoped to the active agent id.
- [ ] Profile placeholder lets a tester toggle availability for the P2-3 gate.
- [ ] No console errors. WCAG AA on sidebar and switcher.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/roles`, pushed, merged to main.

### Expected output

The app now has two distinct shells with a working role switcher. The supervisor lands on Operations and sees the global admin nav and all admin actions. Switching to an agent re-renders into the Agent shell with My Queue, scoped to that agent. Cross-shell route visits redirect cleanly; admin-only actions are gated at both UI and lib layers. P2-6 can drop its three Admin views and two Agent views into the existing nav slots.

### Dependencies to install

```
(none — all UI + tiny in-memory auth shim; reuse Next.js, Tailwind, and the P0/P1 toolchain)
```
