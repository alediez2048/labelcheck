# LabelCheck

A TTB COLA AI-enabled alcohol label verification app.

Compares a typed application form against a photographed product label, classifies the result into one of three lanes (match / mismatch / review), and routes the cases that need a human to a TTB compliance reviewer.

## Status

Phase 0 scaffold (P0-1). The verification flow itself is built in Phase 1 (P1-1 through P1-11). See `docs/00-build/PRD.md` for the full plan.

## Run

```bash
pnpm install
pnpm dev        # opens http://localhost:3000
pnpm build      # production build
pnpm lint       # ESLint with strict no-any
pnpm test       # Vitest one-shot
pnpm test:watch # Vitest watch mode
pnpm test:ui    # Vitest browser UI
pnpm test:eval  # offline eval harness (placeholder; P5-2 fills it)
```

## Testing

Vitest is the runner (configured in `vitest.config.ts`, with the `@/*` alias matching `tsconfig.json`). Module-level tests live in `__tests__/` directories next to the code; top-level acceptance and smoke tests live in `tests/`.

CI runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, and `pnpm test` on every push and PR via `.github/workflows/ci.yml`. Node 20 LTS and pnpm 9 are pinned so the local lockfile and the CI runner agree.

**No applicant PII in fixtures (NFR-4, AC-10).** All test images must be either synthetic (generated programmatically with `sharp.create` like the image preprocessor tests) or sourced from the Public COLA Registry (assumption A24). Never commit a real, unapproved label photo.

**`pnpm test:eval`** is a hook reserved for the offline eval harness implemented by P5-2 (`docs/00-build/tickets/P5-2-offline-eval-harness.md`). It runs the verification path against the golden set (real green pairs + synthesized defects) and reports per-field precision/recall, lane accuracy, false-negative rate, warning-check accuracy, and confidence calibration per observability.md. Today it prints a placeholder and exits 0; P5-2 fills it in.

## Latency bench (P1-11)

```bash
pnpm tsx scripts/bench-latency.ts                  # mock adapter (default)
ITERATIONS=100 pnpm tsx scripts/bench-latency.ts   # bigger sample
PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm tsx scripts/bench-latency.ts
```

Prints `p50 / p95 / max` for the extraction call and for the end-to-end pipeline, split by single-face vs multi-face. The p95 number is the headline (NFR-1 / AC-7 budget: 5s). The multi-face split is the measured answer to **assumption A12** (real-world latency of full-resolution multi-face calls). If the live-adapter multi-face p95 exceeds the budget, the bench prints `A12_FLAGGED` and the follow-up belongs in P3-4 (performance hardening).

CI runs a reduced version of the bench (20 iterations against the mock) via `tests/latency.test.ts` so AC-7 is part of the build gate. The live-adapter measurement is opt-in — CI never asserts against the live model because the latency would be flaky.

## Performance (P3-4)

The 5-second p95 budget for single-application verification (NFR-1, AC-7)
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

## Repo layout

```
LabelCheck/
├── app/                  Next.js App Router pages and API routes
├── lib/                  business logic — extraction, matching, triage (P1)
├── config/               canonical warning text, tolerances, per-type fields (P0-4)
├── types/                shared domain types — Application, Lane, Disposition (P0-2)
├── docs/                 design, build plan, 43 ticket files
├── tools/                data tools — cola-fetcher, cola-generator, cola-assembler
└── data/                 sample COLAs (real + synthesized)
```

## Environment

Copy `.env.example` to `.env` and fill in the values you need. `.env` is gitignored at the repo root.

| Variable | Default | Purpose |
|---|---|---|
| `ACCESS_PASSCODE` | unset | Spend-shield passcode for the deployed app (P0-6). Unset for local dev — the access gate becomes a no-op. **Not authentication** — production uses PIV/CAC + SSO + RBAC + audit (NFR-8, P6-3). |
| `ACCESS_COOKIE_SECRET` | unset | Server-side HMAC secret for signing the access cookie (P0-6). **Required when `ACCESS_PASSCODE` is set.** Use 32+ bytes of randomness. |
| `PROVIDER` | `mock` | Vision provider adapter selector (P0-3). Supported values: `mock` (default), `anthropic` (Claude Sonnet 4.6, P1-2), `azure-openai` (P6-1), `olmocr` (P6-1). |
| `ANTHROPIC_API_KEY` | unset | Required when `PROVIDER=anthropic` (P1-2). The Anthropic provider throws at startup if the value is missing. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Override the Claude model used by the Anthropic provider (P1-2). Useful for evals against a specific model snapshot during P5-4 bake-off. |
| `IMAGE_MAX_LONG_EDGE` | `1568` | Long-edge cap for image preprocessing (P0-5). Default is Claude's usable maximum (D7). **Do not set below 1568 without changing the provider** — the smallest text on the label (the government warning) becomes illegible and the warning check silently weakens. |

## Documentation

Read in this order:

1. `docs/01-product/business.md` — the why
2. `docs/01-product/constraints.md` — the boundaries
3. `docs/02-design/CONTEXT.md` — the glossary
4. `docs/00-build/PRD.md` — the build plan
5. `docs/00-build/tickets/` — 43 per-ticket primers
