# P5-4 — Model bake-off

Run the candidate extraction models — Azure OpenAI vision in Azure Government as the recommended in-boundary path, olmOCR self-hosted as the provenance-safe air-gapped fallback, with GLM-OCR / Qwen2.5-VL flagged pending security review — against the golden set of real TTB labels (not public benchmarks), and pick the production default on measured accuracy, latency, and cost.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P5-4: Model bake-off.

Current state: (at start)
- [list what is DONE so far, with checks, including the P0-3 vision provider adapter interface and mock, the P5-2 eval harness with its metric report, and the P5-3 corrections corpus]

What's NOT done yet:
- [list with crosses what this ticket and later ones still need: provider adapter implementations for each candidate behind the same interface, the multi-provider runner, the bake-off report, the CI eval gate (P5-5), and the in-boundary model adapter (P6-1)]

TICKET-P5-4 Goal:
Use the P0-3 provider adapter seam to run each candidate model against the golden set assembled in P1-10, with the metrics computed by P5-2, and produce a bake-off report that recommends a production default and an in-boundary candidate based on measured accuracy, latency, and cost — never on a public benchmark. The output is the artifact that justifies the production model choice to the agency in P6-1.

Check lib/provider/types.ts, lib/provider/mock.ts, scripts/eval.ts, lib/eval/metrics/, and any live provider adapter that already exists before starting. Don't overwrite existing code; add adapters behind the existing interface.
Follow @techstack.md (Model Selection and the In-Boundary Production Path — the framing rule) and @observability.md (Production model bake-off).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-1, NFR-11).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from the previous ticket's real output. Most likely P5-3 — the feedback-loop recorder and the `--dataset=corrections` flag.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-4 Scope

- Phase: Phase 5 — Evals and observability
- Time budget: 3h
- Dependencies: P5-2 (eval harness with metrics report)
- Branch: feat/model-bakeoff

### Acceptance criteria

- [ ] The eval harness from P5-2 is extended to iterate over a list of provider configurations and produce one metrics report per provider, plus a side-by-side comparison report (observability.md: Production model bake-off).
- [ ] Each candidate is exercised through the same provider adapter interface defined in P0-3 (`lib/provider/types.ts`) — no candidate-specific call sites leak into the matching, triage, or result code (D8 swappable provider, NFR-6).
- [ ] Candidate set includes:
  - **The prototype default** (current adapter — Claude Sonnet 4.6 per D8 / techstack default) as the baseline.
  - **Azure OpenAI vision in Azure Government** — recommended production path (FedRAMP High, US vendor, no external endpoint). Adapter implemented and exercised if Azure Gov credentials are configured; otherwise stubbed with a clearly documented status in the report (techstack: Path one).
  - **olmOCR self-hosted** — provenance-safe air-gapped fallback (Allen Institute, US non-profit, Apache 2.0, fully open weights / training data / code). Adapter implemented against a local serving endpoint; documented as the LEAD self-hosted candidate (techstack: Path two, olmOCR as the provenance-safe pick to lead with).
  - **GLM-OCR / Qwen2.5-VL** — top-accuracy candidates documented as PENDING SECURITY REVIEW. Adapter scaffolds exist but are not the recommended pick; the report clearly tags them as Chinese-origin (Zhipu AI / Alibaba) and surfaces the procurement and security-review flag (techstack: Path two, Chinese-origin caveat).
- [ ] Per-candidate metrics: false-negative rate on real mismatches (the headline), lane confusion, warning-check accuracy, calibration ECE, per-field P/R, latency p50/p95/p99 against the 5s budget, and estimated cost per call (NFR-3).
- [ ] Bake-off report at `eval-reports/bakeoff-{timestamp}/`: one `report.md` per candidate (the P5-2 shape), plus a `comparison.md` and `comparison.json` ranking candidates against the false-negative-rate bar and the 5s p95 budget.
- [ ] The recommendation section in `comparison.md` leads with **Azure OpenAI in Azure Government** as the production answer, presents **olmOCR self-hosted** as the air-gapped fallback with the lead role, and any Chinese-origin candidate is presented LAST and tagged pending security review — never headlined (techstack: Stakeholder framing rule).
- [ ] The comparison report is reproducible: the manifest of providers used, the golden-set version, and the run timestamp are embedded so the same run can be re-executed (observability.md: Improvement Cycle — gate).

### Implementation details

- Create a provider registry at `lib/provider/registry.ts` keyed by `provider_id`. Each entry: name, adapter constructor, default config, origin metadata (vendor, license, in-boundary status, security-review status — all stakeholder-facing).
- Implement adapter modules (each behind the P0-3 interface):
  - `lib/provider/anthropic.ts` — Claude Sonnet 4.6 (existing baseline if already implemented in Phase 1; otherwise scaffold).
  - `lib/provider/azure-openai-gov.ts` — Azure OpenAI GPT-4o family targeted at the Azure Government endpoint. Reads `AZURE_OPENAI_GOV_ENDPOINT`, `AZURE_OPENAI_GOV_API_KEY`, `AZURE_OPENAI_GOV_DEPLOYMENT` from env. If not configured, the adapter throws a clear "not provisioned" error and the bake-off marks it as not-run in the report (do NOT silently fall through to the mock).
  - `lib/provider/olmocr.ts` — calls a local olmOCR serving endpoint (`OLMOCR_ENDPOINT` env, default `http://localhost:8080`). Documented as the provenance-safe self-hosted lead.
  - `lib/provider/glm-ocr.ts` and `lib/provider/qwen-vl.ts` — scaffold adapters that target a local serving endpoint. Each carries an `originNotice: 'china-origin-pending-security-review'` flag the report reads and surfaces.
- Extend the runner at `lib/eval/runner.ts` (from P5-2) to accept a list of `provider_id`s and produce a per-provider `EvalReport`.
- Add `lib/eval/bakeoff/comparison.ts` — given N `EvalReport`s, produce the comparison table and the recommendation:
  - **Rank** by false-negative rate (lowest wins) subject to passing the 5s p95 budget.
  - Tie-breaks: warning-check accuracy, then calibration ECE, then cost per call.
  - The recommendation paragraph is templated; provider origin metadata controls the framing.
- Add `lib/eval/bakeoff/report.ts` — emits `comparison.md` and `comparison.json`. The Markdown opens with the Azure-in-boundary recommendation when Azure is in the ranking pool, presents olmOCR as the air-gapped fallback with the lead role, and footnotes the pending-review candidates last.
- Add a `pnpm bakeoff` script in `package.json`: `tsx scripts/bakeoff.ts --providers=anthropic,azure-openai-gov,olmocr`.

### Key constraints

1. **Stakeholder framing rule** (techstack: Stakeholder framing rule). Lead with Azure-in-boundary as the production answer (FedRAMP High, US vendor, no provenance question). Present self-hosting as the air-gap option with olmOCR as the provenance-safe lead. **NEVER headline a Chinese-origin model for a Treasury audience.** The report templating must enforce this; do not let a low false-negative rate from GLM-OCR or Qwen2.5-VL push them to the top of the recommendation section without the pending-security-review tag and the explicit framing context.
2. **Real TTB labels, not public benchmarks.** TTB labels are graphic-design-heavy, not clean forms; public OCR leaderboards do not predict performance here (observability.md: Production model bake-off; techstack: How the choice gets made).
3. **Same adapter shape for every candidate** (D8). The bake-off is invalidated if one candidate gets bespoke pre/post-processing the others do not.
4. **The 5s p95 budget is a hard gate** (NFR-1). A candidate that fails the latency bar cannot win on accuracy.
5. **Cost is a tie-breaker, not a primary metric.** The headline is false-negative rate. Cost matters within the NFR-3 envelope, not above it.
6. **NFR-11** — this bake-off is the artifact P6-1 (in-boundary model adapter) reads to justify the production choice to the agency.

### Files to modify

- `scripts/eval.ts` (at start — paste real content from P5-2) — extend with a `--providers` multi-value flag.
- `lib/eval/runner.ts` (at start — paste real content from P5-2) — accept a provider id, instantiate the adapter from the registry.
- `package.json` — add `"bakeoff": "tsx scripts/bakeoff.ts"`.
- `README.md` — document the new env vars for Azure Gov, olmOCR, and the pending-review candidates.

### Files to create

1. `scripts/bakeoff.ts` — the multi-provider runner entrypoint.
2. `lib/provider/registry.ts` — keyed registry with origin metadata per candidate.
3. `lib/provider/anthropic.ts` — Claude Sonnet 4.6 (the prototype baseline).
4. `lib/provider/azure-openai-gov.ts` — Azure OpenAI GPT-4o family on Azure Government.
5. `lib/provider/olmocr.ts` — local olmOCR endpoint adapter.
6. `lib/provider/glm-ocr.ts` — scaffold with `originNotice` tag.
7. `lib/provider/qwen-vl.ts` — scaffold with `originNotice` tag.
8. `lib/eval/bakeoff/comparison.ts` — ranking and tie-break logic.
9. `lib/eval/bakeoff/report.ts` — `comparison.md` and `comparison.json` emitters; encodes the framing rule.
10. `tests/eval/bakeoff/comparison.test.ts` — unit tests for ranking, the latency gate, and the framing-rule template (assert that a Chinese-origin candidate is NEVER in the lead position of the recommendation paragraph).
11. `eval-reports/bakeoff-.gitkeep` — output directory.

### Config / schema / store updates

- New env vars (document in README):
  - `AZURE_OPENAI_GOV_ENDPOINT`, `AZURE_OPENAI_GOV_API_KEY`, `AZURE_OPENAI_GOV_DEPLOYMENT` — Azure Gov path one.
  - `OLMOCR_ENDPOINT` — local olmOCR serving endpoint.
  - `GLM_OCR_ENDPOINT`, `QWEN_VL_ENDPOINT` — local serving endpoints for pending-review candidates.
- No schema changes.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm bakeoff --providers=anthropic,olmocr   # the minimum reproducible subset
```

Manual:
- [ ] Run `pnpm bakeoff` with the available providers and inspect `eval-reports/bakeoff-{timestamp}/comparison.md`.
- [ ] Verify the recommendation paragraph leads with the Azure-in-boundary path (or, if Azure is not in the run, opens with olmOCR as the air-gapped fallback lead).
- [ ] Confirm any Chinese-origin candidate in the run is footnoted with the pending-security-review tag and is NOT in the lead position.
- [ ] Inspect each per-provider report and confirm the metric shape matches the P5-2 shape (false-negative rate first).
- [ ] Confirm the latency gate excludes any candidate that breaks p95 ≤ 5s from the top of the ranking.
- [ ] Verify cost per call is computed (mock if no live calls were made) and shown as a tie-breaker, not a primary metric.

**Manual check — bake-off report with accuracy/latency/cost per model**: the report must show, per candidate, the false-negative rate (headline), lane confusion accuracy, warning-check accuracy, calibration ECE, p95 latency, and estimated cost per call. This is the artifact a stakeholder reads to approve the production model choice.

Eval: this ticket extends the eval system from P5-2 with a multi-provider pass. The report it produces is the input to the P6-1 in-boundary model decision.

Update docs: mark P5-4 done in TICKETS.md; add a DEV-LOG entry; update techstack.md if any candidate's status (security review, deployment readiness) changed during implementation.

### Reference

- @techstack.md — Model Selection and the In-Boundary Production Path (Path one: Azure OpenAI in Azure Government; Path two: olmOCR / GLM-OCR / Qwen2.5-VL); Stakeholder framing rule; "How the choice gets made".
- @observability.md — Production model bake-off (real TTB labels, not public benchmarks; false-negative-rate bar; 5s p95 budget).
- @requirements.md — NFR-1 (latency), NFR-3 (cost), NFR-11 (observability/evals).
- @systemsdesign.md — D8 (swappable provider), Production Evolution Path.
- @assumptions.md — A21 (production cannot call public model APIs).
- olmOCR: https://github.com/allenai/olmocr
- Azure OpenAI on Azure Government: https://learn.microsoft.com/en-us/azure/azure-government/documentation-government-cognitiveservices-openai

### Common gotchas

1. **Compare candidate models on REAL TTB LABELS, not public benchmarks.** TTB labels are graphic-design-heavy, not clean forms. Public OCR leaderboards do not predict performance here. The golden set assembled in P1-10 from the Public COLA Registry (A24) plus synthesized red cases (A25, A26) is the comparison surface.
2. **Production candidates and the framing rule.** Recommended path: Azure OpenAI vision in Azure Government (FedRAMP High, US vendor) — lead with this. Air-gapped fallback: self-hosted open OCR-VL with **olmOCR (Allen Institute, US-origin, Apache 2.0)** as the provenance-safe lead. GLM-OCR / Qwen2.5-VL are top-accuracy but Chinese-origin (Zhipu AI / Alibaba) — pending security review. **STAKEHOLDER FRAMING RULE: lead with Azure-in-boundary, present self-hosting as air-gapped fallback with olmOCR as the lead, NEVER headline a Chinese-origin model for a Treasury audience.** The report template enforces this in code.
3. **The 5s p95 budget is a gate, not a ranking signal.** A candidate that fails NFR-1 cannot be the recommendation regardless of accuracy.
4. **Same adapter shape for every candidate.** Bespoke pre- or post-processing for one candidate invalidates the comparison. The provider registry exists to enforce a single call surface.

### Definition of Done

Code complete when:
- [ ] At least the prototype baseline and olmOCR run end-to-end against the golden set, producing per-provider reports.
- [ ] The Azure Gov adapter is implemented and exercised if Azure Gov is configured; otherwise its slot in the report is marked "not provisioned" with the reason.
- [ ] The comparison report ranks candidates with false-negative rate as the headline and the 5s p95 budget as a gate.
- [ ] The recommendation paragraph honours the framing rule in templated code (unit-tested).
- [ ] Origin metadata (vendor, license, in-boundary status, security-review status) is surfaced per candidate.
- [ ] No console errors; no test failures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm bakeoff --providers=anthropic,olmocr` pass.
- [ ] Manual checks above ticked, including the bake-off report manual review.
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to feat/model-bakeoff, pushed, merged to main.

### Expected output

Running `pnpm bakeoff` produces a comparison report ranking candidate extraction models against the false-negative-rate bar and the 5s p95 budget, on real TTB labels rather than public benchmarks. The recommendation leads with Azure OpenAI in Azure Government and presents olmOCR as the provenance-safe air-gapped fallback; any Chinese-origin candidate appears last and pending security review. This is the artifact P6-1 uses to justify the production model choice.

### Dependencies to install

```
pnpm add @azure/openai
```

(olmOCR and the pending-review adapters call local HTTP endpoints — no SDK required; fetch is sufficient.)
