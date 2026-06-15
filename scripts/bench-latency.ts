/**
 * P1-11 — Latency bench (NFR-1, A12).
 *
 * Runs the golden-set fixtures through the verification pipeline N
 * times, measures the extraction call duration AND the end-to-end
 * pipeline duration, and reports p50 / p95 / max for each. The p95
 * number is the headline — the long tail is what fails the agent's
 * experience, not the median (NFR-1).
 *
 * Defaults to the mock adapter so the bench can run in CI without an
 * API key. Set `PROVIDER=anthropic ANTHROPIC_API_KEY=...` to run
 * against the live model — that's where assumption A12 ("real-world
 * latency of full-resolution multi-face calls is unverified") gets a
 * measured answer.
 *
 * Single-face and multi-face results are reported SEPARATELY because
 * A12 is specifically about multi-face cost. If multi-face p95 exceeds
 * the 5s budget against the live model, the bench prints an explicit
 * `A12_FLAGGED` line so the result lands in the operator's eye.
 *
 * Usage:
 *   pnpm tsx scripts/bench-latency.ts                  # mock, default
 *   ITERATIONS=100 pnpm tsx scripts/bench-latency.ts   # bigger sample
 *   PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm tsx scripts/bench-latency.ts
 *
 * The output is the seed for the OpenTelemetry per-verification span
 * in P5-1 — same event vocabulary (`extraction.call`, `verify.request`)
 * and the same per-request timing structure.
 */

import sharp from "sharp";

import { extract, type ExtractableApplication } from "@/lib/extraction/service";
import { matchApplication } from "@/lib/matching/match";
import { classify } from "@/lib/triage/classify";
import type { FaceKind } from "@/types";

import { GOLDEN_SET, type GoldenEntry } from "../tests/golden";

const BUDGET_MS = 5_000;
const DEFAULT_ITERATIONS = 50;

type Sample = {
  fixture: GoldenEntry;
  faceCount: number;
  faceBytes: Array<{ kind: FaceKind; bytes: Buffer }>;
};

type Timing = {
  fixtureId: string;
  faceCount: number;
  extractionMs: number;
  pipelineMs: number;
};

async function tinyJpeg(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function prepareSamples(): Promise<Sample[]> {
  // Pre-build face buffers once; the bench iterates the same samples
  // through the pipeline many times to get a meaningful p95.
  const samples: Sample[] = [];
  for (const fixture of GOLDEN_SET) {
    // Most fixtures' mock responses have 1-2 faces. The bench mirrors
    // that — multi-face fixtures get two face buffers; single-face
    // fixtures get one. This split is what answers A12.
    const faceCount = fixture.category === "unreadableImages" ? 1 : 2;
    const faceBytes: Array<{ kind: FaceKind; bytes: Buffer }> = [];
    const buf = await tinyJpeg();
    faceBytes.push({ kind: "front", bytes: buf });
    if (faceCount === 2) {
      faceBytes.push({ kind: "back", bytes: await tinyJpeg() });
    }
    samples.push({ fixture, faceCount, faceBytes });
  }
  return samples;
}

async function runOnce(sample: Sample): Promise<Timing> {
  const app: ExtractableApplication = {
    id: sample.fixture.id,
    beverageType: sample.fixture.beverageType,
    faces: sample.faceBytes.map((f) => ({
      kind: f.kind,
      bytes: f.bytes,
      mime: "image/jpeg",
    })),
  };
  const pipelineStart = performance.now();
  const extractionStart = performance.now();
  const extraction = await extract(app);
  const extractionMs = performance.now() - extractionStart;
  if (!extraction.degraded && extraction.faces.length > 0) {
    const fields = matchApplication({
      beverageType: sample.fixture.beverageType,
      form: sample.fixture.form,
      extraction,
    });
    classify({ fieldResults: fields });
  }
  const pipelineMs = performance.now() - pipelineStart;
  return {
    fixtureId: sample.fixture.id,
    faceCount: sample.faceCount,
    extractionMs,
    pipelineMs,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank percentile — fine for N ≥ 20 and matches what the
  // observability dashboards in P5-1 will use.
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

function summarise(label: string, values: number[]): {
  scope: string;
  count: number;
  p50: number;
  p95: number;
  max: number;
} {
  return {
    scope: label,
    count: values.length,
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    max: Math.round(Math.max(...values)),
  };
}

export type BenchResult = {
  provider: string;
  iterations: number;
  extraction: { all: ReturnType<typeof summarise>; singleFace: ReturnType<typeof summarise>; multiFace: ReturnType<typeof summarise> };
  pipeline: { all: ReturnType<typeof summarise>; singleFace: ReturnType<typeof summarise>; multiFace: ReturnType<typeof summarise> };
  a12Flagged: boolean;
};

export async function runBench(iterations: number): Promise<BenchResult> {
  const samples = await prepareSamples();
  const timings: Timing[] = [];
  for (let i = 0; i < iterations; i++) {
    const sample = samples[i % samples.length]!;
    timings.push(await runOnce(sample));
  }

  const all = timings;
  const singleFace = timings.filter((t) => t.faceCount === 1);
  const multiFace = timings.filter((t) => t.faceCount > 1);

  const provider = process.env.PROVIDER ?? "mock";

  const extraction = {
    all: summarise("extraction (all)", all.map((t) => t.extractionMs)),
    singleFace: summarise("extraction (single)", singleFace.map((t) => t.extractionMs)),
    multiFace: summarise("extraction (multi)", multiFace.map((t) => t.extractionMs)),
  };
  const pipeline = {
    all: summarise("pipeline (all)", all.map((t) => t.pipelineMs)),
    singleFace: summarise("pipeline (single)", singleFace.map((t) => t.pipelineMs)),
    multiFace: summarise("pipeline (multi)", multiFace.map((t) => t.pipelineMs)),
  };

  const a12Flagged =
    provider === "anthropic" &&
    pipeline.multiFace.count > 0 &&
    pipeline.multiFace.p95 > BUDGET_MS;

  return {
    provider,
    iterations,
    extraction,
    pipeline,
    a12Flagged,
  };
}

function printTable(rows: Array<ReturnType<typeof summarise>>): void {
  const headers = ["scope", "count", "p50 ms", "p95 ms", "max ms"];
  const widths = headers.map((h) => h.length);
  const data = rows.map((r) => [r.scope, String(r.count), String(r.p50), String(r.p95), String(r.max)]);
  for (const row of data) {
    row.forEach((cell, i) => {
      if (cell.length > widths[i]!) widths[i] = cell.length;
    });
  }
  const fmt = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  console.log(fmt(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of data) console.log(fmt(row));
}

async function main(): Promise<void> {
  const iterations = Number(process.env.ITERATIONS ?? DEFAULT_ITERATIONS);
  // We intentionally do NOT inject TEST_WARNING_CONFIG here. The bench
  // measures DURATION, not correctness — whatever lane a fixture lands
  // in doesn't change its timing. The acceptance tests do the warning
  // injection because they assert lanes; the bench is silent on lanes.

  console.log(
    `\nbench-latency — provider=${process.env.PROVIDER ?? "mock"} ` +
      `iterations=${iterations} budget=${BUDGET_MS}ms\n`,
  );

  const result = await runBench(iterations);

  console.log("Extraction (provider call):");
  printTable([result.extraction.all, result.extraction.singleFace, result.extraction.multiFace]);
  console.log("\nEnd-to-end pipeline:");
  printTable([result.pipeline.all, result.pipeline.singleFace, result.pipeline.multiFace]);

  console.log("");
  if (result.pipeline.all.p95 > BUDGET_MS) {
    console.log(`BUDGET_EXCEEDED: end-to-end p95 ${result.pipeline.all.p95}ms > ${BUDGET_MS}ms`);
  } else {
    console.log(`BUDGET_OK: end-to-end p95 ${result.pipeline.all.p95}ms ≤ ${BUDGET_MS}ms`);
  }
  if (result.a12Flagged) {
    console.log(
      `A12_FLAGGED: live-adapter multi-face p95 ${result.pipeline.multiFace.p95}ms > ${BUDGET_MS}ms — ` +
        `assumption A12 hit; route follow-up to P3-4 (performance hardening).`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
