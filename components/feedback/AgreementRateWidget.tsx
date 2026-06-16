/**
 * AgreementRateWidget — live tool-vs-agent agreement rate (P5-3).
 *
 * The killer signal called out in observability.md: every disposition
 * is implicit ground truth, and the gap between the tool's predicted
 * lane and the agent's effective lane is the live accuracy proxy. This
 * widget surfaces that number where the supervisor already looks — at
 * the top of Operations — so the rate is part of the day's heartbeat,
 * not a hidden dashboard.
 *
 * Why chained timeouts, not setInterval: a slow response stacking on
 * top of the previous tick would burn the dev server in a demo; we wait
 * for resolution (success or failure) before scheduling the next fetch.
 * Why three views (rolling / all-time / per beverage type): rolling
 * shows the live trend, all-time anchors against history, and the
 * per-beverage-type breakdown is where a specialization-specific
 * weakness surfaces (FR-28 / D15).
 *
 * Color is paired with a glyph and the percentage text on every cell so
 * the signal never depends on color alone (NFR-2, AC-9).
 */

"use client";

import React, { useEffect, useRef, useState } from "react";

import type {
  FeedbackAgreementResponse,
  FeedbackBeverageType,
} from "./types";

const POLL_INTERVAL_MS = 10_000;

const BEVERAGE_LABELS: Readonly<Record<FeedbackBeverageType, string>> = {
  wine: "Wine",
  distilled_spirits: "Spirits",
  malt_beverage: "Malt",
};

type Tone = "good" | "warn" | "bad";

type ToneTreatment = {
  glyph: string;
  glyphLabel: string;
  cardClass: string;
  numberClass: string;
  chipClass: string;
};

const TONES: Readonly<Record<Tone, ToneTreatment>> = {
  good: {
    glyph: "↑",
    glyphLabel: "up arrow",
    cardClass: "border-emerald-300 bg-emerald-50",
    numberClass: "text-emerald-900",
    chipClass: "border-emerald-300 bg-emerald-100 text-emerald-900",
  },
  warn: {
    glyph: "–",
    glyphLabel: "level dash",
    cardClass: "border-amber-300 bg-amber-50",
    numberClass: "text-amber-900",
    chipClass: "border-amber-300 bg-amber-100 text-amber-900",
  },
  bad: {
    glyph: "↓",
    glyphLabel: "down arrow",
    cardClass: "border-rose-300 bg-rose-50",
    numberClass: "text-rose-900",
    chipClass: "border-rose-300 bg-rose-100 text-rose-900",
  },
};

function toneFor(agreementRate: number): Tone {
  if (agreementRate >= 0.85) return "good";
  if (agreementRate >= 0.65) return "warn";
  return "bad";
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function AgreementRateWidget(): React.ReactElement {
  const [data, setData] = useState<FeedbackAgreementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    async function tick(): Promise<void> {
      try {
        const res = await fetch("/api/feedback/agreement", {
          headers: { accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as FeedbackAgreementResponse;
        if (!mountedRef.current) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!mountedRef.current) return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(`Could not load agreement rate: ${msg}`);
      } finally {
        if (mountedRef.current) {
          timerRef.current = setTimeout(() => {
            void tick();
          }, POLL_INTERVAL_MS);
        }
      }
    }

    void tick();

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <section
      aria-labelledby="agreement-rate-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="border-b border-slate-100 pb-3">
        <h2
          id="agreement-rate-heading"
          className="text-base font-semibold text-slate-800"
        >
          Tool-vs-agent agreement
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          When agents disagree, the team confirms who was right.
        </p>
      </header>

      {error !== null && data === null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="mr-1 font-bold">
            ✕
          </span>
          {error}
        </p>
      )}

      {data === null && error === null && (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      )}

      {data !== null && data.allTime.sampleSize === 0 && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          No dispositions recorded yet. Once agents start approving and
          returning, this number will show how often the tool agreed with
          their call.
        </p>
      )}

      {data !== null && data.allTime.sampleSize > 0 && (
        <AgreementBody data={data} />
      )}
    </section>
  );
}

function AgreementBody({
  data,
}: {
  data: FeedbackAgreementResponse;
}): React.ReactElement {
  const rollingTone = TONES[toneFor(data.rolling.agreementRate)];
  const allTimeTone = TONES[toneFor(data.allTime.agreementRate)];

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <KpiCard
        title={`Rolling (last ${data.rolling.windowSize})`}
        rate={data.rolling.agreementRate}
        toneTreatment={rollingTone}
        caption={`N = ${data.rolling.windowSize}, ${data.rolling.sampleSize} record${
          data.rolling.sampleSize === 1 ? "" : "s"
        }`}
      />
      <KpiCard
        title="All time"
        rate={data.allTime.agreementRate}
        toneTreatment={allTimeTone}
        caption={`${data.allTime.sampleSize} record${
          data.allTime.sampleSize === 1 ? "" : "s"
        }`}
      />
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          By beverage type
        </p>
        {data.byBeverageType.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No samples yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.byBeverageType.map((b) => {
              const t = TONES[toneFor(b.agreementRate)];
              return (
                <li key={b.beverageType}>
                  <span
                    aria-label={`${BEVERAGE_LABELS[b.beverageType]} agreement: ${formatPercent(
                      b.agreementRate,
                    )} over ${b.sampleSize} samples`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.chipClass}`}
                  >
                    <span aria-label={t.glyphLabel}>{t.glyph}</span>
                    <span>
                      {BEVERAGE_LABELS[b.beverageType]}:{" "}
                      {formatPercent(b.agreementRate)}
                    </span>
                    <span className="font-mono text-[10px] opacity-70">
                      ({b.sampleSize})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  rate,
  caption,
  toneTreatment,
}: {
  title: string;
  rate: number;
  caption: string;
  toneTreatment: ToneTreatment;
}): React.ReactElement {
  return (
    <div
      className={`rounded-md border-2 ${toneTreatment.cardClass} p-3`}
      role="group"
      aria-label={`${title}: ${formatPercent(rate)} agreement`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          aria-label={toneTreatment.glyphLabel}
          className={`text-2xl font-bold ${toneTreatment.numberClass}`}
        >
          {toneTreatment.glyph}
        </span>
        <span className={`text-3xl font-bold ${toneTreatment.numberClass}`}>
          {formatPercent(rate)}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{caption}</p>
    </div>
  );
}
