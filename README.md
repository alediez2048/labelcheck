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

## Documentation

Read in this order:

1. `docs/01-product/business.md` — the why
2. `docs/01-product/constraints.md` — the boundaries
3. `docs/02-design/CONTEXT.md` — the glossary
4. `docs/00-build/PRD.md` — the build plan
5. `docs/00-build/tickets/` — 43 per-ticket primers
