# P5-3 — Agent-correction feedback loop

Capture every disposition that overrides the tool's lane as a labeled ground-truth example, track tool-vs-agent agreement as a live accuracy proxy, and surface disagreements into a review queue so a growing domain-specific corpus accumulates without anyone having to label data on purpose.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P5-3: Agent-correction feedback loop.

Current state: (at start)
- [list what is DONE so far, with checks, including the P1-8 review UI and dispositions, the P2-1 My Queue, the P5-1 tracing seam (which carries the predicted lane on the verification span), and the P5-2 eval harness]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: the override-capture pipeline, the tool-vs-agent agreement metric, the disagreement review queue, the model bake-off (P5-4), and the CI eval gate (P5-5)]

TICKET-P5-3 Goal:
Wire the disposition flow so every disposition that overrides the tool's lane is recorded as a labeled example — the agent's call IS ground truth, produced by an expert in the normal course of work. From that signal compute three things: a tool-vs-agent agreement rate as the live accuracy proxy, an accumulating real-world eval set that complements the synthetic golden set, and a sampled disagreement queue for the team to confirm (because disagreements catch agent error too, not just tool error). This is the killer asset observability.md highlights: free, continuous, expert-labeled ground truth.

Check the P1-8 disposition handler, the P2-1 queue, and the P5-1 verification span schema before starting. Don't overwrite existing code; extend the disposition path.
Follow @observability.md (The agent-correction feedback loop — the killer signal) and @systemsdesign.md (D15 router, D16 roles).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-11).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output. Most likely P5-2 — the eval harness and its metric library.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-3 Scope

- Phase: Phase 5 — Evals and observability
- Time budget: 3h
- Dependencies: P2-1 (My Queue and the disposition flow), P5-1 (verification span carries the predicted lane)
- Branch: feat/feedback-loop

### Acceptance criteria

- [ ] Every disposition is recorded with the tool's predicted lane, the agent's effective lane (derived from the disposition and the structured reason summary), the per-field verdicts the tool produced, and a stable application id (observability.md: The agent-correction feedback loop).
- [ ] An override is detected and tagged: tool said `match`, agent returned for correction (override → flag); tool said `mismatch` or `review`, agent approved (override → clear). Tagging is in code, deterministic, and testable (D4 model reads / code decides — same discipline here).
- [ ] Tool-vs-agent agreement rate computed and exposed: a rolling metric over the last N dispositions, plus an all-time number. Surfaced in the Operations view (admin) and in `eval-reports/feedback-loop.json` (observability.md: Tool-versus-agent agreement rate).
- [ ] Overrides accumulate into a labeled corpus at `eval-data/agent-corrections/{date}.jsonl`. Each line: application id (hashed), beverage type, the per-field verdicts the tool produced, the per-field "actual" derived from the agent's structured return reason (FR-26a), the agent's effective lane, the timestamp, the prompt and model version recorded on the span. This is the growing domain-specific labeled dataset (observability.md: builds, over time, a domain-specific labeled corpus).
- [ ] A disagreement review queue surfaces a sample of overrides into the admin view for the team to confirm — the same disagreement can catch agent error, not just tool error (observability.md: Disagreements are sampled into a review queue).
- [ ] The accumulated corrections corpus is loadable by the P5-2 eval harness as an alternate dataset: `pnpm eval --dataset=corrections` runs the same metrics over the real-world examples (observability.md: scheduled eval runs over the golden sets and the accumulated real-world examples).
- [ ] No raw applicant PII in the corpus — applicant name, address, and free-text agent notes are hashed using the same `lib/observability/redact.ts` from P5-1.

### Implementation details

- Extend the disposition handler (from P1-8) so that on every disposition write, a `recordDispositionForFeedbackLoop(...)` call fires. Implementation lives at `lib/feedback/recorder.ts`. Input: the verification result (from the span/result store) and the disposition (Approve | Return for correction with structured reason summary).
- Derive the agent's effective lane in `lib/feedback/effectiveLane.ts`:
  - Approve → `match` (the agent says it is fine).
  - Return for correction → `mismatch` if the structured reason summary cites any per-field failure; `review` if the reason is unreadable image (FR-26b).
- Detect the override in `lib/feedback/override.ts`:
  - `predicted_lane != effective_lane` → override (a flag or a clear).
  - Same-lane → agreement (still recorded; needed for the rate).
- Compute and persist the agreement rate at `lib/feedback/agreement.ts`:
  - Rolling window of 100 (configurable) most recent dispositions.
  - All-time count and rate.
  - Per-beverage-type breakdown (so a specialization-specific weak spot surfaces — ties to FR-28 routing).
- Append the override record to `eval-data/agent-corrections/{ISO date}.jsonl`. JSONL because it is append-only-friendly and the eval harness streams it.
- Wire the disagreement review queue:
  - A new admin view tab "Disagreement queue" or extend Operations to surface a sample. Sample size: 10% of overrides per day, capped at 25, randomly selected. The team confirms whether the agent or the tool was right.
  - Each row: predicted lane, agent's effective lane, per-field tool verdicts vs. structured return reason, and a Confirm/Reject control. The confirmation is itself recorded (so future bake-offs know which side of the override was the actual ground truth).
- Extend `scripts/eval.ts` (from P5-2) with a `--dataset` flag: `golden` (default) or `corrections` (the accumulated agent-corrections JSONL files). The same metric functions apply.

### Key constraints

1. The agent's disposition IS ground truth — that is the entire premise. Capture it lossless, with the original tool prediction alongside, so a future training run can use the pair directly (observability.md: a labeled example produced by an expert in the normal course of work).
2. Override detection is in code, not in the model — same D4 discipline. Effective lane derivation is a pure function over the disposition record and the structured reason summary (FR-26a).
3. Disagreements catch agent error too (observability.md). The review queue is bidirectional — sometimes the tool was right and the agent was wrong; the queue is how that gets surfaced and corrected.
4. The corpus is the seed for a future fine-tuned or in-boundary model (observability.md: it builds, over time, a domain-specific labeled corpus that could support a future fine-tuned or in-boundary model). Schema choices here matter downstream.
5. NFR-4 in the prototype — the corpus is non-PII (hashed application id, no applicant text in the clear). In production this moves into the governed datastore with audit (P6-2).
6. NFR-11 — this loop is named in the observability framework as the live accuracy proxy and is the highest-signal feedback the product produces.

### Files to modify

- The disposition handler (at start — paste real content from P1-8 / the result API) — add the `recordDispositionForFeedbackLoop(...)` call. Wrap in a try/catch so a feedback-loop failure never blocks the disposition write.
- `scripts/eval.ts` (at start — paste real content from P5-2) — add the `--dataset` flag.
- The admin Operations view (at start — paste real content from P2-2) — add the agreement rate widget and the disagreement queue tab. Admin-only (FR-29; D16).

### Files to create

1. `lib/feedback/recorder.ts` — the disposition-recording entrypoint.
2. `lib/feedback/effectiveLane.ts` — derive the agent's effective lane from disposition + structured reason summary.
3. `lib/feedback/override.ts` — detect override (flag/clear/agreement).
4. `lib/feedback/agreement.ts` — rolling and all-time agreement rate, with per-beverage-type breakdown.
5. `lib/feedback/corpus.ts` — append a record to `eval-data/agent-corrections/{date}.jsonl`; load JSONL streams for the eval harness.
6. `lib/feedback/sampler.ts` — sample 10% of daily overrides for the disagreement review queue.
7. `app/admin/disagreement-queue/page.tsx` (or equivalent) — the review-queue UI with Confirm/Reject controls.
8. `tests/feedback/effectiveLane.test.ts` — unit tests covering Approve, Return for correction (per-field reason), Return — unreadable image.
9. `tests/feedback/override.test.ts` — unit tests for flag, clear, and agreement cases.
10. `tests/feedback/agreement.test.ts` — unit tests for rolling window math.
11. `eval-data/agent-corrections/.gitkeep` — the corpus directory.

### Config / schema / store updates

- New env vars: `FEEDBACK_AGREEMENT_WINDOW` (default 100), `FEEDBACK_SAMPLER_RATIO` (default 0.10), `FEEDBACK_SAMPLER_CAP_PER_DAY` (default 25).
- Add `eval-data/agent-corrections/*.jsonl` to `.gitignore` (real captured signal is not committed source; the corpus moves to the governed datastore in P6-2).
- Document the JSONL record schema in `lib/feedback/corpus.ts`.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Manual:
- [ ] Run a verification, accept the tool's `match` lane, Approve; confirm the JSONL gets one agreement record and the agreement rate ticks up.
- [ ] Run a verification, the tool says `match`, Return for correction with a structured reason citing ABV mismatch; confirm the override is recorded as a `flag` and the effective lane becomes `mismatch`.
- [ ] Run a verification, the tool says `mismatch`, Approve; confirm the override is recorded as a `clear` and the effective lane becomes `match`.
- [ ] Open the disagreement queue as admin; confirm sampled overrides appear and Confirm/Reject controls update the record.
- [ ] Run `pnpm eval --dataset=corrections` after a handful of recorded overrides; confirm the harness runs over the corpus and emits the same metrics report shape.
- [ ] Confirm no applicant text appears unredacted in any JSONL line.

Eval: this ticket extends the eval system from P5-2 with a second dataset. The corrections corpus is the real-world counterpart to the synthesized golden set; the same metrics apply.

Update docs: mark P5-3 done in TICKETS.md; add a DEV-LOG entry; add a note in observability.md describing the JSONL schema and the `--dataset=corrections` invocation.

### Reference

- @observability.md — The agent-correction feedback loop (the killer signal), Tool-versus-agent agreement rate, Disagreements are sampled into a review queue, Capture / Measure / Gate / Alert / Improve cycle.
- @requirements.md — FR-26 (disposition, atomic, whole-application), FR-26a (structured reason summary), FR-26b (unreadable-image recommendation), NFR-11 (observability and evals).
- @systemsdesign.md — D15 (router — agreement breakdown per specialization ties here), D16 (roles — disagreement queue is admin-only).
- @CONTEXT.md — Disposition, Ground truth (implicit), Override.

### Common gotchas

1. **Every disposition that overrides the tool's lane is labeled GROUND TRUTH.** That is the premise observability.md leads with. Track tool-vs-agent agreement as the live accuracy proxy; sample disagreements into a review queue (which also catches agent error, not just tool error). Over time the corpus grows into a domain-specific labeled dataset that supports a future fine-tuned or in-boundary model.
2. **The disposition write must not be blocked by the feedback recorder.** Wrap the recorder call in a try/catch and log a span event on failure. A correctness tool that fails to record a disposition because the eval pipeline is down is worse than one with gaps in its eval corpus.
3. **Hash application id, redact agent notes.** Reuse the salt and the redaction layer from P5-1 so the corpus inherits the same privacy posture. The corpus is non-PII by construction.
4. **The same disagreement queue catches agent error.** Bidirectional. The Confirm/Reject control on the queue is what makes the corpus trustworthy — without it, every override would be treated as a tool error and the corpus would drift.

### Definition of Done

Code complete when:
- [ ] Every disposition writes a feedback-loop record (agreement OR override).
- [ ] Agreement rate (rolling, all-time, per beverage type) is computed and surfaced in the Operations view.
- [ ] Overrides accumulate as JSONL under `eval-data/agent-corrections/`.
- [ ] The disagreement review queue surfaces sampled overrides with Confirm/Reject and writes the confirmation back to the record.
- [ ] `pnpm eval --dataset=corrections` runs the eval harness over the corpus.
- [ ] No PII in the corpus.
- [ ] No console errors; no test failures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- [ ] Manual checks above ticked.
- [ ] TICKETS.md and DEV-LOG updated; observability.md amended with the JSONL schema and the `--dataset=corrections` invocation.
- [ ] Committed to feat/feedback-loop, pushed, merged to main.

### Expected output

Every disposition now teaches the tool. Agreement and override are tracked live, overrides accumulate as a labeled corpus, disagreements surface into an admin review queue, and the same eval harness from P5-2 can be run over the corrections dataset to track quality on real-world examples — not just the synthetic golden set.

### Dependencies to install

```
(none — JSONL append and sampling are pure stdlib)
```

---

## Outcome — done 2026-06-16

**Branch:** `feat/feedback-loop`
**Status:** Done — 428 tests pass + 1 skipped (+19 new); lint + build clean.
**Workflow:** Parallel-agent build (8th). Agent A: lib + API + recorder wiring + eval `--dataset=corrections`. Agent B: agreement widget + Disagreement queue + sidebar nav. Contract-first dispatch; integration clean on first combined build.

**What landed:**
- `lib/feedback/{types,effectiveLane,override,corpus,sampler,agreement,recorder}.ts` — append-only JSONL corpus, pure derivation/detection, env-tunable sampler, rolling + all-time + per-beverage-type agreement metric.
- `app/api/feedback/{record,agreement,disagreements,disagreements/[id]/confirm}/route.ts` — four routes.
- `lib/queue/{QueueProvider,feedbackHook}.ts` — fire-and-forget POST after disposition; failures NEVER block the disposition path.
- `scripts/eval.ts` — `--dataset=golden|corrections` flag. `corrections` synthesises `CaseRun[]` from corpus records with `expectedLane = effectiveLane`.
- `components/feedback/{LanePill,AgreementRateWidget,DisagreementRow,types}.tsx` — color + icon + text everywhere.
- `app/(admin)/disagreement-queue/page.tsx` — admin route; polls every 8s.
- `app/(admin)/operations/page.tsx` — `<AgreementRateWidget />` above `<IntakeFunnel />`; polls every 10s.
- `components/shell/AdminShell.tsx` — Disagreement queue nav after Team.
- 19 new tests on tmpdir-hermetic corpus + pure derivations.

**Deviations:**
- Sampler formula is deterministic (`overrideCount * ratio > sampledCount`). The first sample lands on the 11th override; randomization is a drop-in when production volumes warrant it.
- Brand kept verbatim (transcribed label data; product name, not applicant identity). Matches the Phase 1 fixtures and the P5-2 eval report.
- Synthetic record id is `<applicationIdHash>:<recordedAt ISO>` — millisecond-grained, collision-safe at prototype volume.
- The recorder lazy-imports `@opentelemetry/api` for test envs without OTel loaded.
- The recorder's POST endpoint returns 200 with `{ok: false, error}` on failure, NOT 500 — the QueueProvider's fire-and-forget caller doesn't read the response either way.

### Why

P5-3 closes the loop observability.md leads with: every disposition that overrides the tool's lane is labeled ground truth, produced by an expert in the normal course of work. No one labels data on purpose; the labels accumulate as a side effect. The corpus grows; the agreement metric is the live accuracy proxy; the disagreement queue surfaces what needs confirmation either way.

The **pure functions for `deriveEffectiveLane` and `detectOverride`** are D4 materialised in the feedback loop. The agent's effective lane is computed in code from the disposition + structured reason summary; the override classification is computed in code from the two lanes. No model decides what "ground truth" means.

The **fire-and-forget posture on the QueueProvider's recorder call** is the structural enforcement of "the disposition write must not be blocked". The recorder's failure is a span event, not a thrown error. The disposition writes to the local store; the feedback POST fires in the background; the agent's UX is unaffected.

The **JSONL append-only corpus** is the right shape for the prototype. Append-only-friendly, streamable for the eval harness, auditable. Production moves to a governed DB in P6-2 — same record shape, different storage.

The **sampler's deterministic formula** keeps tests non-flaky and the demo predictable. Randomization is a one-line change when production volumes warrant it.

The **disagreement queue's Confirm/Reject is bidirectional** — the team marks "tool was right" OR "agent was right". The corpus learns either way. Without the bidirectional confirmation, every override would be treated as a tool error and the corpus would drift.

The **agreement rate as the headline metric on Operations** is the live accuracy proxy P5-2's offline eval complements. The eval runs on a fixed dataset; the agreement rate runs on the live disposition stream. Both feed the same picture from different angles.

The **`brand` kept verbatim** is the conscious accommodation. The Phase 1 fixtures and the P5-2 eval report treat it as system data; the corpus matches. If a future ticket reclassifies brand as sensitive, the schema accommodates a hash via `hashPii` without migration.

The **`pnpm eval --dataset=corrections` extension** is the production-eval seam. The same six metric families that grade the synthetic golden set now grade the captured corpus. P5-5's CI run compares both: golden catches synthetic regressions; corrections catches real-world drift.
