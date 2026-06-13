# Observability and Evaluation Framework

Status: draft for review
Owner: solo developer
Last updated: 2026-06-12

This document defines how we measure and improve the two AI components of the product: the label verification (image-to-text extraction plus matching and triage) and the chat assistant. It covers the tooling stack, what we instrument, the offline and online evaluations, the feedback loops that turn real usage into ground truth, and the privacy posture. The goal is a system that does not just run AI, but knows how well its AI is doing and gets better over time.

## Why This Matters Here

Two facts make evaluation central rather than optional. First, this is a compliance tool: a missed mismatch (a false negative) can let a non-compliant label through, so we must measure that error rate specifically, not just aggregate accuracy. Second, the value case depends on trust and adoption (business.md): agents only keep using the tool if it is right often enough, and we can only claim time savings if the triage is accurate. Observability is how we earn and defend both.

A note we have carried throughout: the requirements never fixed an accuracy bar (an open item flagged for the stakeholders). This framework is where that bar gets set, measured, and enforced.

## Tooling Stack

Decision: a self-hostable, OpenTelemetry-based stack, chosen so it can run inside the agency's Azure FedRAMP boundary in production. The same constraint that forbids calling public model APIs in production (assumption A21; systemsdesign: Production Evolution Path) forbids shipping prompts, traces, and PII to an external observability SaaS. So we avoid cloud-only tools (LangSmith, Datadog LLM) for the production design, while noting they would be fine for the prototype alone.

- Instrumentation standard: OpenTelemetry (OTel). Every AI call emits a trace span with attributes; OTel is vendor-neutral so the backend can change without re-instrumenting.
- LLM observability backend: a self-hosted Langfuse or Arize Phoenix instance. Both are open-source, OTel-compatible, and provide trace exploration, prompt and model version tracking, dataset and experiment management, online scoring, and human annotation queues.
- System metrics and alerting: OTel metrics exported to Prometheus, dashboards and alerts in Grafana, for latency, error rates, throughput, and drift.
- Eval datasets and runs: versioned golden datasets stored with the backend (or in the repo), executed by an eval runner that can gate changes in CI.
- Product metrics: the metric_rollup tables already in schema.md feed business and operational dashboards.

Prototype reality: the prototype runs a lightweight version, structured OTel logging, a small local eval harness over the golden set, an LLM-as-judge for the assistant, and capture of agent corrections, without standing up the full Langfuse and Grafana deployment. The interfaces are the same so the production stack drops in behind them.

## What We Instrument

Every AI interaction emits a trace, with PII redacted (see Privacy). 

Per verification span: application id (internal, not applicant PII), model name and version, prompt version, image token count and resolution, end-to-end latency and the model-call latency separately, the raw per-field extraction, each per-field verdict and its code-derived confidence, the assigned lane, and any retry or timeout. This lets us reconstruct exactly what the model saw and why the code decided as it did.

Per assistant turn: the user's question, the retrieved help or data context, the prompt, the response, latency, token counts, the role (for scope checks), and any user feedback. Grounding context is captured so we can tell whether a wrong answer came from bad retrieval or bad generation.

Per system: request rate, error and timeout rates by provider, p50 and p95 latency against the five-second budget, and lane and confidence distributions over time.

## Component A: Label Verification Evaluation

### Production model bake-off (how the model gets chosen)

Before any in-boundary model is committed to production, it is selected by a bake-off on real TTB label samples, not public benchmarks. TTB labels are graphic-design-heavy and not clean forms, so public OCR leaderboards do not predict performance here. The bake-off runs the candidate models documented in techstack.md (Azure OpenAI vision in Azure Government as the recommended path; olmOCR self-hosted as the air-gapped fallback; GLM-OCR or Qwen2.5-VL pending security review) against the golden set below, with the same metrics, on the same hardware profile, in the same adapter shape. The winner is whichever model meets the false-negative-rate bar (the safety metric defined below) and the five-second p95 budget under representative load. The bake-off result is the artifact that justifies the production model choice to the agency, not a benchmark citation.

### Offline evaluation (the golden set)

The golden dataset is the acceptance-criteria test set made rigorous: real approved pairs from the Public COLA Registry for the passing cases, and synthesized defects for the failing cases (assumptions A24 to A26; requirements AC-1 to AC-10). Every item has a known correct answer per field and a known correct lane.

Metrics computed against it:
- Per-field precision and recall for each field (brand, type, ABV, net contents, producer, origin, warning).
- Lane classification accuracy, with a confusion matrix.
- False-negative rate on real mismatches: the primary safety metric. How often does a genuinely non-compliant label get cleared into the match lane? This is weighted above overall accuracy because it is the costly error.
- Government-warning check accuracy specifically, since it is the highest-stakes field, including the caps and bold cases.
- Confidence calibration: does the code-derived confidence actually track correctness? Measured with a calibration curve and expected calibration error, so the lane thresholds can be tuned on evidence rather than guesswork (this validates decision D5).
- Latency distribution against the five-second budget (validates A12, especially at full resolution).

### The agent-correction feedback loop (the killer signal)

The single most valuable eval asset is free and continuous: the agent's disposition is ground truth. Every time an agent overrides the tool, approving something it flagged, or flagging and returning something it cleared, that is a labeled example produced by an expert in the normal course of work. We capture the agreement (or disagreement) between the tool's lane and the agent's disposition as a first-class metric and as a growing real-world eval set.

This drives improvement three ways: it surfaces systematic errors (a field the tool keeps getting wrong), it provides the data to retune confidence thresholds, and it builds, over time, a domain-specific labeled corpus that could support a future fine-tuned or in-boundary model. Disagreements are sampled into a review queue for the team to confirm, which also catches agent error, not just tool error.

### Online monitoring

Run continuously in production: lane distribution drift (a sudden shift in the match rate often means a model regression or a new applicant trick), confidence distribution drift, per-field mismatch-rate trends (a spike in warning failures may be a real fraud pattern worth alerting compliance to), provider error and timeout rates, the rate of needs-a-better-image outcomes (an input-quality signal), and p95 latency alerts on the five-second budget.

## Component B: Chat Assistant Evaluation

The assistant is read-only (answers, onboarding, role-scoped summaries, best practices), which narrows what can go wrong but raises the bar on two things: it must not invent compliance rules, and it must never leak another user's data.

### Offline evaluation

A curated question set spanning the assistant's jobs: stats summaries, how-it-works explanations, disposition questions, onboarding, and best-practice questions, each with a reference answer or rubric. Evaluated by:
- LLM-as-judge (a self-hostable judge model, in-boundary) scoring helpfulness, faithfulness to the source material, and groundedness. Groundedness is paramount: the assistant must answer from the product's help content and the user's actual data, not from the model's general priors, because a confidently wrong compliance claim is worse than no answer.
- Retrieval quality: for questions that need a document or a data lookup, did it retrieve the right source? Poor retrieval is a common root cause of wrong answers, so it is measured separately from generation.

### Guardrail and safety evals

These are pass/fail, not graded:
- Role-scope isolation: an agent asking for stats must only ever receive their own numbers, never another agent's or the division's restricted views. The acceptable leak rate is zero. This is a security eval, not just a quality one (ties to D16 row-level access).
- Out-of-scope refusal: the assistant declines to give legal advice, to make or recommend a specific disposition on a real application, or to take any action, and points the user to the human process. It explains and summarizes; it does not decide.
- No fabricated rules: when unsure about a regulatory detail, it says so rather than inventing one.

### Online monitoring

Thumbs up and down on each response (the simplest, highest-signal feedback), resolution and escalation signals (did the user get what they needed or fall back to a human), latency, and token cost. Thumbs-down responses are sampled into a triage queue and traced back to a retrieval or a generation fault.

## The Improvement Cycle

Observability is only useful if it closes a loop. The cadence:

1. Capture: every verification and every assistant turn is traced; agent corrections and chat feedback are logged as labeled signals.
2. Measure: scheduled eval runs over the golden sets and the accumulated real-world examples produce the metrics above.
3. Gate: a change to a prompt, a model, a threshold, or the retrieval setup must not regress the golden set. Eval runs act as a CI gate, the same way unit tests gate code (this is why the matching logic is testable by design, D4).
4. Alert: drift and guardrail breaches page the owner.
5. Improve: systematic errors feed threshold tuning, prompt changes, retrieval fixes, and the data for a future in-boundary or fine-tuned model.

## Key Metrics at a Glance

Verification, primary and guardrail:
- False-negative rate on real mismatches (safety, minimize).
- Tool-versus-agent agreement rate (the live accuracy proxy).
- Government-warning check accuracy.
- Confidence calibration error.
- p95 verification latency against five seconds.

Assistant, primary and guardrail:
- Groundedness and helpfulness (judge plus thumbs).
- Role-scope leak rate (must be zero).
- Out-of-scope refusal correctness.
- Response latency.

## Privacy and Compliance of the Observability Itself

The observability layer handles the same sensitive data as the product, so it inherits the same rules. Traces redact or hash applicant PII rather than storing it raw. The whole stack runs in-boundary in production (no external SaaS). Access to traces and eval data is role-controlled and itself audited (ties to the audit_event table in schema.md). Retention follows the same records schedule as the product data. The prototype, consistent with the rest of the system, persists nothing sensitive (NFR-4; constraints: Compliance).

## Prototype vs Production

Prototype: structured OTel-style logging to the console or a local file, a runnable eval harness over the golden set with the verification metrics, an LLM-as-judge script for the assistant question set, the guardrail and role-scope checks as assertions, and capture of simulated agent corrections. Enough to demonstrate the method and produce real numbers, without operating a platform.

Production: the full self-hosted Langfuse or Phoenix plus OTel plus Prometheus and Grafana, CI eval gates on every change, the live agent-correction pipeline feeding threshold tuning, and drift and guardrail alerting. All inside the FedRAMP boundary.

## Open Items

- The accuracy bar itself: what false-negative rate and what tool-agent agreement rate are acceptable? This needs a stakeholder decision; observability is how it is then enforced.
- The golden set depends on the still-open verbatim warning text (assumption A18) and the confirmed beverage-type scope (assumption A10).
- The choice between Langfuse and Arize Phoenix for the production backend (both fit; a shallow proof-of-concept would decide).
