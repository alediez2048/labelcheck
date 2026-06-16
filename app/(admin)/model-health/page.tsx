/**
 * /model-health — the Improvement Cycle dashboard.
 *
 * Shows the five-stage loop from observability.md, the committed
 * eval baseline, the runtime self-healing knobs, the human-in-loop
 * tasks, and the roadmap. Read-only: this page reports on the
 * system's drift posture without mutating anything.
 */

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { AgreementRateWidget } from "@/components/feedback/AgreementRateWidget";

type CycleStage = {
  label: string;
  description: string;
  componentRef: string;
  status: "live" | "no-baseline";
  detail: string;
};

type ModelHealthResponse = {
  cycle: Record<string, CycleStage>;
  baseline: {
    version?: number;
    createdAt?: string;
    goldenSetVersion?: string;
    metrics: {
      falseNegativeRate: number | null;
      laneAccuracy: number | null;
      warningPresence: number | null;
      warningVerbatim: number | null;
      warningAllCaps: number | null;
      calibrationEce: number | null;
      latencyP95: number | null;
    };
    tolerances: Record<string, number> | null;
  } | null;
  selfHealing: ReadonlyArray<{
    label: string;
    mechanism: string;
    triggers: string;
    action: string;
  }>;
  humanInLoop: ReadonlyArray<{
    label: string;
    href: string | null;
    owner: string;
    description: string;
  }>;
  roadmap: ReadonlyArray<{
    label: string;
    status: "future" | "production";
    note: string;
  }>;
  runtime: {
    provider: string;
    hasAnthropicKey: boolean;
    longEdgeCap: number;
  };
};

const CYCLE_ORDER: ReadonlyArray<keyof ModelHealthResponse["cycle"]> = [
  "capture",
  "measure",
  "label",
  "gate",
  "choose",
];

function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return value.toFixed(digits);
}

export default function ModelHealthPage(): React.ReactElement {
  const [data, setData] = useState<ModelHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/model-health");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ModelHealthResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          Admin shell
        </p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Model health</h1>
        <p className="mt-1 text-sm text-muted">
          The Improvement Cycle: how the system stays honest as the model,
          prompts, and thresholds evolve.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-mismatch-line bg-mismatch-soft px-3 py-2 text-sm text-mismatch"
        >
          <span aria-hidden="true" className="mr-1 font-bold">
            ✕
          </span>
          {error}
        </p>
      )}

      {data === null && error === null && (
        <p className="text-sm text-muted">Loading model health…</p>
      )}

      {data !== null && (
        <>
          {/* Improvement Cycle visualization */}
          <section
            aria-labelledby="cycle-heading"
            className="rounded-panel border border-line bg-surface p-5 shadow-panel"
          >
            <h2 id="cycle-heading" className="text-base font-semibold text-ink">
              Improvement cycle
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Five stages from observability.md. The system surfaces signal;
              humans (and CI) act on it.
            </p>
            <ol className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
              {CYCLE_ORDER.map((key, idx) => {
                const stage = data.cycle[key];
                const live = stage.status === "live";
                return (
                  <li
                    key={key}
                    className={`relative rounded-[10px] border p-3 ${
                      live
                        ? "border-brand/30 bg-brand-soft"
                        : "border-review-line bg-review-soft"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          live ? "text-brand-ink" : "text-review"
                        }`}
                      >
                        Step {idx + 1}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          live ? "text-brand-ink" : "text-review"
                        }`}
                      >
                        {stage.componentRef}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-ink">
                      {stage.label}
                    </p>
                    <p className="mt-1 text-xs text-muted">{stage.description}</p>
                    <p className="mt-2 text-[11px] text-muted">{stage.detail}</p>
                    <span
                      className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        live
                          ? "border-match-line bg-match-soft text-match"
                          : "border-review-line bg-review-soft text-review"
                      }`}
                    >
                      <span aria-hidden="true">{live ? "✓" : "!"}</span>
                      <span>{live ? "Live" : "Needs baseline"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Live signals */}
          <section
            aria-labelledby="signals-heading"
            className="rounded-panel border border-line bg-surface p-5 shadow-panel"
          >
            <h2 id="signals-heading" className="text-base font-semibold text-ink">
              Live signals
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Drift indicators — refreshed continuously from the running queue
              and the committed baseline.
            </p>
            <div className="mt-4">
              <AgreementRateWidget />
            </div>

            {data.baseline && (
              <div className="mt-5 rounded-md border border-line p-4">
                <h3 className="text-sm font-semibold text-ink">
                  Committed eval baseline
                </h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  v{data.baseline.version} · created {data.baseline.createdAt} ·
                  golden-set version{" "}
                  <span className="font-mono">
                    {data.baseline.goldenSetVersion?.slice(0, 12)}…
                  </span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
                  <Metric
                    label="False-negative rate"
                    value={formatPercent(data.baseline.metrics.falseNegativeRate)}
                    tone="match"
                  />
                  <Metric
                    label="Lane accuracy"
                    value={formatPercent(data.baseline.metrics.laneAccuracy)}
                    tone="match"
                  />
                  <Metric
                    label="Warning presence"
                    value={formatPercent(data.baseline.metrics.warningPresence)}
                    tone="match"
                  />
                  <Metric
                    label="Warning verbatim"
                    value={formatPercent(data.baseline.metrics.warningVerbatim)}
                    tone="muted"
                  />
                  <Metric
                    label="Warning ALL CAPS"
                    value={formatPercent(data.baseline.metrics.warningAllCaps)}
                    tone="muted"
                  />
                  <Metric
                    label="Calibration ECE"
                    value={formatNumber(data.baseline.metrics.calibrationEce, 3)}
                    tone="muted"
                  />
                  <Metric
                    label="p95 latency"
                    value={
                      data.baseline.metrics.latencyP95 === null
                        ? "—"
                        : `${data.baseline.metrics.latencyP95.toFixed(2)} ms`
                    }
                    tone="match"
                  />
                  <Metric
                    label="Provider"
                    value={data.runtime.provider}
                    tone="muted"
                  />
                </dl>
              </div>
            )}
          </section>

          {/* Self-healing strategies */}
          <section
            aria-labelledby="selfheal-heading"
            className="rounded-panel border border-line bg-surface p-5 shadow-panel"
          >
            <h2 id="selfheal-heading" className="text-base font-semibold text-ink">
              Self-healing in the runtime
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Mechanisms the system applies automatically — no human required.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {data.selfHealing.map((s) => (
                <li
                  key={s.label}
                  className="rounded-[10px] border border-line p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {s.label}
                    </span>
                    <span className="rounded-full border border-match-line bg-match-soft px-2 py-0.5 text-[10px] font-semibold text-match">
                      ✓ Auto
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium text-ink">Mechanism:</span>{" "}
                    {s.mechanism}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium text-ink">Triggers on:</span>{" "}
                    {s.triggers}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium text-ink">Action:</span>{" "}
                    {s.action}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Human-in-loop tasks */}
          <section
            aria-labelledby="human-heading"
            className="rounded-panel border border-line bg-surface p-5 shadow-panel"
          >
            <h2 id="human-heading" className="text-base font-semibold text-ink">
              Human-in-loop tasks
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Deliberate decisions the system surfaces but does not automate.
              Every one is gated by CI eval before it ships.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {data.humanInLoop.map((h) => (
                <li
                  key={h.label}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-[10px] border border-line p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{h.label}</p>
                    <p className="mt-1 text-xs text-muted">{h.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-line bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-muted">
                      {h.owner}
                    </span>
                    {h.href !== null && (
                      <Link
                        href={h.href}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-brand bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-ink"
                      >
                        Open
                        <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Roadmap */}
          <section
            aria-labelledby="roadmap-heading"
            className="rounded-panel border border-line bg-surface p-5 shadow-panel"
          >
            <h2 id="roadmap-heading" className="text-base font-semibold text-ink">
              What's next
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Not yet automated. Production posture for the FedRAMP migration.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {data.roadmap.map((r) => (
                <li
                  key={r.label}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-[10px] border border-line p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{r.label}</p>
                    <p className="mt-1 text-xs text-muted">{r.note}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      r.status === "production"
                        ? "border-mismatch-line bg-mismatch-soft text-mismatch"
                        : "border-review-line bg-review-soft text-review"
                    }`}
                  >
                    {r.status === "production" ? "Phase 6" : "Future"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "match" | "muted";
}): React.ReactElement {
  return (
    <div className="rounded-md border border-line bg-slate-50 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono text-base font-bold ${
          tone === "match" ? "text-match" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
