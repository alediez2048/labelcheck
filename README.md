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
pnpm test       # placeholder; Vitest lands in P0-7
```

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
| `PROVIDER` | `mock` | Vision provider adapter selector (P0-3). Set to a live provider name once that provider is implemented (`anthropic` after P1-2; `azure-openai` or `olmocr` after P6-1). |
| `IMAGE_MAX_LONG_EDGE` | `1568` | Long-edge cap for image preprocessing (P0-5). Default is Claude's usable maximum (D7). **Do not set below 1568 without changing the provider** — the smallest text on the label (the government warning) becomes illegible and the warning check silently weakens. |

## Documentation

Read in this order:

1. `docs/01-product/business.md` — the why
2. `docs/01-product/constraints.md` — the boundaries
3. `docs/02-design/CONTEXT.md` — the glossary
4. `docs/00-build/PRD.md` — the build plan
5. `docs/00-build/tickets/` — 43 per-ticket primers
