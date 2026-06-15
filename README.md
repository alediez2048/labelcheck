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
