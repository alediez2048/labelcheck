/**
 * TriageDonut — AI-lane breakdown over the range (P2-6, mockup.md
 * Analytics).
 *
 * Hand-rolled SVG donut with three segments, paired with a numeric
 * legend so colour is never the sole channel (NFR-2; AC-9). Each
 * legend row gets the lane label, a color swatch, an icon glyph, and
 * the count + percent — three channels on every row.
 *
 * The lanes are distinct from agent dispositions (D11; CONTEXT.md Lane
 * vs Disposition). This donut shows the AI's call; the agent's
 * approve / return-for-correction breakdown is a separate chart.
 */

import React from "react";

import type { TriageBreakdown } from "@/lib/analytics/types";

type LaneKey = "match" | "mismatch" | "review";

type LaneMeta = {
  key: LaneKey;
  label: string;
  hex: string;
  /** Icon glyph (text — a triangle, exclamation, etc.) for an extra channel. */
  icon: string;
};

const LANES: ReadonlyArray<LaneMeta> = [
  { key: "match", label: "Match", hex: "#16a34a", icon: "●" }, // emerald
  { key: "mismatch", label: "Mismatch", hex: "#ea580c", icon: "▲" }, // orange
  { key: "review", label: "Review", hex: "#475569", icon: "■" }, // slate
];

const VIEW = 100;
const RADIUS = 35;
const INNER_RADIUS = 22;
const CENTER = VIEW / 2;

function arcPath(
  startAngle: number,
  endAngle: number,
  rOuter: number,
  rInner: number,
): string {
  // Special-case full circle (avoids degenerate single-point arc).
  if (endAngle - startAngle >= 360 - 0.0001) {
    return [
      `M ${CENTER + rOuter} ${CENTER}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${CENTER - rOuter} ${CENTER}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${CENTER + rOuter} ${CENTER}`,
      `M ${CENTER + rInner} ${CENTER}`,
      `A ${rInner} ${rInner} 0 1 0 ${CENTER - rInner} ${CENTER}`,
      `A ${rInner} ${rInner} 0 1 0 ${CENTER + rInner} ${CENTER}`,
      "Z",
    ].join(" ");
  }
  const toXY = (angleDeg: number, r: number): [number, number] => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [CENTER + r * Math.cos(rad), CENTER + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startAngle, rOuter);
  const [x2, y2] = toXY(endAngle, rOuter);
  const [x3, y3] = toXY(endAngle, rInner);
  const [x4, y4] = toXY(startAngle, rInner);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export function TriageDonut({
  breakdown,
  title,
}: {
  breakdown: TriageBreakdown;
  title: string;
}): React.ReactElement {
  const total = breakdown.match + breakdown.mismatch + breakdown.review;
  let angle = 0;
  const segments = LANES.map((lane) => {
    const count = breakdown[lane.key];
    const fraction = total === 0 ? 0 : count / total;
    const startAngle = angle;
    angle += fraction * 360;
    const endAngle = angle;
    const path =
      count === 0
        ? ""
        : arcPath(startAngle, endAngle, RADIUS, INNER_RADIUS);
    return { lane, count, fraction, path };
  });

  return (
    <section
      aria-labelledby="triage-donut-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2
        id="triage-donut-heading"
        className="text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        {title}
      </h2>
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-label={`Triage breakdown — total ${total}`}
          className="h-40 w-40 flex-shrink-0"
        >
          {total === 0 ? (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="2"
            />
          ) : (
            segments.map((s) =>
              s.path ? (
                <path key={s.lane.key} d={s.path} fill={s.lane.hex} />
              ) : null,
            )
          )}
          <text
            x={CENTER}
            y={CENTER - 2}
            textAnchor="middle"
            className="fill-slate-900"
            style={{ font: "bold 12px ui-monospace, monospace" }}
          >
            {total}
          </text>
          <text
            x={CENTER}
            y={CENTER + 9}
            textAnchor="middle"
            className="fill-slate-500"
            style={{ font: "6px ui-sans-serif, system-ui" }}
          >
            total
          </text>
        </svg>
        <ul className="flex w-full flex-col gap-1.5 text-sm">
          {segments.map((s) => {
            const pct =
              total === 0 ? "0%" : `${Math.round(s.fraction * 100)}%`;
            return (
              <li
                key={s.lane.key}
                className="flex items-center justify-between gap-3 rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    style={{ color: s.lane.hex }}
                    className="font-mono text-base leading-none"
                  >
                    {s.lane.icon}
                  </span>
                  <span className="font-medium text-slate-800">
                    {s.lane.label}
                  </span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {s.count}
                  </span>
                  <span className="text-xs text-slate-500">{pct}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
