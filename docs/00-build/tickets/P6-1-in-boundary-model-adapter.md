# P6-1 — In-boundary model adapter

Write a production vision provider adapter that targets either Azure OpenAI vision in Azure Government (the recommended FedRAMP-High path) or a self-hosted open OCR-VL model on agency GPUs (olmOCR as the provenance-safe lead). The adapter swaps in behind the existing P0-3 interface with no change to extraction, matching, or triage; the bake-off (P5-4) chooses the winner on real TTB labels.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P6-1: In-boundary model adapter.

Current state: (at start)
- [Prototype Phase 0–5 complete. P0-3 defined the VisionProvider adapter interface and a mock adapter. P1-2 wired the extraction service to it. The prototype default is a public model (Claude Sonnet 4.6, D8). P5-4 ran the bake-off on the golden set.]

What's NOT done yet:
- [P6-1] No in-boundary provider adapter exists; production cannot ship while the only live path is a public API endpoint (A21).
- [P6-2..P6-7] Persistence, auth, COLA integration, correction lifecycle, self-hosted observability, and compliance hardening still to come.

TICKET-P6-1 Goal:
Implement a production VisionProvider adapter targeting Azure OpenAI vision in Azure Government (FedRAMP High, US vendor, recommended) and a parallel adapter for a self-hosted open OCR-VL model on agency GPUs (olmOCR lead, Apache 2.0, US-origin). Both implement the same P0-3 interface, are selected by config, never call a public endpoint from the production deployment, and pass the bake-off bar on the TTB golden set per P5-4.

Check @lib/provider/types.ts and the existing mock/Claude adapters before starting. Don't change the interface; the value of the seam is that nothing downstream moves.
Follow systemsdesign Production Evolution Path, techstack Model Selection and the In-Boundary Production Path, and observability Production model bake-off. The stakeholder framing rule (techstack) is binding: lead with Azure-in-boundary, present self-hosting as the air-gapped fallback with olmOCR as the lead, never headline a Chinese-origin model for a Treasury audience.
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P5-4's real output: which model won the bake-off on TTB labels, the false-negative-rate measured, the p95 latency at full resolution.)_

### TICKET-P6-1 Scope

- Phase: Phase 6 — Production migration (in-boundary)
- Time budget: 4h
- Dependencies: P0-3 (adapter interface), P5-4 (bake-off result)
- Branch: `feat/inboundary-model`

### Acceptance criteria

- [ ] An `AzureOpenAIVisionAdapter` implements the P0-3 `VisionProvider` interface against Azure OpenAI in Azure Government (FedRAMP High, no public endpoint). Auth via managed identity or service-principal client credential; endpoint and deployment from env (D8 swappable seam; assumption A21).
- [ ] A `SelfHostedOcrVlAdapter` implements the same interface against a self-hosted open OCR-VL model on agency GPUs, with olmOCR (Allen Institute, Apache 2.0, US-origin) as the default candidate; the HTTP client targets an in-cluster service URL, never a public endpoint (techstack: Model Selection and the In-Boundary Production Path).
- [ ] The adapter selection is config-driven (`PROVIDER=azure-gov|self-hosted|mock`); no code change is needed to switch. Extraction, matching, and triage are untouched (NFR-6; D4 / D8).
- [ ] The production deployment fails closed: if the configured provider is `mock` or a public-endpoint adapter, the production startup check throws (no accidental egress to a public API; A21).
- [ ] Both adapters return text-only per-face transcription plus the government-warning structural flags (D4, D14). No verdicts are produced by the model.
- [ ] Both adapters meet the bake-off bar set in P5-4: the false-negative rate on real mismatches at or below the threshold and p95 verification latency under 5s on representative TTB inputs (NFR-1; observability Key Metrics).
- [ ] Stakeholder framing rule honoured in any docs and READMEs touched: the production answer leads with Azure-in-boundary; self-hosting is presented as the air-gapped fallback with olmOCR as the provenance-safe lead. Chinese-origin models (GLM-OCR, Qwen2.5-VL) are documented as pending security review only, never as the headline.

### Implementation details

1. Create `lib/provider/azure-gov.ts` implementing `VisionProvider`. Use the Azure OpenAI SDK against the Azure Government endpoint (`*.openai.azure.us`). Configure with managed identity in production and service-principal client credentials for local dev against the gov tenant. Image input is base64 or a SAS URL into agency Blob (see P6-2). One call per application carrying all faces (D14).
2. Create `lib/provider/self-hosted.ts` implementing the same interface. HTTP POST to the in-cluster OCR-VL service URL (`http://ocr-vl.internal:8080/extract` or similar — exact URL is an infra concern). Default candidate is olmOCR; a `MODEL_FAMILY` env selects between olmOCR (lead) and the review-gated alternatives.
3. Update `lib/provider/index.ts` (provider factory) to wire selection from env: `mock` (dev/test), `claude` (prototype only), `azure-gov`, `self-hosted`. Add a `requireInBoundaryProvider()` startup guard that throws when `NODE_ENV=production` and the selected provider is not in-boundary.
4. Prompt parity: both production adapters must run the same prompt template, the same field schema, and the same structural-flag contract as the prototype Claude adapter. Differences in prompt phrasing across providers belong in per-adapter prompt files but the **output schema is invariant** (D4 contract).
5. Add an `eval:bakeoff` runner hook so the golden set (P5-2) can be executed behind each adapter; this is how the bake-off bar is enforced (observability Production model bake-off).
6. Document the choice in `README.md` and `docs/02-design/techstack.md` Model Selection section (the file already states the rule; no rewrite — just confirm the production decision once the bake-off is signed off).

### Key constraints

1. The model reads, the code decides — D4. No verdicts from any adapter. Output schema invariant across providers.
2. p95 under 5s for verification — NFR-1; the production bake-off measures this under representative multi-face load.
3. TypeScript strict, no `any`.
4. **Production-specific: no external endpoints.** Production must not reach any IP outside the FedRAMP boundary. The startup guard enforces this; assumption A21 is the firewall reality that broke the prior vendor.
5. **Stakeholder framing rule (techstack):** lead with Azure-in-boundary; present self-hosting as the air-gapped fallback with olmOCR as the lead; never headline a Chinese-origin model for a Treasury audience.
6. Adapter selection is config, not code — D8 swappable seam.

### Files to modify

Primary: `lib/provider/index.ts` (provider factory) — add `azure-gov` and `self-hosted` entries and the `requireInBoundaryProvider()` guard. Existing `mock` and `claude` adapters remain for development and prototype demo only.

### Files to create

1. `lib/provider/azure-gov.ts` — Azure OpenAI vision adapter, Azure Government endpoint, managed-identity auth.
2. `lib/provider/self-hosted.ts` — HTTP adapter to the in-cluster OCR-VL service; defaults to olmOCR; selectable by `MODEL_FAMILY`.
3. `lib/provider/in-boundary-guard.ts` — `requireInBoundaryProvider()` startup check; throws on `mock`/`claude` when `NODE_ENV=production`.
4. `lib/provider/prompts/azure-gov.ts`, `lib/provider/prompts/self-hosted.ts` — per-adapter prompt templates, identical output schema.
5. `tests/provider/azure-gov.test.ts`, `tests/provider/self-hosted.test.ts` — interface conformance tests against recorded fixtures.

### Config / schema / store updates

Env additions (documented in README):
- `PROVIDER=azure-gov|self-hosted|mock|claude`
- `AZURE_OPENAI_ENDPOINT` (Azure Government, e.g. `https://<resource>.openai.azure.us`)
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_USE_MANAGED_IDENTITY=true|false`
- `OCR_VL_BASE_URL` (in-cluster service URL)
- `MODEL_FAMILY=olmocr|<review-gated alt>`

No schema changes in this ticket. `verification.model_name` and `verification.model_version` (schema.md) already record which provider/model ran.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm eval:bakeoff -- --provider=azure-gov
pnpm eval:bakeoff -- --provider=self-hosted
```

Manual:
- [ ] **Bake-off bar met on TTB labels (P5-4):** both adapters meet or beat the false-negative-rate threshold and the p95 5s budget on the golden set. The winner is recorded as the production default.
- [ ] Production startup with `PROVIDER=mock` throws (`requireInBoundaryProvider`).
- [ ] Production startup with `PROVIDER=azure-gov` and a real Azure Government endpoint succeeds and returns a structured extraction on a sample face.
- [ ] Network inspection: traffic from the production pod to the Azure OpenAI deployment stays inside the Azure Government tenant (no public-internet egress).
- [ ] Stakeholder framing rule honoured: the README and any decision memo lead with the Azure-in-boundary path; olmOCR is the lead self-hosted candidate; GLM-OCR / Qwen2.5-VL appear only as pending-security-review alternatives.

Eval: re-run the P5-4 bake-off harness behind each adapter; the report decides the production default.

Update docs: mark P6-1 done in TICKETS.md; add a DEV-LOG entry; record the bake-off winner in the techstack Model Selection section.

### Reference

- techstack.md — Model Selection and the In-Boundary Production Path (the stakeholder framing rule lives here).
- systemsdesign.md — D4, D8, D14; Production Evolution Path.
- observability.md — Production model bake-off; Key Metrics (false-negative rate, p95 latency).
- requirements.md — NFR-1, NFR-6, NFR-11.
- assumptions.md — A21 (firewall), A23 (prototype-only public API).

### Common gotchas

1. **Two clean paths only.** Path one (recommended): Azure OpenAI vision in Azure Government — FedRAMP High, US vendor, no external endpoint, the strongest production answer for a Treasury bureau already on Azure FedRAMP. Path two (air-gapped fallback): self-hosted open OCR-VL on agency GPUs, with olmOCR (Allen Institute, US non-profit, Apache 2.0) as the provenance-safe lead. GLM-OCR (Zhipu AI) and Qwen2.5-VL (Alibaba) lead public benchmarks but are Chinese-origin; they remain viable pending security review but **never lead** in a Treasury room. **Stakeholder framing rule: lead with Azure-in-boundary; present self-hosting with olmOCR as the lead; never headline a Chinese-origin model.** The bake-off (P5-4) chooses the winner.
2. The Azure Government endpoint suffix is `.openai.azure.us`, not `.openai.azure.com`. Pointing the SDK at the commercial endpoint accidentally is a FedRAMP boundary breach — fail loudly on env mismatch.
3. The output schema is invariant across providers (D4). If a new provider returns model-judged verdicts or self-reported overall confidence, **discard those fields in the adapter** — the code derives confidence (D5) and assigns the lane (triage). Letting them leak through silently re-introduces the failure mode D4/D5 exist to prevent.
4. Do not delete or short-circuit the `mock` adapter — it stays in the codebase for tests and local dev. The `requireInBoundaryProvider()` guard is what keeps it out of production.

### Definition of Done

Code complete when:
- [ ] `AzureOpenAIVisionAdapter` and `SelfHostedOcrVlAdapter` both implement `VisionProvider` and pass interface conformance tests.
- [ ] Provider factory selects by env; `requireInBoundaryProvider()` blocks `mock`/`claude` in production.
- [ ] Both adapters pass the P5-4 bake-off bar on the TTB golden set (false-negative rate + p95 latency).
- [ ] No `any`; no console errors; output schema identical across all providers.
- [ ] Meets NFR-1 (p95 under 5s end-to-end on representative inputs).

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, bake-off eval).
- [ ] TICKETS.md and DEV-LOG updated; bake-off winner recorded in techstack.md.
- [ ] Committed to `feat/inboundary-model`, pushed, merged to main.

### Expected output

The production deployment can verify TTB labels behind either the Azure OpenAI vision adapter (in Azure Government, FedRAMP High) or a self-hosted olmOCR-led adapter on agency GPUs, selected by config. No production traffic reaches a public model endpoint. The matching engine, triage classifier, and result contract are untouched (D4/D8). The bake-off winner is the documented production default.

### Dependencies to install

```
pnpm add @azure/openai @azure/identity
pnpm add undici            # for the self-hosted HTTP client
pnpm add -D nock           # for adapter conformance tests against recorded fixtures
```
