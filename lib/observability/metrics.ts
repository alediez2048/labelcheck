/**
 * OpenTelemetry metric instruments (P5-1).
 *
 * The headline counters and latency histograms for the per-system view
 * in observability.md ("request rate, error and timeout rate by
 * provider, p50 and p95 latency, lane and confidence distributions").
 *
 * Instrument names follow OTel semantic-convention shape where one
 * exists; otherwise `labelcheck.<surface>.<measurement>` so a backend
 * tail can group by surface. Units are documented per instrument.
 *
 * All instruments are created lazily on first read so importing this
 * module is cheap and side-effect-free until the surrounding code
 * actually emits a measurement.
 */

import type { Counter, Histogram } from "@opentelemetry/api";

import { getMeter } from "./tracing";

type LazyInstrument<T> = () => T;

function lazy<T>(factory: () => T): LazyInstrument<T> {
  let value: T | null = null;
  return () => {
    if (value === null) value = factory();
    return value;
  };
}

/**
 * Total verification requests served (success + failure). Tagged by
 * outcome (`ok` / `degraded` / `unreadable` / `error`) at call time.
 */
const verificationRequests = lazy(() =>
  getMeter().createCounter("labelcheck.verification.requests", {
    description: "Total verification requests served, tagged by outcome.",
    unit: "{request}",
  }),
);

/**
 * End-to-end verification latency. The histogram's bucket layout is
 * picked by the SDK default — the NFR-1 p95 is computed from this
 * downstream (Prometheus / Langfuse / Phoenix) rather than from a
 * pre-bucketed gauge.
 */
const verificationLatency = lazy(() =>
  getMeter().createHistogram("labelcheck.verification.duration", {
    description:
      "End-to-end verification request latency. Measured against the 5s p95 budget (NFR-1).",
    unit: "ms",
  }),
);

/**
 * Lane distribution — one increment per verification, tagged by lane.
 * The backend rolls this up into the lane-distribution drift dashboard
 * (observability.md: Online monitoring).
 */
const verificationLane = lazy(() =>
  getMeter().createCounter("labelcheck.verification.lane", {
    description:
      "Verification lane assignments. Tagged by the final lane attribute.",
    unit: "{request}",
  }),
);

/** Total assistant turns served, tagged by role. */
const assistantTurns = lazy(() =>
  getMeter().createCounter("labelcheck.assistant.turns", {
    description: "Total assistant turns served, tagged by role.",
    unit: "{turn}",
  }),
);

/** Per-turn latency for the assistant. Headline 3s budget. */
const assistantLatency = lazy(() =>
  getMeter().createHistogram("labelcheck.assistant.duration", {
    description: "End-to-end assistant turn latency. 3s p95 budget.",
    unit: "ms",
  }),
);

/**
 * Refusal counter — tagged by `refusal_template` so the backend can
 * surface refusal-rate spikes (the assistant guardrail signal in
 * observability.md).
 */
const assistantRefusals = lazy(() =>
  getMeter().createCounter("labelcheck.assistant.refusals", {
    description: "Assistant refusals, tagged by refusal_template.",
    unit: "{refusal}",
  }),
);

// Public surfaces. Callers use `verificationRequestsCounter` etc. as
// stable handles; the lazy-creation indirection stays internal so the
// call sites are clean.
export const verificationRequestsCounter: { add: Counter["add"] } = {
  add: (...args) => verificationRequests().add(...args),
};
export const verificationLatencyHistogram: { record: Histogram["record"] } = {
  record: (...args) => verificationLatency().record(...args),
};
export const verificationLaneCounter: { add: Counter["add"] } = {
  add: (...args) => verificationLane().add(...args),
};
export const assistantTurnsCounter: { add: Counter["add"] } = {
  add: (...args) => assistantTurns().add(...args),
};
export const assistantLatencyHistogram: { record: Histogram["record"] } = {
  record: (...args) => assistantLatency().record(...args),
};
export const assistantRefusalCounter: { add: Counter["add"] } = {
  add: (...args) => assistantRefusals().add(...args),
};
