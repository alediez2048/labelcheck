# P5-6 — Design alignment with the mockup

Bring the running app's visual design into exact alignment with `docs/03-ui/mockup.html` — the same colors, type, spacing, components, and chrome. The behaviour and contracts shipped through Phases 1–5 stay; only the surface changes. The mockup is the binding reference for "what the app looks like."

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @requirements.md, @flowchart.md, @TICKETS.md, and @docs/03-ui/mockup.md.
Open @docs/03-ui/mockup.html in a browser — it is the binding visual reference.

I'm working on TICKET-P5-6: Design alignment with the mockup.

Current state: (at start)
- [list what is DONE so far, with checks: every screen exists and is wired to real state through Phases 1–5; the role-based shells route correctly; the lane language is in place but styled inconsistently with the mockup; the Tailwind config still carries the defaults rather than the mockup's tokens]

What's NOT done yet:
- [list with crosses what this ticket still needs: a tokens layer mapped to the mockup; the sidebar matched pixel-close (236px, brand block, grouped nav with counts); the topbar matched (sticky, 64px min, h1 + lede); the panel/card pattern (radius 14, shadow, line); the funnel strip on Operations; the queue rows + lane pills; the review-detail two-column layout; the assistant FAB + chat dock; the accessibility constraints (color + icon + text) preserved everywhere]

TICKET-P5-6 Goal:
Make the running app match the mockup. Same tokens, same component shapes, same chrome. No business-logic changes. Reviewers comparing the mockup PDF to the deployed app should see one app, not two designs.

Check the mockup HTML's CSS variables, the screen-by-screen sections in mockup.md, the existing Tailwind config, the components under components/**, and the role-shell layouts under app/(admin)/** and app/(agent)/** before starting. Don't change the API contracts, the store shapes, or the routing — only the markup, the Tailwind classes, the tokens, and any small structural reshuffles (panel wrappers, card grids) needed to match the visual language.
Follow @docs/03-ui/mockup.md (which screens map to which) and the binding parts called out at the bottom of that file: the one-queue model, the lane language (color + icon + text), the auto-advancing review, the accessibility rules.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-2, AC-9, FR-13, FR-14, FR-15, FR-21, FR-22, FR-24).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste real branch state. Most likely P5-5 — the CI eval gate landed; `pnpm eval --gate` is green on a clean main; `pnpm lint`, `pnpm build`, `pnpm test` all pass with 453 tests.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-6 Scope

- Phase: Phase 5 — Evals, observability, and design close-out
- Time budget: 5h
- Dependencies: P2-6 (the full Admin shell), P1-8 (the review UI), P4-3 (the assistant guardrails — the chat dock chrome)
- Branch: feat/design-alignment

### Acceptance criteria

- [ ] **Design tokens** mirror the mockup's CSS variables exactly: `--bg #f1f5f9`, `--surface #fff`, `--ink #0f172a`, `--muted #64748b`, `--line #e2e8f0`, `--brand #2563eb` (+ `brand-ink #1e40af`, `brand-soft #eff6ff`), and the three lane triples (`match #15803d` / `mismatch #b91c1c` / `review #b45309` with `-soft` and `-line` companions). Surface them through Tailwind's `theme.extend.colors` so they read as semantic tokens in JSX (`bg-surface`, `text-ink`, `border-line`, `text-match`, etc.), not as hex values scattered across components.
- [ ] **Type** matches the mockup: `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`; base 16px / 1.5 line-height; topbar `h1` is 18px; section headings 14px uppercase muted where the mockup uses them.
- [ ] **Radius and shadow** match: `--radius 14px` for panels; the mockup's `--shadow` (`0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06)`) lifted into a Tailwind utility (`shadow-panel`).
- [ ] **Sidebar** matches: 236px fixed width; sticky to viewport; brand block at top (38px gradient logo + "LabelCheck" wordmark + small subtitle); grouped nav with uppercase group labels; nav buttons 44px min-height, 15px font, count chip on the right for items with a numeric badge; active state uses `brand-soft` background and `brand-ink` text; an `agent` block at the bottom with a 34px avatar and the role switcher.
- [ ] **Topbar** matches: sticky, ≥64px tall; `h1` (18px) + optional `.lede` (13px muted) on the left; primary action / role switcher on the right.
- [ ] **Panel/card pattern** matches: `bg-surface border border-line rounded-[14px] shadow-panel`; headers are 14px with optional muted right-aligned meta; the `Funnel`, `Queue`, `Review Detail`, `Analytics`, `Team`, `Knowledge Base` screens all use this primitive.
- [ ] **Lane visual language** stays color + icon + text everywhere (NFR-2, AC-9). The pill shape in the mockup (`pill.match`, `pill.mismatch`, `pill.review`) becomes a reusable `<LanePill>` (`LanePill` from P5-3's components is the seed — port the styling, keep the API). Mismatched rows tint AND bold the differing value (FR-15).
- [ ] **Operations** matches the funnel-strip pattern: four stages across (received → auto-verified → ready to approve → needs review), each as a `fstage` card with a 11px uppercase label, a 30px bold number, and a 12px muted sub-line; the "ready" stage uses match-green for the number, the "needs review" stage splits into mismatch/review sub-counts. Below the funnel, the two-panel layout (shared approval pool + review distribution board) and the live-intake feed.
- [ ] **My Queue / Queue rows** match: each row shows the brand (left), the one-line plain-language issue (middle), and the lane pill (right). 46–54px tall (FR-22). Click opens the review detail.
- [ ] **Review detail** matches the two-column layout described in mockup.md (label faces + form on the left, application-vs-label comparison on the right). Lane banner across the top in plain language. Two decision buttons: "Return for correction" + "Approve". Auto-advance to next reviewing item after a decision (FR-21, "Reviewing N of M" indicator).
- [ ] **Analytics, Team, All Applications, Knowledge Base, My Stats, Profile, Disagreement queue** are restyled to match the mockup's panel patterns and KPI-card primitives. Existing data wiring stays.
- [ ] **Assistant** chrome matches: floating action button at bottom-right (58px circular, brand background, soft shadow); opened chat dock with brand-colored header strip, quick-reply chips on first open, "explains and summarizes only" footer line under the input (P4-3 guardrails copy stays).
- [ ] **Three role shells** keep their respective nav lists. Admin: Operations, All Applications, Analytics, Team, Disagreement queue, Knowledge Base. Agent: My Queue, My Stats, Profile.
- [ ] **Accessibility preserved**: target sizes ≥44px (already required by NFR-2; verify post-restyle); color contrast on the three lane palettes verified against the mockup's choices (the soft/ink pairings are AA-compliant in the mockup — preserve them); status never carried by color alone (text label + icon glyph on every pill).
- [ ] **No visual regressions on existing flows**: a clean intake → triage → disposition → corpus-write path works exactly as before; the disagreement-queue Confirm/Reject buttons work; the assistant returns its guardrailed answers.
- [ ] **`pnpm lint`, `pnpm build`, `pnpm test` clean**; `pnpm eval --gate` still passes (the design pass cannot regress the headline metric — that would mean the matching logic was touched, which is out of scope).

### Implementation details

- **Tokens first.** `tailwind.config.ts` gains `theme.extend.colors.{surface,ink,muted,line,brand,brand-ink,brand-soft,match,match-soft,match-line,mismatch,mismatch-soft,mismatch-line,review,review-soft,review-line}` and `theme.extend.boxShadow.panel`. `app/globals.css` sets the body font-family and base 16px line-height. Replace ad-hoc hex strings in components with semantic class names.
- **Component primitives.** Create or consolidate: `components/ui/Panel.tsx` (the rounded-14 + line + shadow card), `components/ui/Button.tsx` (the mockup's `.btn`, `.btn.primary`, `.btn.good`, `.btn.danger`, `.btn.lg`, `.btn.ghost`, `.btn.sm` variants), `components/ui/LanePill.tsx` (port P5-3's existing component — keep API, refresh styling), `components/ui/KpiCard.tsx`. Re-use these everywhere; do not let raw `border border-gray-200` reappear.
- **Shell.** Refactor `components/shell/{AdminShell,AgentShell}.tsx` to match the mockup's sidebar dimensions, group labels, count chips, and bottom `agent` block. Topbar becomes a thin reusable `<TopBar title="…" lede="…" actions={…} />`.
- **Operations funnel.** Add `components/operations/IntakeFunnel.tsx` — four `<FunnelStage>` cards in a flex row. Wire the stage counts to the existing operations state (the data is already there from P2-2).
- **Queue rows.** `components/queue/QueueRow.tsx` matches the mockup's 46–54px row spec. Lane pill on the right.
- **Review detail.** `app/(agent)/queue/[applicationId]/page.tsx` (and the admin equivalent if it exists separately) — restructure to the two-column layout. The auto-advance behaviour from P1-8 stays; the chrome is updated.
- **Assistant.** `components/assistant/AssistantDock.tsx` — restyle FAB + dock + chat-message shapes. Quick-reply chips on initial open. Guardrail footer line stays.
- **Sample data.** The nine sample applications in the mockup map one-to-one onto the golden set (mockup.md "Sample Application Set"). No data changes needed; verify the brand strings and beverage types line up so the visual demo reads correctly.
- **Visual regression check.** Take screenshots of: Operations, My Queue, Review detail (one mismatch case), Analytics, Disagreement queue. Cross-reference against the mockup's rendered HTML side-by-side. The deliverable is one app, not two designs.

### Key constraints

1. **Behaviour is frozen.** No matching-logic changes, no API contract changes, no store shape changes, no routing changes. The eval gate (P5-5) catches any accidental regression in the matching logic — the build will fail if you touch it.
2. **Color + icon + text everywhere** (NFR-2, AC-9). The mockup's soft/ink/line palette pairings are AA-compliant; preserve them. No status conveyed by color alone, ever.
3. **Target sizes ≥44px** (NFR-2). The mockup spec is 46–54px for buttons and rows — keep it.
4. **Tokens, not hex.** The whole point of the design pass is that the next change touches one Tailwind config, not fifty components. Semantic tokens win every time. A future contributor renaming the lane palette should edit `tailwind.config.ts` only.
5. **Mockup is binding for visuals, not for sample data.** The screens use real state from the existing stores. The mockup's counts (600 received, 420 ready, 180 needing review) are illustrative; the real funnel reflects whatever's in the operations state.

### Files to modify

- `tailwind.config.ts` — extend the theme with the token map.
- `app/globals.css` — body font, base 16px / 1.5.
- `components/shell/AdminShell.tsx`, `components/shell/AgentShell.tsx` — sidebar + topbar restructure.
- `app/(admin)/operations/page.tsx` — funnel + panel layout.
- `app/(admin)/all-applications/page.tsx`, `analytics/page.tsx`, `team/page.tsx`, `knowledge-base/page.tsx`, `disagreement-queue/page.tsx` — apply panel + KPI-card primitives.
- `app/(agent)/queue/page.tsx`, `queue/[applicationId]/page.tsx`, `stats/page.tsx`, `profile/page.tsx` — same.
- `components/assistant/AssistantDock.tsx` (or current equivalent) — FAB + dock restyle.
- `components/queue/QueueRow.tsx` — row spec.
- `components/feedback/LanePill.tsx` — restyle, keep API; or fold into `components/ui/LanePill.tsx` and re-export.

### Files to create

- `components/ui/Panel.tsx`, `components/ui/Button.tsx`, `components/ui/KpiCard.tsx`, `components/ui/TopBar.tsx`, `components/ui/FunnelStage.tsx`.
- `tests/ui/design-tokens.test.ts` — a small Vitest that asserts the Tailwind config exposes the expected tokens (so a future refactor that drops one breaks loudly).

### Config / schema / store updates

- None. This ticket is presentation-layer.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm eval --gate     # must still pass — no matching-logic regression
```

Manual:
- [ ] Open `docs/03-ui/mockup.html` and the running app side-by-side; click through each Admin screen and each Agent screen; confirm a visual match within reason (color, type, spacing, component shape, chrome).
- [ ] Run the golden-set flow: clean match → bulk approve; mismatch → review detail → return-for-correction; unreadable → review lane; confirm lane pills, lane banners, and the auto-advancing review render correctly.
- [ ] Open the Disagreement queue (P5-3) — confirm the agreement widget and the disagreement rows pick up the new tokens cleanly.
- [ ] Open the Assistant — confirm the FAB + dock + chat bubbles + guardrail footer match the mockup.
- [ ] Resize the browser; verify the sidebar collapses gracefully (or stays sticky), large buttons stay large, and the funnel strip wraps without breaking.

Update docs: mark P5-6 done in TICKETS.md; add a DEV-LOG entry with before/after notes; if any binding deviation from the mockup was made deliberately (e.g. the mockup's count chip color vs. the running app's), note it in mockup.md so the doc stays the source of truth.

### Reference

- `docs/03-ui/mockup.html` — binding visual reference (CSS variables, component classes).
- `docs/03-ui/mockup.md` — screen-by-screen narrative; the "Visual System" section names the design principles.
- @requirements.md — NFR-2 (color + icon + text; large targets), AC-9 (status pills); FR-13/14/15/21/22/24 (lane language, per-field breakdown, queue row, review flow).
- @CONTEXT.md — domain vocabulary (no UI invents new lane names).

### Common gotchas

1. **Don't ship Tailwind hex literals.** Every color that appears more than once becomes a token. The mockup spent its budget on naming things (`--brand`, `--brand-ink`, `--brand-soft`); the running app should mirror that.
2. **Don't drop the icon when you keep the color.** Status pills must carry icon + text, not color alone. A pretty redesign that loses the text label fails AC-9.
3. **Don't move things around the page for prettiness.** The mockup's information architecture is load-bearing — funnel-then-pools-then-feed on Operations, two-column review detail, etc. Moving boxes around will break the visual demo against the mockup file.
4. **Don't regress the eval gate.** If a styling refactor accidentally breaks the matching logic (e.g. a component restructure changes a state shape), the CI gate will fail. That's correct behaviour — the gate exists to catch exactly this.

### Definition of Done

Code complete when:
- [ ] Tokens land in `tailwind.config.ts` and `app/globals.css`.
- [ ] Every screen listed above visually matches the mockup within reason.
- [ ] Components reuse the new UI primitives (`Panel`, `Button`, `LanePill`, `KpiCard`, `TopBar`, `FunnelStage`); ad-hoc card markup is removed.
- [ ] Accessibility constraints preserved (color + icon + text; ≥44px targets).
- [ ] No console errors; no test failures; eval gate green.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm eval --gate` pass.
- [ ] Manual side-by-side review against `mockup.html` done; any deliberate deviation documented in `mockup.md`.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/design-alignment`, pushed, merged to main.

### Expected output

A reviewer opening the deployed app and `docs/03-ui/mockup.html` side-by-side sees one app. The tokens are semantic, the components are reusable, the lane language is consistent, and the accessibility guarantees from Phase 1 are intact. The Phase 5 close-out demo is now visually as honest as the architecture story underneath it.

### Dependencies to install

```
(none — Tailwind + React are already in place)
```

### Why

Reviewers form their first impression of LabelCheck visually. Phases 1–5 built a real working pipeline — tracing, evals, a feedback loop, a bake-off harness, a CI gate — but if the surface looks like an unstyled Tailwind starter while the binding mockup shows a polished worklist, the work doesn't land. The mockup is also the only piece of documentation that says "this is a worklist, not a dashboard of separate tools" — the one-queue model that anchors the whole UX argument. Aligning the running app to it makes the architecture story (clean seams, swappable adapters, gated evals) read together with the UX story (one obvious path, one queue, two moves), instead of as two disconnected artifacts. The design pass is intentionally a presentation-layer ticket: behaviour is frozen, the eval gate catches any accidental regression, and tokens replace ad-hoc styling so the next change touches one config file instead of fifty components.
