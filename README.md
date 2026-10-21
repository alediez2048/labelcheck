# LabelCheck

A TTB COLA AI-enabled alcohol label verification app.

Compares a typed application form against a photographed product label, classifies the result into one of three lanes (match / mismatch / review), and routes the cases that need a human to a TTB compliance reviewer.

## Status

Working prototype, not deployed.

What works: a vision model reads the label photo and returns schema-validated fields (Anthropic by default, with retry and provider failover), deterministic rules match those fields against the application, and a triage step sorts each case into match, mismatch or review. There is a reviewer queue UI, tracing with PII redaction, an offline eval harness and a CI eval gate.

What is not done yet:

- The reviewer assistant is a stub (`lib/assistant/generator.ts`); the app uses a mock.
- `config/warning.json` carries the 27 CFR 16.21 warning text. The deployed check is presence-only; the eval and acceptance tests run the strict verbatim + ALL CAPS + bold check (see `config/README.md`).
- The CI eval gate runs a deterministic mock adapter over a 10-case golden set. It tests matching and triage logic, not model accuracy. `EVAL_PROVIDER=live pnpm eval` runs the same set against the real model.

## Run

```bash
pnpm install
pnpm dev        # opens http://localhost:3000
pnpm build      # production build
pnpm lint       # ESLint with strict no-any
pnpm test       # Vitest one-shot
pnpm test:watch # Vitest watch mode
pnpm test:ui    # Vitest browser UI
pnpm test:eval  # offline eval against the golden set (same as pnpm eval)
```

## Testing

Vitest is the runner (configured in `vitest.config.ts`, with the `@/*` alias matching `tsconfig.json`). Module-level tests live in `__tests__/` directories next to the code; top-level acceptance and smoke tests live in `tests/`.

CI runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, and `pnpm test` on every push and PR via `.github/workflows/ci.yml`. Node 20 LTS and pnpm 9 are pinned so the local lockfile and the CI runner agree.

**No applicant PII in fixtures.** All test images must be either synthetic (generated programmatically with `sharp.create` like the image preprocessor tests) or sourced from the Public COLA Registry. Never commit a real, unapproved label photo.

**`pnpm test:eval`** runs the offline eval described below.

## Latency bench

```bash
pnpm tsx scripts/bench-latency.ts                  # mock adapter (default)
ITERATIONS=100 pnpm tsx scripts/bench-latency.ts   # bigger sample
PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm tsx scripts/bench-latency.ts
```

Prints `p50 / p95 / max` for the extraction call and for the end-to-end pipeline, split by single-face vs multi-face. The p95 number is the headline (budget: 5s). The multi-face split shows whether full-resolution labels with several faces fit the budget. If the live-adapter multi-face p95 goes over, the bench prints `A12_FLAGGED`.

CI runs a reduced version of the bench (20 iterations against the mock) via `tests/latency.test.ts`, so the latency budget is part of the build gate. The live-adapter measurement is opt-in — CI never asserts against the live model because the latency would be flaky.

## Performance

The 5-second p95 budget for single-application verification
assumes a **warm host** — no scale-to-zero, minimum instance count ≥ 1.
A per-request cold start silently blows the budget. See
`docs/00-build/HOSTING.md` for the vendor-neutral hosting requirement and
per-platform pointers.

`GET /api/health` is the keep-warm probe. It returns `{ ok: true }`
immediately and never calls the provider; the hosting platform's
health check should point at it.

The load script at `scripts/load.ts` drives the per-application pipeline
under three scenarios — sequential baseline, sustained concurrent load,
and concurrent verifies during a 300-app batch burst:

```bash
pnpm tsx scripts/load.ts --scenario=A
pnpm tsx scripts/load.ts --scenario=B --concurrency=10 --duration=60
pnpm tsx scripts/load.ts --scenario=C --batchSize=300
```

Mock-adapter measurements (single-app p50 / p95 / p99 / max, in ms):

| Scenario | p50 | p95 | p99 | max | Budget |
|---|---:|---:|---:|---:|---|
| A — sequential (50 iters) | 4 | 18 | 28 | 28 | PASS |
| B — concurrent (10 workers × 60s) | 16 | 30 | 54 | 297 | PASS |
| C — single-app during 300-app batch | 57 | 58 | 59 | 59 | PASS |

`config/batch.json#concurrency` is held at **5** — Scenario C shows the
bounded-concurrency self-throttle does its job under the mock and the
single-app budget is never close to threatened. Live-adapter validation
is a separate manual run with a real API key; the mock measurement is
the structural smoke confirming the script + the cap interact correctly.

## Tracing

Every verification request and every assistant turn emits an
OpenTelemetry trace. The exporter is config-swappable via
`OTEL_EXPORTER`:

- `console` (default) — spans and metrics go to stdout. Good for
  `pnpm dev` and CI.
- `file` — JSONL appended to `OTEL_FILE_PATH` (default
  `.data/traces/otel.jsonl`; the `.data/` directory is gitignored).
- `otlp` — production seam. Posts to `OTEL_OTLP_ENDPOINT` via OTLP
  HTTP, so a self-hosted Langfuse or Phoenix collector can be
  swapped in without touching call sites.

`PII_HASH_SALT` is **required in production**. The dev prototype
falls back to a fixed string with a console warning so local work
keeps moving. See `docs/PRIVACY-IN-TRACES.md` for the full redaction
policy — what's hashed, what's verbatim, which keys are on the
allow-list.

## Eval

```bash
pnpm eval                                          # mock adapter (default)
EVAL_PROVIDER=live ANTHROPIC_API_KEY=... pnpm eval # live adapter
```

`pnpm eval` runs the golden set (`tests/golden/index.ts`) end
to end through the verification pipeline and writes a metrics report
under `eval-reports/<ISO timestamp>/`:

- `report.json` — structured metrics; the model bake-off and the CI eval
  gate read this.
- `report.md` — human summary; leads with the **false-negative rate
  on real mismatches** (observability.md's headline safety metric).

The Markdown report covers: false-negative rate, 3x3 lane confusion,
government-warning check accuracy, confidence calibration table + ECE,
per-field precision / recall / F1, and the p50/p95/p99/max
latency distribution against the 5-second budget.

`eval-reports/` is gitignored — reports are per-run artifacts. The
runner is provider-agnostic via `EVAL_PROVIDER`; `mock` is the
default and runs deterministically without an API key. No applicant
PII enters the report — all values are enums, counts, ratios, and
stable internal case ids.

## Bake-off

```bash
pnpm bakeoff                                                    # default: mock,anthropic,olmocr
pnpm bakeoff --providers=mock,anthropic,olmocr
pnpm bakeoff --providers=mock,anthropic,azure-openai-gov,olmocr,glm-ocr,qwen-vl
```

The bake-off runs the full eval against the golden set once per
provider, writes per-provider reports under
`eval-reports/bakeoff-<ISO timestamp>/<providerId>/`, and produces a
single `comparison.md` + `comparison.json` at the bake-off root.

The comparison report enforces the stakeholder framing rule from
`docs/02-design/techstack.md`:

- **Lead candidate** = Azure OpenAI in Azure Government (FedRAMP High,
  US vendor, no external endpoint) when its env is configured. If Azure
  Gov is not exercised in the run, the comparison says so and promotes
  the air-gapped fallback to the lead role.
- **Air-gapped fallback** = olmOCR (Allen Institute, US-origin,
  Apache 2.0) — the provenance-safe lead among self-hosted candidates.
- **Pending security review** = GLM-OCR (Zhipu AI) and Qwen2.5-VL
  (Alibaba). Chinese-origin models that can be measured for accuracy on
  the same harness but never appear in the lead position of the
  recommendation regardless of their measured metrics. The framing rule
  is enforced in code in `lib/eval/bakeoff/comparison.ts` (unit-tested
  in `tests/eval/bakeoff/comparison.test.ts`).

Ranking: false-negative rate ASC (the headline; observability.md is
explicit) subject to a 5-second p95 latency gate. Tie-breaks:
warning-check accuracy DESC, ECE ASC, then estimated cost per call
ASC. A candidate that fails the p95 gate is excluded with a reason
citing the budget; a candidate the harness could not provision is
excluded with the underlying error.

## Repo layout

```
LabelCheck/
├── app/                  Next.js App Router pages and API routes
├── lib/                  business logic — extraction, matching, triage
├── config/               canonical warning text, tolerances, per-type fields
├── types/                shared domain types — Application, Lane, Disposition
├── docs/                 product requirements, design notes, build docs
├── tools/                data tools — cola-fetcher, cola-generator, cola-assembler
└── data/                 sample COLAs (real + synthesized)
```

Some code comments cite requirement and decision IDs (for example `FR-11` or `D6`). They point to `docs/01-product/requirements.md` and `docs/02-design/systemsdesign.md`, where each one is written out.

## Environment

Copy `.env.example` to `.env` and fill in the values you need. `.env` is gitignored at the repo root.

| Variable | Default | Purpose |
|---|---|---|
| `ACCESS_PASSCODE` | unset | Spend-shield passcode for the deployed app. Unset for local dev — the access gate becomes a no-op. **Not authentication** — production uses PIV/CAC + SSO + RBAC + audit. |
| `ACCESS_COOKIE_SECRET` | unset | Server-side HMAC secret for signing the access cookie. **Required when `ACCESS_PASSCODE` is set.** Use 32+ bytes of randomness. |
| `PROVIDER` | `mock` | Vision provider adapter selector. Supported values: `mock` (default), `anthropic` (Claude Sonnet 4.6), `azure-openai-gov`, `olmocr`, `glm-ocr` (bake-off, pending security review), `qwen-vl` (bake-off, pending security review). |
| `ANTHROPIC_API_KEY` | unset | Required when `PROVIDER=anthropic`. The Anthropic provider throws at startup if the value is missing. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Override the Claude model used by the Anthropic provider. Useful for evals against a specific model snapshot during the bake-off. |
| `AZURE_OPENAI_GOV_ENDPOINT` | unset | Azure OpenAI on Azure Government resource URL (e.g. `https://<resource>.openai.azure.us/`). Required for `PROVIDER=azure-openai-gov`. |
| `AZURE_OPENAI_GOV_API_KEY` | unset | Azure OpenAI on Azure Government resource key. Required for `PROVIDER=azure-openai-gov`. |
| `AZURE_OPENAI_GOV_DEPLOYMENT` | unset | Deployment name for the GPT-4o vision model on Azure Gov. Required for `PROVIDER=azure-openai-gov`. |
| `AZURE_OPENAI_GOV_API_VERSION` | `2024-08-01-preview` | API version pinned for the Azure Gov adapter. |
| `OLMOCR_ENDPOINT` | `http://localhost:8080` | Local olmOCR serving endpoint. The adapter posts to `<endpoint>/extract`. |
| `GLM_OCR_ENDPOINT` | unset | Local GLM-OCR serving endpoint. **PENDING SECURITY REVIEW — Chinese-origin model; not approved for Treasury workloads without executive review** (techstack.md framing rule). |
| `QWEN_VL_ENDPOINT` | unset | Local Qwen2.5-VL serving endpoint. **PENDING SECURITY REVIEW — Chinese-origin model; not approved for Treasury workloads without executive review** (techstack.md framing rule). |
| `IMAGE_MAX_LONG_EDGE` | `1568` | Long-edge cap for image preprocessing. Default is Claude's usable maximum. **Do not set below 1568 without changing the provider** — the smallest text on the label (the government warning) becomes illegible and the warning check silently weakens. |
| `OTEL_EXPORTER` | `console` | Trace + metric exporter. Supported values: `console`, `file`, `otlp`. |
| `OTEL_FILE_PATH` | `.data/traces/otel.jsonl` | Output path when `OTEL_EXPORTER=file`. |
| `OTEL_OTLP_ENDPOINT` | unset | OTLP HTTP endpoint when `OTEL_EXPORTER=otlp`. |
| `PII_HASH_SALT` | dev fallback | Salt for hashing PII in trace attributes. **Required in production.** See `docs/PRIVACY-IN-TRACES.md`. |
| `FEEDBACK_AGREEMENT_WINDOW` | `100` | Rolling-window size for the tool-vs-agent agreement rate. The Operations widget surfaces this against the all-time number. |
| `FEEDBACK_SAMPLER_RATIO` | `0.10` | Fraction of daily overrides sampled into the disagreement queue. The sampler also enforces `FEEDBACK_SAMPLER_CAP_PER_DAY`. |
| `FEEDBACK_SAMPLER_CAP_PER_DAY` | `25` | Hard cap on the size of a day's sampled disagreement queue — keeps the supervisor's review pile bounded even when override volume spikes. |

## Documentation

Read in this order:

1. `docs/01-product/business.md` — the why
2. `docs/01-product/constraints.md` — the boundaries
3. `docs/02-design/CONTEXT.md` — the glossary
4. `docs/02-design/systemsdesign.md` — architecture and design decisions
