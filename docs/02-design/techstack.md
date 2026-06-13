# Technology Stack: AI-Powered Alcohol Label Verification

Status: draft for review
Owner: solo developer
Last updated: 2026-06-10

This document records the concrete technology choices, the reasoning behind each, the alternatives considered, and the trade-offs accepted. Every choice is justified against the same four pressures that dominate this project: a solo developer, a roughly one-week build, a hard five-second latency budget, and a regulated domain that rewards boring, maintainable, swappable parts. The structural design these choices serve is in systemsdesign.md.

## Summary

Language: TypeScript across the whole app.
Runtime: Node.js.
Frontend: React with Next.js (App Router), styled with Tailwind CSS.
Backend: Next.js Route Handlers for the API, with an in-process bounded-concurrency queue for batch.
Vision model: a hosted multimodal model behind a provider adapter, default Claude Sonnet 4.6 (locked in grill decision D8), documented alternative OpenAI GPT-4o, plus a mock adapter for offline development and tests. One call per application carries all its label faces (D14).
Image preprocessing: sharp.
Input validation: Zod.
Matching: custom per-field logic with a small string-distance library for fuzzy fields.
Configuration: plain data files for the prototype (the warning text, tolerances, per-type field rules); replaced by the versioned rule_config table in production (schema.md).
Testing: Vitest for the matching and triage logic.
Hosting: a single always-warm container on Render (Railway or Fly as equivalents).
Access control: a shared-passcode gate as a spend shield, not real security.
Tooling: pnpm, TypeScript in strict mode, ESLint, Prettier.

## Language and Runtime

Choice: TypeScript on Node.js, one language for both client and server.

Why: A solo developer benefits enormously from a single language and a single toolchain. One mental model, one dependency manager, shared types between the API response and the React client so the per-field result contract cannot drift. TypeScript's static types are also a quiet correctness aid in the matching logic, where a wrong field name would otherwise fail silently.

Alternative considered: a Python backend (FastAPI) with a separate React frontend. Python is the default for anything ML-flavored and has excellent image libraries. It was rejected because the project does no model training or numerical ML; it calls a hosted model over HTTP, which any language does equally well. Splitting into two languages and two deploys adds context-switching and a second runtime for no benefit at this scope. The trade-off accepted: if the project later needed heavy local image processing or a self-hosted model, Python would become more attractive, and the provider-adapter seam is where that boundary would be redrawn.

## Frontend

Choice: React via Next.js (App Router), with Tailwind CSS for styling.

Why: React is the mainstream, well-documented choice, which matters for a solo developer who cannot afford to be blocked on niche framework knowledge (see constraints: Team Constraints). Next.js gives a unified full-stack project so the UI and the API live in one repo with one deploy, which is the fastest path to a working prototype in a week. Tailwind makes a clean, large-target, accessible layout quick to build without hand-maintaining a stylesheet, supporting the accessibility-first requirement (NFR-2).

On rendering: this is an interactive internal tool with no SEO need, so server-side rendering is not leaned on. Pages are largely client-rendered around the upload-and-result interaction. Next.js is used for its project structure and routing, not its SSR.

Alternative considered: a plain Vite React single-page app with a separate backend. It is lighter, but it reintroduces the two-deploys problem and gives up the shared-types convenience. Rejected for cohesion. Trade-off accepted: Next.js carries more framework surface than a bare SPA needs, which is a small maintainability cost paid for development speed.

Accessibility note: the result UI conveys status with color, icon, and text together, never color alone, which is both a requirement (FR-22) and the reason no color-only component library shortcut is taken.

## Backend and Batch

Choice: Next.js Route Handlers for the synchronous API, and an in-process queue with a fixed concurrency limit for batch.

Why: The synchronous verify endpoint does little orchestration, so a heavy backend framework is unwarranted. Route handlers keep it in the same project and deploy. For batch, the load profile is low sustained throughput with rare large bursts (see constraints: Scale and Load Profile), which a simple in-process bounded-concurrency queue handles well: it caps the number of simultaneous model calls, self-throttling against provider rate limits and the cost ceiling. A library such as p-limit provides the bounded concurrency without standing up external infrastructure.

Alternative considered: a dedicated job system (a message queue plus worker, or a managed queue service). Rejected as over-engineering for a prototype whose batch state is intentionally ephemeral (systemsdesign D2); it would add operational weight a solo build cannot justify. Trade-off accepted: in-process batch state is lost on restart, which is documented and acceptable now, with SQLite as the named upgrade if persistence is later required.

## Vision Model

Choice: a hosted multimodal model accessed through a narrow provider adapter. Default is Claude Sonnet 4.6 (locked in grill decision D8 as the accuracy-safe option); OpenAI GPT-4o is documented as a drop-in alternative; a mock adapter serves offline development and tests. A single call per application carries all of its label faces (D14), and the model returns transcribed text only, with the code making every verdict (D4).

Why: A single multimodal model does the entire hard part, reading the label, extracting fields, and coping with imperfect images, in one call, which is exactly what the five-second budget needs (one call, no multi-stage pipeline). Both Claude and GPT-4o can return structured output against a requested schema and both handle photographed labels with mild skew and glare, so the choice between them is a matter of cost, latency, and access rather than capability. Putting them behind an adapter (systemsdesign: Vision provider adapter) means the decision is reversible with a config change and a small adapter file, which is the right way to treat an external dependency in a regulated domain where the eventual production model will be different anyway (assumption A21).

The mock adapter matters more than it looks: it lets the whole system run, and the matching and triage logic be unit-tested, with no API key, no network, and no spend. That keeps day-to-day development inside the cost ceiling and makes tests deterministic.

Alternative considered: a traditional OCR engine such as Tesseract plus hand-written parsing. Rejected as the primary because it is markedly weaker on real-world photos (angle, glare, lighting), which is a stated need (FR-6, assumption A13), and because parsing free-form label text into fields is brittle. It remains a possible future component for an in-boundary deployment where external models are blocked, and the adapter seam is where it would slot in. Trade-off accepted: depending on a hosted model means per-call cost and an external dependency, mitigated by the single-endpoint design and the documented in-boundary migration path.

The API key is provided through environment configuration and never committed. Without a key, the system runs against the mock adapter.

## Model Selection and the In-Boundary Production Path

The prototype calls a public model API, but production cannot: the agency firewall blocks external ML endpoints, the failure that killed the prior vendor (assumption A21; systemsdesign: Production Evolution Path). The adapter seam isolates the swap; the real decision is which in-boundary model goes behind it. Two clean paths are documented; the recommendation depends on whether "inside the agency's network" means the Azure Government tenant (a managed but in-boundary FedRAMP-authorized service) or literally air-gapped on agency hardware.

Path one, the recommended production answer: **Azure OpenAI vision (GPT-4o family) inside Azure Government**. Azure OpenAI is authorized at FedRAMP High in Azure Government, and at DoD Impact Levels 4 and 5. Azure's Document Intelligence sits in the same scope. The model runs inside the agency's authorized boundary, from a US vendor, with no external endpoint — the elegant resolution to the firewall constraint that killed the prior vendor. This is the strongest, most defensible production answer for a Treasury bureau already on Azure FedRAMP.

Path two, the air-gapped fallback for zero external dependency: **self-host an open OCR-VL model on agency GPUs**. For provenance comfort and full auditability, the lead candidate is **olmOCR** (Allen Institute for AI, US non-profit, Apache 2.0, with fully open weights, training data, and code). For top accuracy, GLM-OCR (MIT, ~0.9B parameters) and Qwen2.5-VL (~7B) lead public benchmarks, but they are Chinese-origin (Zhipu AI and Alibaba respectively, alongside Baidu's PaddleOCR and the Shanghai-lab InternVL); proposing them for a US Treasury system raises a procurement and security-review flag even when the weights are openly licensed. They remain viable pending that review, but olmOCR is the provenance-safe pick to lead with.

Why a VLM and not a plain OCR engine: the hardest LabelCheck check is the government warning's presence, verbatim wording, ALL CAPS, and bold. A vision-language model handles styling cues better than a text-extraction engine, which is a positive selection signal for either path above. These models are also small (sub-1B to 7B parameters) and cheap to serve on modest hardware, which is a selling point, not a cost, for an in-boundary deployment.

How the choice gets made: the production model is selected by a bake-off on actual TTB label samples, not public benchmarks. TTB labels are graphic-design-heavy, not clean forms; public OCR benchmarks do not predict performance here. The bake-off lives in observability.md.

Stakeholder framing rule: lead with Azure-in-boundary as the production answer (already authorized, US vendor, no provenance question), present self-hosting as the air-gap option with olmOCR as the provenance-safe lead, and never walk into a Treasury room headlining a Chinese-origin model. This is what makes the production story credible to a federal audience.

## Image Preprocessing

Choice: sharp, run in memory on the server before the model call. Used for orientation normalization and for capping at the provider's maximum usable resolution, not for aggressive downscaling.

Why: This choice was sharpened in the grill session (systemsdesign D7). The government warning is the smallest and highest-stakes text on a label, so the image must not be shrunk below what keeps that text legible. Images are therefore sent at the provider's maximum usable resolution (around 1568px on the long edge for Claude) with no downscaling below it. We still cap at that ceiling because the provider resizes anything larger internally, so uploading more only wastes latency and tokens for detail the model never sees. sharp also normalizes orientation from EXIF, which helps reads of slightly rotated photos, and runs in memory to keep with the no-persistence rule (NFR-4). If the warning region returns low confidence, a targeted high-resolution re-read of just that cropped region is performed.

Alternative considered: aggressive downscaling for speed. Rejected because it risks rendering the warning illegible, which is the opposite of the priority order. Alternative also considered: sending the raw image completely untouched. Rejected because the provider resizes it internally anyway, so it incurs upload-latency and token cost with no quality gain over capping at the usable maximum. Trade-off accepted: capping at the provider maximum, rather than a smaller size, costs a little more latency and tokens per call than aggressive downscaling would, which is the right price for protecting the warning check.

## Input Validation

Choice: Zod schemas at the API boundary.

Why: Form input varies by beverage type (FR-3), and bad or incomplete input should be rejected with a clear message rather than flowing into the pipeline. Zod validates and normalizes input and, being TypeScript-native, the same schema produces the types used downstream, so the contract is defined once. This directly supports the clean-error-handling requirement.

Alternative considered: manual validation. Rejected as more error-prone and less self-documenting.

## Matching Logic

Choice: custom per-field comparison functions, using a small string-distance library (such as fastest-levenshtein) for the fuzzy fields and custom normalization for units.

Why: The matching engine is the correctness core and the part most worth owning outright rather than delegating to a model (systemsdesign: Matching engine). Brand and class/type need case, punctuation, and spacing normalization plus a similarity threshold so "STONE'S THROW" matches "Stone's Throw" while genuine differences still flag (FR-8). Alcohol content and net contents need unit-aware normalization then exact comparison (FR-9, FR-10). The government warning needs verbatim comparison against configured text plus a styling check (FR-11). These are precise, testable rules, and keeping them as plain code with thresholds in configuration makes them inspectable by a compliance reviewer and covered by unit tests (NFR-6).

Alternative considered: asking the vision model to also judge whether each field matches. Rejected because it makes correctness opaque and untestable, removes the ability to tune tolerances in config, and ties regulatory judgment to a model's discretion. The model reads; the code decides. Trade-off accepted: writing and tuning the rules by hand is more work than offloading them, but it is the right place to spend effort.

## Configuration

Choice: plain data files for the prototype, holding the canonical government warning text, the per-field match tolerances, and the per-beverage-type field requirements. In production these move into the versioned rule_config table (schema.md) without changing the reviewer's editing surface.

Why: FR-25 requires these to be data, not buried in code, so they can be reviewed and adjusted without a developer. Keeping them as simple files also makes the riskiest piece, the exact warning text (assumption A18), a one-place edit when the verbatim wording is pinned.

## Testing

Choice: Vitest, focused on the matching and triage logic, run against the mock adapter.

Why: The acceptance criteria (requirements: AC-1 through AC-10) are mostly assertions about matching and lane outcomes, which are pure functions over known inputs and therefore cheap and reliable to unit-test. Testing here catches the regressions that would otherwise be silent and dangerous in a verification tool. Vitest fits the TypeScript and Vite-adjacent toolchain with minimal setup.

Alternative considered: broad end-to-end UI testing. Treated as a Could, not a Must, given the one-week solo budget; one happy-path end-to-end check is worthwhile, but the depth goes into the logic tests where correctness actually lives.

## Hosting

Choice: a single always-warm container web service on Render (Railway or Fly as direct equivalents).

Why: The latency budget forbids per-request cold starts (see constraints: Cold start tolerance), and the batch worker wants to be long-lived, both of which a persistent container satisfies and pure serverless complicates. A single managed service keeps operations near zero for a solo developer and hosting cost near zero at this traffic, fitting the budget. One service hosts the UI, the sync API, and the in-process batch worker together.

Alternative considered: Vercel serverless. Excellent for the Next.js frontend and trivial single-label requests, but its function timeouts and cold-start behavior make the long-running batch path awkward, and keeping a warm path is harder. Rejected for cohesion with the batch design, though it remains a fine option if batch were dropped. Trade-off accepted: a container is marginally more setup than a push-to-deploy serverless flow, in exchange for predictable latency and a clean batch model.

## Access Control

Choice: a shared-passcode gate implemented as lightweight middleware, configured by environment variable.

Why: The deployed prototype sits in front of a paid model endpoint, so an open URL is a spend risk against the budget ceiling. A single shared passcode removes that risk with near-zero effort. It is explicitly a spend shield, not a security control (NFR-8); real identity is a production concern (PIV/CAC, SSO) documented in systemsdesign.

## Developer Tooling

Choice: pnpm for dependency management, TypeScript in strict mode, ESLint and Prettier for consistency. Secrets via environment variables in a local .env that is never committed; the README documents required variables.

Why: Mainstream, low-friction tools that a future maintainer will already know, consistent with the maintainability and team constraints. Strict TypeScript and linting catch a class of mistakes for free, which is leverage a solo developer should take.

## How the Stack Maps to the Constraints

Solo developer: one language, one repo, one deploy, mainstream tools, no custom infrastructure.
One-week build: full-stack Next.js and a hosted model remove the two largest time sinks, a separate frontend-backend split and any model engineering.
Five-second latency: one model call per application (all faces in a single round trip), full-usable-resolution images rather than downscaling, an always-warm host, and an approximately eight-second request timeout that degrades gracefully with one retry.
Maintainability and a regulated domain: the vision model behind a swappable adapter, the matching rules as inspectable code with configuration-driven tolerances, a mock adapter for testable correctness, and no persistence to govern.
