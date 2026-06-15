# P2-6 — All Applications, Analytics, Team

Fill in the three Admin views: All Applications (the full searchable/filterable record), Analytics (the division dashboard), and Team (per-member performance with specialization assignment). Also fill in the two Agent placeholders from P2-5: My Stats (the per-agent slice of Analytics) and Profile (identity + availability + specialization read-only).

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @mockup.md, and @TICKETS.md.

I'm working on TICKET-P2-6: All Applications, Analytics, Team.

Current state: (at start)
- [list what is DONE so far, with ✅, including P2-1..P2-5 — My Queue, Operations, router with specialization + admin-only setSpecialization, two role shells with the role switcher, and the P2-5 placeholders for All Applications / Analytics / Team / My Stats / Profile.]

What's NOT done yet:
- [P2-6] All Applications, Analytics, Team, My Stats, and Profile are placeholder pages. They need real content over the fixtures.

TICKET-P2-6 Goal:
Build the remaining Admin views over the fixtures, plus the per-agent slice of Analytics (My Stats) and the full Profile screen. All Applications is a searchable/filterable table over every application (today's queue plus history). Analytics is the division dashboard: KPI cards, volume trend, triage donut (AI lanes), top mismatch reasons, throughput by agent. Team is the per-member table with the specialization assignment editor (already wired in P2-4; wrap it in the full Team table here). My Stats is the same metric reads filtered to the active agent. Profile shows identity, team, specialization (read-only — admins set it), and the availability control (already present from P2-5; keep it).

Check the P2-5 placeholders before starting; replace them, don't recreate.
Follow @mockup.md (All Applications, Analytics, Team, My Stats, Profile) and @schema.md (metric_rollup as the analytics source-of-truth; in the prototype it is computed on the fly from the fixtures).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the P2-5 placeholder files and the active-agent / role-switcher seams.)_

### TICKET-P2-6 Scope

- Phase: Phase 2 — Queue, Routing, and Roles
- Time budget: 4h
- Dependencies: P2-5 (role-based shells + placeholder routes)
- Branch: `feat/admin-views`

### Acceptance criteria

- [ ] All Applications page renders a searchable, filterable table of every application (mockup.md All Applications):
  - Free-text search across brand and `ttb_id`.
  - Status filter: `approved`, `needs_correction`, `rejected`, `in_queue` (matches schema.md `application.status`).
  - Date range filter: today, this week, this month, all time.
  - Assigned-agent filter (multi-select).
  - Columns: application + TTB ID, beverage type, applicant, assigned agent, status, received date.
- [ ] Analytics page renders the division dashboard (mockup.md Analytics):
  - Week/month toggle that drives the whole view.
  - KPI cards: applications processed, match rate, combined mismatch+review rate, average handling time + estimated hours saved.
  - Volume trend (processed applications over the last 8 weeks).
  - Triage-breakdown donut over the AI lanes (match / mismatch / review), distinct from agent dispositions.
  - Top-mismatch-reasons chart (share by failing field: alcohol_content, government_warning, net_contents, brand, producer, origin).
  - Throughput by agent.
- [ ] Team page renders a per-member table (mockup.md Team):
  - Columns: name, completed this week, completed this month, match/mismatch/review split as a rate bar, average handling time, specialization (multi-select edit), availability pill.
  - Specialization editor (already exists from P2-4) is wired here as the primary surface; the inline editor on Operations remains available.
- [ ] My Stats page renders the same metric reads as Analytics but filtered to the active agent id (mockup.md My Stats):
  - KPI cards: completed this week and this month, match rate, average handling time.
  - Outcome split as a rate bar against the division average.
  - List of recent decisions.
- [ ] Profile page shows identity, team, specialization (read-only display — only admin can change it in Team), and the existing availability toggle (mockup.md Profile; CONTEXT.md Availability).
- [ ] All numbers come from the fixture-backed metric selectors (the production source is `metric_rollup`; schema.md). The prototype computes them on the fly; the selectors expose the same shape as the production rollup.
- [ ] Agent-shell pages (My Stats, Profile) are row-scoped to the active agent (FR-29; D16).
- [ ] Status conveyed by colour + icon + text on every lane / status / availability pill (NFR-2; AC-9).

### Implementation details

1. Build `lib/analytics/metrics.ts`: pure selectors over the fixture store that mirror schema.md `metric_rollup`. Functions:
   - `divisionKpis(range)`, `agentKpis(agentId, range)`.
   - `volumeTrend(weeks)` returns 8 buckets.
   - `triageBreakdown(range)` returns `{ match, mismatch, review }` counts.
   - `topMismatchReasons(range)` returns counts grouped by `field_result.field_name` where `verdict === 'mismatch'`.
   - `throughputByAgent(range)` returns `{ agentId, processed }[]`.
   - `recentDecisions(agentId, limit)` returns the agent's most recent disposition rows.
2. Build `app/(admin)/applications/page.tsx`:
   - `components/applications/ApplicationsTable.tsx` — virtualized or paginated table.
   - `components/applications/ApplicationsFilters.tsx` — search input, status multi-select, date-range select, agent multi-select.
   - `lib/applications/filter.ts` — pure filter selector over the fixture store.
3. Build `app/(admin)/analytics/page.tsx`:
   - `components/analytics/RangeToggle.tsx` — week / month.
   - `components/analytics/KpiCards.tsx`.
   - `components/analytics/VolumeTrend.tsx` — simple bar / sparkline (no chart lib required; raw SVG or a small CSS grid is fine — keep it accessible).
   - `components/analytics/TriageDonut.tsx` — donut over the AI lanes; include a numeric legend so colour is not load-bearing.
   - `components/analytics/TopMismatchReasons.tsx` — horizontal bars per failing field.
   - `components/analytics/ThroughputByAgent.tsx` — bar chart.
4. Build `app/(admin)/team/page.tsx`:
   - `components/team/TeamTable.tsx` — rows per agent with the metrics from `lib/analytics/metrics.ts` filtered per agent.
   - Reuse the `SpecializationEditor` from P2-4 as the Specialization column's inline editor.
5. Build `app/(agent)/stats/page.tsx`:
   - Reuse `KpiCards`, `TriageDonut`, and a recent-decisions list, all filtered to `getActiveAgent()`.
6. Build `app/(agent)/profile/page.tsx`:
   - Identity (name, email), team, specialization (read-only display), availability toggle (already from P2-5 — keep its behaviour).
7. Wire status pills consistently (reuse the lane-pill component from P2-1 / P2-2).
8. Estimated hours saved on the KPI card is derived from `processed * (avg_manual_handling_seconds - avg_handling_seconds) / 3600`; use a documented constant for `avg_manual_handling_seconds` so the math is auditable.

### Key constraints

1. AI lanes vs. agent dispositions are distinct (mockup.md Analytics; CONTEXT.md Lane vs Disposition). The triage donut shows the lanes (match / mismatch / review); a separate disposition breakdown shows approve / return-for-correction / auto-reject. Do not collapse them.
2. Specialization is admin-set in the Team view (CONTEXT.md Specialization; D15). Profile displays it read-only.
3. Row-scoping: My Stats and Profile read `getActiveAgent()`. A leak (showing another agent's numbers) is the exact D16 row-scope violation.
4. The Status filter values match schema.md `application.status` (`received`, `assigned`, `in_queue`, `needs_correction`, `approved`, `rejected`). The mockup uses friendlier labels but the underlying values are the schema values.
5. TypeScript strict, no `any`.
6. WCAG AA — every chart needs a numeric legend or table fallback so colour is not the sole channel (NFR-2; AC-9).
7. NFR-4: nothing persisted; all numbers computed from the fixture store.

### Files to modify

Primary: `app/(admin)/applications/page.tsx`, `app/(admin)/analytics/page.tsx`, `app/(admin)/team/page.tsx`, `app/(agent)/stats/page.tsx`, `app/(agent)/profile/page.tsx` — replace P2-5 placeholders with real content.
Current contents: (at start) "coming in P2-6" placeholders from P2-5.
Action: replace with the views above; preserve the existing Profile availability toggle.

Secondary: `fixtures/samples.ts` — extend with extra historical applications + dispositions so Analytics has enough data points to look populated. Add a small constant `AVG_MANUAL_HANDLING_SECONDS` for the hours-saved calc.

### Files to create

1. `lib/analytics/metrics.ts` — division and per-agent metric selectors.
2. `lib/analytics/types.ts` — `KpiSnapshot`, `TrendBucket`, `TriageBreakdown`, `MismatchReason`, `AgentThroughput`.
3. `lib/applications/filter.ts` — All Applications filter selector.
4. `components/applications/ApplicationsTable.tsx`, `components/applications/ApplicationsFilters.tsx`.
5. `components/analytics/RangeToggle.tsx`, `KpiCards.tsx`, `VolumeTrend.tsx`, `TriageDonut.tsx`, `TopMismatchReasons.tsx`, `ThroughputByAgent.tsx`.
6. `components/team/TeamTable.tsx`.

### Config / schema / store updates

- Fixtures gain ~30 extra historical applications + dispositions to populate the 8-week volume trend and the agent throughput chart.
- `AVG_MANUAL_HANDLING_SECONDS` constant added to fixtures (a single documented number, e.g., 240).
- The selector shape mirrors schema.md `metric_rollup`; production swaps the in-memory implementation for a rollup-table read without changing the call site.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Add unit tests:
- `lib/analytics/metrics.test.ts`
  - `divisionKpis` over a fixed range returns expected counts.
  - `agentKpis` is a strict subset of `divisionKpis` and matches when summed across agents.
  - `triageBreakdown` counts the three lanes correctly.
  - `topMismatchReasons` groups by `field_name` and sorts descending.
- `lib/applications/filter.test.ts`
  - Free-text search matches brand and TTB ID (case-insensitive).
  - Status filter values match `application.status` enum exactly.
  - Date range filters by `submitted_at`.
  - Agent filter respects multi-select.

Manual:
- [ ] As supervisor, open All Applications → search "Stone", filter status = `approved`, date range = this month → table updates.
- [ ] Open Analytics → toggle week / month; all five charts update; KPI cards show numeric values; hours-saved is a believable positive number.
- [ ] Triage donut shows AI lanes (match / mismatch / review); confirm via a separate inspect that approve / return-for-correction / auto-reject (dispositions) are NOT collapsed into the same donut.
- [ ] Top mismatch reasons surfaces alcohol_content, government_warning, net_contents, brand, producer, origin from the fixture data.
- [ ] Team table shows per-member metrics; click the specialization editor → save → next Distribute on Operations reflects the change.
- [ ] Switch to an agent → My Stats shows that agent's numbers (smaller than the division totals); switch agents → numbers change.
- [ ] Profile shows identity, team, specialization (read-only), and the availability toggle works.
- [ ] Row-scope spot check: in My Stats, the recent-decisions list contains only the active agent's dispositions.
- [ ] WCAG AA spot check: every chart has a numeric legend or table view; status pills use colour + icon + text.

Eval: (not applicable in Phase 2 — UI work)

Update docs: Mark P2-6 done in TICKETS.md; add a DEV-LOG entry noting the metric-selector shape (mirrors `metric_rollup`), the production swap point, and the additional historical fixtures.

### Reference

- mockup.md — All Applications, Analytics, Team, My Stats, Profile.
- systemsdesign.md — D15 (specialization assignment in Team), D16 (row-scoped Agent queries).
- CONTEXT.md — Lane vs Disposition (kept distinct in Analytics), Specialization (admin-set in Team).
- requirements.md — FR-23 (aggregate review surface is on Operations, not here, but the data shapes are shared), FR-29 (row-scoped agent shell), NFR-2 (accessibility).
- schema.md — `application.status` enum, `field_result.field_name` + `verdict` (for top mismatch reasons), `metric_rollup` (the production source the selectors mirror).

### Common gotchas

1. All Applications is the full record: searchable + filterable by status, date range, agent, and free text (mockup.md). Analytics shows division metrics (KPI cards, volume trend, triage donut, top mismatch reasons, throughput by agent). Team shows per-member performance + the specialization editor. Three different views, three different data shapes — keep them in separate routes and separate selector files.
2. AI lanes and agent dispositions are distinct concepts (CONTEXT.md Lane vs Disposition). The triage donut is over lanes; if you fold dispositions into it, the chart misleads (an approved application that was originally a mismatch would double-count).
3. Status filter values map to `application.status` (`received`, `assigned`, `in_queue`, `needs_correction`, `approved`, `rejected` — schema.md). Friendlier labels are fine in the UI, but the filter values must match the schema strings exactly so the prototype-to-production mapping is one-to-one.
4. Row-scoping for My Stats and Profile is non-negotiable (D16; FR-29). Every selector takes the active agent id; a unit test should assert that another agent's data never appears.

### Definition of Done

Code complete when:
- [ ] All Applications, Analytics, Team, My Stats, and Profile render real content from the fixtures.
- [ ] All Applications filters all work and are composable.
- [ ] Analytics charts respond to the week / month toggle.
- [ ] Team table specialization edits are reflected by the router on the next Distribute.
- [ ] My Stats and Profile are row-scoped to the active agent.
- [ ] WCAG AA on charts (numeric legends / table fallbacks) and status pills.
- [ ] No console errors.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/admin-views`, pushed, merged to main.

### Expected output

The Admin shell is fully populated: Operations + All Applications + Analytics + Team + Knowledge-Base-placeholder. The Agent shell is fully populated: My Queue + My Stats + Profile. The supervisor can search the full record, watch division metrics, manage the team's specializations, and see throughput; the agent sees only their own scoped slice. Phase 2 exit criteria are met: both shells work, exceptions route to specialists with overflow, bulk-approve clears the match lane, the role switcher gates admin-only actions.

### Dependencies to install

```
(none — all UI + selector logic; reuse Next.js, Tailwind, and the P0/P1 toolchain. Charts are hand-rolled SVG / CSS for accessibility and zero-dep simplicity.)
```

---

## Outcome — done 2026-06-15 — Phase 2 complete

**Branch:** `feat/admin-views`
**Status:** Done. Phase 2 closes here.
**Workflow:** Fourth parallel-agent build. Agent A: data layer + analytics selectors + 6 chart components + Analytics page. Agent B: Applications filter + UI, Team table, My Stats, Profile.

**What landed:**
- Data: `ApplicationStatus` enum, `DispositionedApplication`, `state.dispositionedApplications`, `recordDisposition` refactor to APPEND, `AVG_MANUAL_HANDLING_SECONDS = 240`, 25 historical seed rows over 8 weeks.
- `lib/analytics/{types,metrics}.ts` — 7 selectors (division + agent variants), 20 tests.
- `components/analytics/{RangeToggle,KpiCards,VolumeTrend,TriageDonut,TopMismatchReasons,ThroughputByAgent}.tsx` — hand-rolled charts with numeric legends.
- `app/(admin)/analytics/page.tsx` — division dashboard.
- `lib/applications/filter.ts` + 14 tests.
- `components/applications/{ApplicationsFilters,ApplicationsTable}.tsx`.
- `app/(admin)/applications/page.tsx` — searchable + filterable record.
- `components/team/TeamTable.tsx` — per-member metrics + inline SpecializationEditor + Availability toggle.
- `app/(admin)/team/page.tsx`.
- `app/(agent)/stats/page.tsx` — agent slice (KpiCards with hoursSavedHidden, agent-scoped TriageDonut, recent decisions).
- `app/(agent)/profile/page.tsx` — identity card + read-only specialization chips + preserved availability toggle.

**Tests:** 30 files, 274 pass + 1 skipped (+35 new). Lint + build clean.

**Deviations:**
- Mockup's "applicant" column on All Applications omitted (PII; fixture doesn't carry it).
- `recordDisposition` APPENDS + removes (dual list, not a single status-discriminated list) — cleaner perf + correctness profile.
- Hours saved hidden on My Stats (meaningless per agent; would mislead).
- 25 historical rows include one cast for `extractedValue: null` on a `not_found` field.
- Auto-rejected rows are pre-seeded with `status: "rejected"` directly; the disposition path doesn't produce that status (FR-27's 30-day auto-reject will, in production).

### Why

P2-6 closes Phase 2: the queue + routing + shells now have the analytics + record surfaces the supervisor and per-agent views need.

The **dual-list data layer** (active `applications` + historical `dispositionedApplications`) enforces "the live queue is fast; the history grows monotonically". Mixing them with a `status` discriminator would mean every queue read filters by status — a quiet performance and correctness gotcha as history grows.

The **selectors mirror schema.md `metric_rollup`** so the prototype-to-production swap is one-for-one. P6-2's persistence work plugs into the same call sites without touching the UI.

The **agent-scoped variants on `triageBreakdown` and `topMismatchReasons`** are row-scope discipline in the function signature. Same function, scoped by parameter — not two parallel functions that could drift.

The **`hoursSavedHidden` prop** on KpiCards is honest: hours saved is meaningful at division level (the agency's ROI signal) but meaningless per agent. Hiding it on the per-agent view avoids the misread.

The **TeamTable reuses `SpecializationEditor`** from `components/operations/` verbatim — same no-duplication discipline as P1-7's FieldTable reuse on the Operations bottom-quartile expansion.

The **per-row Availability toggle** on TeamTable lets the supervisor flip an agent OOO. Structural complement to P2-5's self-edit rule on Profile: admins flip anyone's; agents flip their own. `setAvailability`'s allow-rule (admin OR self) makes both surfaces work without separate gates.

The **25 historical rows** are the data density Analytics needs. 9 active apps don't fill a volume-trend chart or a top-mismatch-reasons bar; the historical rows give the charts visible data without losing the hand-curated quality.

The **WCAG AA discipline on charts** — numeric legend or table caption beside every visual — is the same color+icon+text rule applied to data viz. AC-9 holds across the new analytics surface.
