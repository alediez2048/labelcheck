# Hosting — warm-host requirement (P3-4)

The verification path's 5-second p95 budget (NFR-1, AC-7) assumes a
warm container. Scale-to-zero or per-request cold starts will silently
blow the budget — a JIT-cold Next.js server doing first-touch sharp +
provider TCP setup takes seconds on its own, before extraction even
runs.

## Required posture

- **Always-warm host.** No scale-to-zero. Minimum instance count ≥ 1.
- **No per-request cold start.** The container must already be running
  when a verify request lands.
- **Health-check endpoint:** `GET /api/health`. Returns `{ ok: true }`
  immediately and does NOT call the provider, decode images, or touch
  the batch store. Safe for the hosting platform's keep-warm probe.

## Vendor neutrality

The requirement applies whichever platform is chosen. Concrete
mappings the operator can pick from:

- **Render** — Web Service with `minInstances: 1` (or higher) and the
  health-check path set to `/api/health`. Autosleep MUST be disabled.
- **Railway** — disable scale-to-zero on the service; configure the
  health-check at `/api/health`.
- **Fly.io** — `min_machines_running = 1` on the app; health-check at
  `/api/health`.
- **Vercel** — only acceptable if "min instances ≥ 1" is configured on
  the relevant function/region. The default serverless cold-start
  model is incompatible with the budget.
- **Azure (Gov)** — App Service Always On = enabled, or the equivalent
  Container Apps setting that keeps at least one replica warm. (Per
  the production-model decision, Azure OpenAI in Azure Gov is the
  recommended deployment target.)

Operator's choice; the requirement does not change.

## Why this is not in the repo as a vendor config

The repo does not currently ship a `render.yaml`, `fly.toml`, or
`railway.toml`. Adding one here would bias the deployment choice. The
constraint is the warm posture, not the platform; this doc captures
the constraint so whichever target the operator picks satisfies it.

## What the load script validates

`scripts/load.ts --scenario=B` and `--scenario=C` exercise the
in-process pipeline cost under concurrent load and during a batch
burst. They do NOT exercise the hosting layer's cold-start
behaviour — that has to be verified by leaving the deploy idle for
≥ 15 minutes and then hitting `/api/verify` to confirm the first
request returns at normal latency, not a cold-start spike.

## References

- `docs/00-build/tickets/P3-4-performance-hardening.md` — this ticket.
- `app/api/health/route.ts` — the health-check endpoint.
- `scripts/load.ts` — the concurrent + batch-burst load script.
- `docs/02-design/systemsdesign.md` — Meeting the Latency Budget.
- `docs/01-product/constraints.md` — Cold start tolerance.
