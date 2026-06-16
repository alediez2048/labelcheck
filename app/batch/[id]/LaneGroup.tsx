/**
 * LaneGroup — one of the three lane buckets on the batch results view.
 *
 * Why a dedicated component rather than inline rendering on the page:
 * the three lanes share structure (banner + expandable rows) but the
 * match lane carries a one-click bulk approve action and the other two
 * are exception-first lists. Co-locating both shapes here keeps the
 * page's render free of lane branching.
 *
 * The bulk-approve action on the match group is intentionally
 * ephemeral — no router call, no provider mutation. The Phase 2
 * MatchLaneApprovalPanel is anchored to the LIVE queue's match-lane
 * applications; a batch is its own world (ephemeral, NFR-4 / D2). A
 * later ticket can fold in the full aggregate review surface here.
 * Until then, exposing the action keeps FR-20 visible on the batch
 * path so a supervisor's mental model carries across both surfaces.
 */

"use client";

import React, { useState } from "react";

import { FieldTable } from "@/app/verify/result/FieldTable";
import { LaneBanner } from "@/app/verify/result/LaneBanner";
import type { Lane } from "@/types";

import type { BatchItem, WireFace } from "./types";

/**
 * Convert a WireFace's bytes (Node Buffer JSON shape OR base64 string)
 * into a data: URL suitable for an <img src>. This lets the reviewer see
 * the exact label image we sent to the vision provider — useful for
 * spotting OCR misreads (e.g. 35% being transcribed as 39%).
 */
function faceToDataUrl(face: WireFace): string {
  let base64 = "";
  if (typeof face.bytes === "string") {
    base64 = face.bytes;
  } else if (face.bytes && Array.isArray(face.bytes.data)) {
    // JSON-encoded Node Buffer — decode bytes to base64.
    const len = face.bytes.data.length;
    let binary = "";
    for (let i = 0; i < len; i++) binary += String.fromCharCode(face.bytes.data[i]!);
    base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  }
  return `data:${face.mime};base64,${base64}`;
}

type Props = {
  lane: Lane;
  items: ReadonlyArray<BatchItem>;
};

const LANE_COPY: Readonly<Record<Lane, { heading: string; emptyHint: string }>> =
  {
    match: {
      heading: "Match lane",
      emptyHint: "No clean matches in this batch.",
    },
    mismatch: {
      heading: "Mismatch lane",
      emptyHint: "No mismatches in this batch.",
    },
    review: {
      heading: "Review lane",
      emptyHint: "No review-lane items in this batch.",
    },
  };

export function LaneGroup({ lane, items }: Props): React.ReactElement {
  const [approved, setApproved] = useState(false);
  const copy = LANE_COPY[lane];

  // Average overall confidence across the bucket — feeds the LaneBanner
  // so the glanceable signal scales with the bucket, not a single item.
  const avgConfidence =
    items.length === 0
      ? 0
      : items.reduce((sum, it) => {
          return sum + (it.result?.overallConfidence ?? 0);
        }, 0) / items.length;

  if (items.length === 0) {
    return (
      <section
        aria-labelledby={`lane-${lane}-heading`}
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2
          id={`lane-${lane}-heading`}
          className="text-base font-semibold text-slate-800"
        >
          {copy.heading}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{copy.emptyHint}</p>
      </section>
    );
  }

  if (lane === "match" && approved) {
    return (
      <section
        role="status"
        aria-live="polite"
        aria-labelledby={`lane-${lane}-heading`}
        className="rounded-lg border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-900"
      >
        <h2 id={`lane-${lane}-heading`} className="text-base font-semibold">
          <span aria-hidden="true" className="mr-1.5">
            ✓
          </span>
          {copy.heading} — approved
        </h2>
        <p className="mt-1 text-sm">
          Approved {items.length} applications from the batch (client-side,
          ephemeral).
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`lane-${lane}-heading`}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id={`lane-${lane}-heading`}
          className="text-base font-semibold text-slate-800"
        >
          {copy.heading} — {items.length}
        </h2>
        {lane === "match" && (
          <button
            type="button"
            onClick={() => setApproved(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <span aria-hidden="true">✓</span>
            <span>Approve all {items.length}</span>
          </button>
        )}
      </header>

      <LaneBanner lane={lane} overallConfidence={avgConfidence} />

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <LaneItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Row in a lane group. Collapsed by default — exception-first review
 * (FR-19) means the agent's eye should land on counts and brands first
 * and only expand the ones that need a closer look.
 */
function LaneItemRow({ item }: { item: BatchItem }): React.ReactElement {
  const lane = item.result?.lane;
  return (
    <li className="rounded-md border border-slate-200 bg-slate-50">
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100">
          <span className="flex flex-col">
            <span>{item.brand}</span>
            <span className="font-mono text-xs text-slate-500">
              {item.applicationId}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {lane && <LanePill lane={lane} />}
            <span
              aria-hidden="true"
              className="text-xs text-slate-500 group-open:rotate-180"
            >
              ▾
            </span>
          </span>
        </summary>
        <div className="border-t border-slate-200 bg-white p-3">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Label image sent to the model
              </p>
              {item.faces && item.faces.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {item.faces.map((face, idx) => (
                    <figure
                      key={idx}
                      className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                    >
                      <img
                        src={faceToDataUrl(face)}
                        alt={`${face.kind} face of ${item.brand}`}
                        className="block w-full"
                        loading="lazy"
                      />
                      <figcaption className="border-t border-slate-200 bg-white px-2 py-1 text-[11px] uppercase tracking-wide text-slate-500">
                        {face.kind}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No face image available.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Form vs. label
              </p>
              {item.result ? (
                <FieldTable fields={item.result.fields} />
              ) : (
                <p className="text-sm text-slate-600">
                  No verification result available for this item.
                </p>
              )}
            </div>
          </div>
        </div>
      </details>
    </li>
  );
}

const LANE_PILL: Readonly<
  Record<Lane, { label: string; icon: string; cls: string }>
> = {
  match: {
    label: "Match",
    icon: "✓",
    cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  mismatch: {
    label: "Mismatch",
    icon: "✕",
    cls: "bg-rose-100 text-rose-900 border-rose-400",
  },
  review: {
    label: "Review",
    icon: "!",
    cls: "bg-amber-100 text-amber-900 border-amber-400",
  },
};

function LanePill({ lane }: { lane: Lane }): React.ReactElement {
  const t = LANE_PILL[lane];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.cls}`}
    >
      <span aria-hidden="true">{t.icon}</span>
      <span>{t.label}</span>
    </span>
  );
}
