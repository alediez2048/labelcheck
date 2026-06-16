/**
 * GET /api/model-health — read-only snapshot of the Improvement Cycle.
 *
 * Surfaces what each P5 stage produced: the committed eval baseline,
 * the active provider, and a small set of self-healing knobs the
 * runtime exposes (timeout, retry, image cap). The /model-health page
 * polls this and renders it as a status dashboard.
 *
 * No mutations here — improvement happens through deliberate human
 * actions (re-baseline, prompt change, bake-off, model swap) gated
 * by CI. This route is informational only.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

type BaselineMetrics = {
  falseNegativeRate?: { rate?: number; totalRealNegatives?: number; leakedToMatch?: number };
  laneConfusion?: { overall?: number };
  warningCheck?: {
    presence?: { accuracy?: number };
    verbatim?: { accuracy?: number };
    allCaps?: { accuracy?: number };
  };
  calibration?: { ece?: number };
  latency?: { p95?: number; budgetMs?: number };
};

type Baseline = {
  version?: number;
  created_at?: string;
  golden_set_version?: string;
  metrics?: BaselineMetrics;
  tolerances?: Record<string, number>;
};

export async function GET(): Promise<NextResponse> {
  try {
    const baselinePath = path.join(process.cwd(), "eval-baseline.json");
    const raw = await fs.readFile(baselinePath, "utf-8").catch(() => null);
    const baseline: Baseline | null = raw ? (JSON.parse(raw) as Baseline) : null;

    const provider = (process.env.PROVIDER ?? "mock").toLowerCase();
    const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
    const longEdgeCap = Number(process.env.IMAGE_MAX_LONG_EDGE ?? "1568");

    return NextResponse.json(
      {
        cycle: {
          capture: {
            label: "Capture",
            description:
              "OpenTelemetry traces every extraction, match, triage with PII redacted.",
            componentRef: "P5-1",
            status: "live",
            detail:
              "Salted SHA-256 hashing applied to applicant ids before any span attribute is set.",
          },
          measure: {
            label: "Measure",
            description:
              "Golden-set eval harness computes FN rate, lane accuracy, ECE, p95.",
            componentRef: "P5-2",
            status: baseline ? "live" : "no-baseline",
            detail: baseline
              ? `Baseline v${baseline.version ?? "?"} from ${baseline.created_at ?? "?"}`
              : "eval-baseline.json missing — run `pnpm eval` to seed.",
          },
          label: {
            label: "Label",
            description:
              "Agent overrides flow into eval-data/agent-corrections/<date>.jsonl as ground truth.",
            componentRef: "P5-3",
            status: "live",
            detail:
              "Disagreement queue confirms tool-was-right vs agent-was-right for each sampled row.",
          },
          gate: {
            label: "Gate",
            description:
              "CI runs `pnpm eval --gate` on every push; regressions fail the build.",
            componentRef: "P5-5",
            status: baseline ? "live" : "no-baseline",
            detail: baseline
              ? "Headline tolerance = 0.0; a single new leaked FN fails CI."
              : "Cannot gate without a committed baseline.",
          },
          choose: {
            label: "Choose",
            description:
              "Bake-off runs candidate providers against the golden set; framing rule enforces in-boundary defaults.",
            componentRef: "P5-4",
            status: "live",
            detail: `Active provider: ${provider}${hasAnthropicKey ? " (live key configured)" : " (no live key)"}.`,
          },
        },

        baseline: baseline
          ? {
              version: baseline.version,
              createdAt: baseline.created_at,
              goldenSetVersion: baseline.golden_set_version,
              metrics: {
                falseNegativeRate: baseline.metrics?.falseNegativeRate?.rate ?? null,
                laneAccuracy: baseline.metrics?.laneConfusion?.overall ?? null,
                warningPresence:
                  baseline.metrics?.warningCheck?.presence?.accuracy ?? null,
                warningVerbatim:
                  baseline.metrics?.warningCheck?.verbatim?.accuracy ?? null,
                warningAllCaps:
                  baseline.metrics?.warningCheck?.allCaps?.accuracy ?? null,
                calibrationEce: baseline.metrics?.calibration?.ece ?? null,
                latencyP95: baseline.metrics?.latency?.p95 ?? null,
              },
              tolerances: baseline.tolerances ?? null,
            }
          : null,

        selfHealing: [
          {
            label: "Provider-call timeout + retry",
            mechanism: "withTimeout + withRetry (P0-3)",
            triggers: "Anthropic 5xx, network failure, p95 over budget",
            action: "Single retry with backoff; falls back to structured error",
          },
          {
            label: "Mock-provider fallback",
            mechanism: "PROVIDER env switch",
            triggers: "ANTHROPIC_API_KEY absent",
            action: "Verification path stays alive on canned extractions",
          },
          {
            label: "Lane-blocking subset",
            mechanism: "LANE_BLOCKING_FIELDS (P1-5 / UX pass)",
            triggers: "Non-essential field flagged",
            action: "Surfaces in summary but does not push the lane",
          },
          {
            label: "Government warning relaxation",
            mechanism: "Presence-only check (UX pass)",
            triggers: "TTB labels paraphrase the canonical warning",
            action: "Demo posture; strict checks can be re-enabled via config",
          },
          {
            label: "Duplicate-upload dedup",
            mechanism: "Normalized brand + applicationId key (UX pass)",
            triggers: "Same PDF dropped twice",
            action: "Updates the existing row in place; preserves agent assignment",
          },
        ],

        humanInLoop: [
          {
            label: "Confirm disagreement queue rows",
            href: "/disagreement-queue",
            owner: "Admin",
            description:
              "Each override goes to the queue. Admin confirms tool-was-right or agent-was-right; result becomes labeled ground truth.",
          },
          {
            label: "Re-baseline after deliberate threshold change",
            href: null,
            owner: "Engineering",
            description:
              "Commit message convention `eval-baseline: re-baseline after <reason>` (see docs/EVAL-BASELINE.md). Forces re-baseline conversation when the golden set hash changes.",
          },
          {
            label: "Run a bake-off when swapping providers",
            href: null,
            owner: "Engineering",
            description:
              "`pnpm bakeoff --providers=anthropic,azure-openai-gov,olmocr` reports the per-provider metric grid and the framing-rule recommendation.",
          },
          {
            label: "Tune fields in fields-by-type.json",
            href: null,
            owner: "Compliance reviewer",
            description:
              "Required fields + tolerances live in `config/*.json` (FR-25). Editable without code changes; reviewable via PR.",
          },
        ],

        roadmap: [
          {
            label: "Threshold auto-tuning from corrections corpus",
            status: "future",
            note:
              "Detect a beverage-type weak spot in the agreement rate and propose a threshold change; gated by CI eval.",
          },
          {
            label: "Prompt-version A/B in the bake-off harness",
            status: "future",
            note:
              "Bake-off currently compares providers; extend to compare prompt versions on the same provider.",
          },
          {
            label: "Fine-tune on the corrections corpus",
            status: "future",
            note:
              "Once the corpus crosses N labeled rows, ship a P6 ticket to fine-tune the in-boundary provider on agent-was-right examples.",
          },
          {
            label: "In-boundary self-hosted observability (P6-6)",
            status: "production",
            note:
              "Langfuse / Phoenix + Prometheus + Grafana inside the FedRAMP boundary; the prototype runs a lightweight version.",
          },
        ],

        runtime: {
          provider,
          hasAnthropicKey,
          longEdgeCap,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
