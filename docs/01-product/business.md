# Business Case: AI-Powered Alcohol Label Verification

Status: draft for review
Owner: solo developer
Last updated: 2026-06-10

This document covers both sides of the financial picture: what the system costs to run in API credits, and what it saves in agent labor. The cost side puts a real number behind the budget ceiling in constraints.md and informs the model choice in techstack.md. The savings side estimates the return, in agent hours and dollars per year, from removing the routine verification grind that the system is built to absorb.

All figures are estimates with stated assumptions, and sensitivity ranges are given so the conclusions do not rest on any single guess. The headline holds across the whole range: operating cost is trivial, and labor savings are large.

---

# Part A: Operating Cost (API Credits)

Scope: vision model API spend only. It excludes hosting (near zero at this traffic on a small container) and any future in-boundary model infrastructure, which is a different cost structure (see assumption A21).

## Cost Assumptions

The per-application cost depends on tokens per verification call. The unit is the application, one call carrying all its label faces (systemsdesign D13, D14), not a single image. These are estimates; the sensitivity section shows how totals move if they are off. This model was recomputed after two grill decisions: full-resolution images (D7) and multiple faces per application (D12, D14).

Per verification call (one application):
- Image input: roughly 2,000 tokens per label face at the provider's maximum usable resolution (full resolution, no downscaling; D7). An image token count scales with resolution, so full-res faces cost more than the earlier downscaled estimate.
- Faces per application: assume an average of 2 (front and back; neck when present), so about 4,000 image tokens.
- Prompt text input: roughly 900 tokens for instructions, the field schema, and the form values.
- Total input: approximately 5,000 tokens.
- Output: roughly 700 tokens for the structured per-face result.

Working figure: 5,000 input and 700 output tokens per application, one call per application.

Volume (from constraints: Scale and Load Profile): 150,000 applications per year, about 12,500 per month, about 600 per working day.

## Current Model Pricing

Per million tokens, as of June 2026. Batch processing is 50 percent cheaper across all of these; prompt caching reduces repeated input further.

| Model | Input ($/M) | Output ($/M) |
|---|---|---|
| Claude Opus 4.8 | 5.00 | 25.00 |
| Claude Sonnet 4.6 | 3.00 | 15.00 |
| Claude Haiku 4.5 | 1.00 | 5.00 |
| OpenAI GPT-4o | 2.50 | 10.00 |
| OpenAI GPT-4o-mini | 0.15 | 0.60 |
| Google Gemini 2.5 Flash | 0.30 | 2.50 |

## Cost Per Application and Projections

At 5,000 input and 700 output tokens per application (2 full-res faces), standard pricing:

| Model | Per application | Daily (600) | Monthly (12,500) | Yearly (150,000) |
|---|---|---|---|---|
| Claude Opus 4.8 | $0.0425 | $25.50 | $531 | $6,375 |
| Claude Sonnet 4.6 (default) | $0.0255 | $15.30 | $319 | $3,825 |
| OpenAI GPT-4o | $0.0195 | $11.70 | $244 | $2,925 |
| Claude Haiku 4.5 | $0.0085 | $5.10 | $106 | $1,275 |
| Google Gemini 2.5 Flash | $0.0033 | $1.98 | $41 | $495 |
| OpenAI GPT-4o-mini | $0.0012 | $0.72 | $15 | $180 |

Even at the most expensive model and full national volume, inference is about $6,400 per year, and about $3,800 with the default Sonnet 4.6. These figures are roughly double the earlier per-label estimate, the combined effect of full-resolution images and two faces per application. Batch processing (the natural mode for the 200-to-300-application peak dumps) halves the batched share. Prompt caching trims a little more. The numbers are still small against 47 salaries, so the conclusion is unchanged.

## Prototype (Take-Home) Cost

Development uses the mock adapter for most work (zero cost). Assuming 500 live application calls across the whole take-home:

| Model | Cost for 500 calls |
|---|---|
| Claude Opus 4.8 | $21.25 |
| Claude Sonnet 4.6 (default) | $12.75 |
| OpenAI GPT-4o | $9.75 |
| Claude Haiku 4.5 | $4.25 |
| Google Gemini 2.5 Flash | $1.65 |
| OpenAI GPT-4o-mini | $0.60 |

Low-double-digit dollars at most for the entire prototype with the default model, inside the assumed $25 ceiling (assumption A31). Only the most expensive model approaches the ceiling, and the mock adapter keeps routine development free.

---

# Part B: Savings and Return

This is the reason the project exists. The cost side above is rounding error; the value is in agent time reclaimed.

## Current State: What Manual Review Costs Today

Agents review 150,000 applications a year by eye. From discovery, a simple application takes 5 to 10 minutes, longer when there are issues, and Sarah estimated that roughly half of an agent's day is spent on routine matching, the exact work this tool targets.

Assumptions for the model (each carries a sensitivity range later):
- Average handling time today: 8 minutes per application (a blended midpoint of the 5-to-10-minute range plus harder cases).
- Loaded labor cost: a TTB compliance agent maps to roughly federal GS-12, about $95,000 base salary with locality, which is about $46 per hour against 2,087 federal work hours. A fully loaded rate including benefits and overhead (roughly 1.4 times base) is about $64 per hour. Both are shown.

Current annual review labor:
- 150,000 applications times 8 minutes is 1,200,000 minutes, which is 20,000 agent hours per year spent on review.

## How the Tool Changes the Time

The system does not remove the approval; it removes the manual verification of the obvious matches and points agents straight at problems (see constraints: Review Model). Modeling the three lanes:
- Assume 75 percent of applications are clean, high-confidence matches. For these, the agent's task collapses from an 8-minute field-by-field check to roughly a 1-minute glance or bulk confirmation.
- Assume 25 percent are exceptions (mismatch or ambiguous). The agent still works these, but the tool highlights the specific issue, so time drops from about 8 minutes to about 5 minutes.

Resulting annual labor:
- Clean (112,500 applications): from 15,000 hours to about 1,875 hours.
- Exceptions (37,500 applications): from 5,000 hours to about 3,125 hours.
- Total: from 20,000 hours to about 5,000 hours.

Agent hours saved per year: about 15,000, which is an average of 6 minutes saved per application.

## What That Is Worth

| Measure | Value |
|---|---|
| Agent hours saved per year | about 15,000 |
| Equivalent full-time staff freed | about 7.2 FTE (of 47 agents, roughly 15 percent of capacity) |
| Annual value at base rate ($46/hr) | about $690,000 |
| Annual value at fully loaded rate ($64/hr) | about $960,000 |

The freed capacity can be read two ways: as a roughly $0.7M-to-$1M annual labor saving, or as about seven agents' worth of time redirected from data-entry verification to the complex judgment work that is currently being crowded out. Given the team shrank from over 100 agents to 47 while volume stayed high, recovering 15 percent of capacity is materially significant.

## Net Benefit

Annual operating cost (inference) is between about $1,275 and $6,375 depending on model, about $3,800 with the default Sonnet 4.6, plus minimal hosting. Set against $690,000 to $960,000 in labor value, the operating cost is well under one percent of the benefit. Build cost is a few weeks of one developer, recovered within the first few weeks of operation. The return is dominated entirely by labor; the technology is cheap.

## Sensitivity

Because the two biggest assumptions are average handling time and the loaded labor rate, here is the annual saving across a realistic range. Rows are minutes saved per application on average; columns are hourly cost.

| Avg minutes saved / application | At $46/hr | At $64/hr |
|---|---|---|
| 4 minutes (conservative) | $460,000 | $640,000 |
| 6 minutes (central case) | $690,000 | $960,000 |
| 8 minutes (optimistic) | $920,000 | $1,280,000 |

Even the most conservative corner, a modest 4 minutes saved at the base rate, is roughly $460,000 a year, hundreds of times the operating cost.

## Benefits Not Captured in the Dollar Figure

Several real gains do not appear in the labor math:
- Faster turnaround and backlog relief, especially during the peak-season import dumps that currently bottleneck the team.
- More consistent and complete checks, particularly on the government warning, where the tool applies the exact rule every time rather than relying on a tired human eye.
- Better catch rate on the violations applicants attempt to slip through, which is a compliance-quality gain, not just an efficiency one.
- Improved agent experience, shifting skilled staff away from drudgery toward judgment work.
- Capacity to absorb future volume growth without proportional hiring.

## Caveats

These are planning estimates, not a measured result. The realized saving depends on three things in particular: adoption (the tool only saves time if agents trust and use it, which is why the five-second latency and the clean accessible UI are non-negotiable), the agency's auto-clear policy (how much of the clean lane is bulk-confirmed versus still individually glanced), and real-world accuracy (a tool that misses problems or cries wolf erodes its own time savings). The labor model counts one verification per application regardless of face count; the cost model already accounts for the average of two faces per application, so applications with more faces raise inference cost (not labor saving) proportionally.

## Sources

Pricing and salary figures as of June 2026:
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [GS-12 Federal Pay Scale 2026 (FederalPay.org)](https://www.federalpay.org/gs/2026/GS-12)
