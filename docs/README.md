# LabelCheck — Documentation Index

A TTB COLA AI-enabled label checking app.

This directory holds the full design and build documentation, organized into five categories. The numeric prefixes set the reading order for someone approaching the project for the first time.

## How to read

1. **Start here.** Skim this index, then read `01-product/business.md` for the why and `01-product/constraints.md` for the boundaries.
2. **Get the language.** `02-design/CONTEXT.md` is the glossary — every other doc speaks it.
3. **Understand the shape.** `02-design/systemsdesign.md` for architecture and the D1–D16 decisions; `02-design/flowchart.md` for process diagrams.
4. **Find what to build.** `00-build/PRD.md` is the authoritative build plan; `00-build/TICKETS.md` is the per-ticket backlog.

## Categories

### `00-build/` — what we're building and how to ship it
| File | Role |
|---|---|
| [PRD.md](00-build/PRD.md) | Authoritative build plan: phases P0–P6, success metrics, cross-cutting requirements, risks |
| [TICKETS.md](00-build/TICKETS.md) | 43-ticket backlog with deps, branches, estimates, acceptance criteria |
| [TICKET-TEMPLATE.md](00-build/TICKET-TEMPLATE.md) | Fill-in kickstart primer for spinning up a fresh agent session per ticket |

### `01-product/` — the why, the what, the constraints
| File | Role |
|---|---|
| [business.md](01-product/business.md) | Operating cost vs. labor-savings model; ROI sensitivity |
| [constraints.md](01-product/constraints.md) | Scale, hard latency, cost ceiling, MoSCoW scope, review model |
| [assumptions.md](01-product/assumptions.md) | 31-item risk register (Solid / Reasonable / To Validate) |
| [requirements.md](01-product/requirements.md) | FR-1 to FR-31 (incl. FR-26a, FR-26b); NFR-1 to NFR-11; AC-1 to AC-10 |

### `02-design/` — the how
| File | Role |
|---|---|
| [CONTEXT.md](02-design/CONTEXT.md) | Glossary — the single source of truth for terminology |
| [systemsdesign.md](02-design/systemsdesign.md) | Architecture, components, decisions D1–D16 |
| [techstack.md](02-design/techstack.md) | Technology choices with rationale, alternatives, trade-offs; in-boundary model selection |
| [schema.md](02-design/schema.md) | Production data model (13 tables); prototype omits this by design |
| [flowchart.md](02-design/flowchart.md) | System context, COLA lifecycle, triage logic, warning sub-check |
| [observability.md](02-design/observability.md) | Evals, traces, agent-correction feedback loop, production model bake-off |

### `03-ui/` — UI / UX artefacts
| File | Role |
|---|---|
| [mockup.md](03-ui/mockup.md) | UI design narrative, screen-by-screen, sample apps mapped to acceptance criteria |
| [mockup.html](03-ui/mockup.html) | Static HTML mockup of the agent and admin shells |

### `04-presentation/` — stakeholder-facing
| File | Role |
|---|---|
| [presentation-outline.md](04-presentation/presentation-outline.md) | Slide-by-slide outline for the stakeholder deck |
| LabelCheck-Presentation.pptx | The deck itself (binary) |

## Cross-references

Most docs cross-reference each other by bare filename (e.g. "see CONTEXT.md"). These survive the reorganization as prose; agents resolve them via filename search regardless of subdirectory.
