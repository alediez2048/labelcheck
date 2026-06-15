/**
 * LaneBanner — color + icon + plain-text label (NFR-2, AC-9).
 *
 * The lane is the single most-glanceable signal on the page. Color alone
 * fails AC-9; every banner pairs a color treatment with a glyph AND a
 * text label so a color-blind agent or a black-and-white printout still
 * surfaces the verdict. The semantics live in the text, not the palette.
 */

import type { Lane } from "@/types";

type Treatment = {
  text: string;
  icon: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconLabel: string;
};

const TREATMENTS: Readonly<Record<Lane, Treatment>> = {
  match: {
    text: "Match — every field cleared",
    icon: "✓",
    iconLabel: "check mark",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-400",
    textClass: "text-emerald-900",
  },
  mismatch: {
    text: "Mismatch — one or more fields differ",
    icon: "✕",
    iconLabel: "cross mark",
    bgClass: "bg-rose-50",
    borderClass: "border-rose-400",
    textClass: "text-rose-900",
  },
  review: {
    text: "Review — uncertain reads, agent attention needed",
    icon: "!",
    iconLabel: "warning mark",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-400",
    textClass: "text-amber-900",
  },
};

export function LaneBanner({
  lane,
  overallConfidence,
}: {
  lane: Lane;
  overallConfidence: number;
}): React.ReactElement {
  const t = TREATMENTS[lane];
  return (
    <section
      role="status"
      aria-label={`Verification lane: ${t.text}`}
      className={`flex items-center gap-4 rounded-lg border-2 ${t.borderClass} ${t.bgClass} ${t.textClass} px-5 py-4`}
    >
      <span
        aria-label={t.iconLabel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-current text-xl font-bold"
      >
        {t.icon}
      </span>
      <div className="flex flex-col">
        <p className="text-lg font-semibold leading-tight">{t.text}</p>
        <p className="text-sm opacity-80">
          Overall confidence:{" "}
          <span className="font-mono">
            {(overallConfidence * 100).toFixed(0)}%
          </span>
        </p>
      </div>
    </section>
  );
}
