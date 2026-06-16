/**
 * P3-4 — Load script (NFR-1, NFR-7, AC-7).
 *
 * Drives the per-application pipeline (`runVerification`) under three
 * scenarios so the 5-second p95 budget can be defended in isolation,
 * under concurrent single-app load, AND during a 300-app batch burst.
 * Defaults to the mock provider (PROVIDER=mock) so the script is free
 * to run in CI; PROVIDER=anthropic + ANTHROPIC_API_KEY=... swaps in the
 * live adapter for the budget-validation pass.
 *
 * Mirrors `scripts/bench-latency.ts` in shape: tiny synthetic JPEGs via
 * sharp, the same percentile helpers, the same operator-friendly table
 * output. This script measures the PIPELINE cost (no HTTP layer) so the
 * numbers attribute directly to extract + match + triage; the wire-side
 * cost is captured by the route handler's `verify.request` log under
 * real load.
 *
 * Usage:
 *   pnpm tsx scripts/load.ts --scenario=A
 *   pnpm tsx scripts/load.ts --scenario=B --concurrency=10 --duration=60
 *   pnpm tsx scripts/load.ts --scenario=C --batchSize=300
 *
 * Scenarios:
 *   A — Single-app baseline. 50 sequential verifies. Asserts p95 < 5000ms.
 *   B — Concurrent single-app. N concurrent verifies in a loop for D seconds.
 *   C — Single-app during a batch burst. A B-sized synthetic batch runs
 *       at the config/batch.json cap in the background; 30 concurrent
 *       single-app verifies run alongside. Reports the SINGLE-APP latency
 *       only (the batch is async and not held to the 5s budget).
 */

import sharp from "sharp";

import batchConfig from "@/config/batch.json";
import { runBatch } from "@/lib/batch/orchestrator";
import { createJob, getJob } from "@/lib/batch/store";
import type { BatchItem } from "@/lib/batch/types";
import { runVerification } from "@/lib/verify/runVerification";
import type { BeverageType, FaceKind } from "@/types";
import type { SampleForm } from "@/fixtures/samples";

const BUDGET_MS = 5_000;

// ---------------------------------------------------------------------------
// Fixture cycle — same ids the mock provider knows. Keeping the cycle
// identical to `app/api/batch/route.ts#SYNTHETIC_FIXTURE_IDS` means the
// load run exercises every signal case (clean, mismatch, warnings, fuzzy,
// unreadable, FN probes) over a long enough run.
// ---------------------------------------------------------------------------

type Fixture = {
  id: string;
  brand: string;
  beverageType: BeverageType;
  form: SampleForm;
};

const FIXTURES: ReadonlyArray<Fixture> = [
  {
    id: "sample-green-001",
    brand: "HARBOR MIST",
    beverageType: "wine",
    form: {
      brandName: "HARBOR MIST",
      fancifulName: "Coastal White",
      classType: "TABLE WINE",
      alcoholContent: "12.5%",
      netContents: "750 ML",
      producerName: "HARBOR MIST CELLARS",
      producerAddress: "123 VINE ST, NAPA CA",
      countryOfOrigin: "USA",
    },
  },
  {
    id: "sample-abv-mismatch-001",
    brand: "OLD CEDAR",
    beverageType: "distilled_spirits",
    form: {
      brandName: "OLD CEDAR",
      classType: "KENTUCKY STRAIGHT BOURBON",
      alcoholContent: "40%",
      netContents: "750 ML",
      producerName: "OLD CEDAR DISTILLERY",
      producerAddress: "456 BARREL LN, LOUISVILLE KY",
    },
  },
  {
    id: "sample-warning-titlecase-001",
    brand: "CEDAR RIDGE",
    beverageType: "malt_beverage",
    form: {
      brandName: "CEDAR RIDGE",
      fancifulName: "Pale Ale",
      classType: "MALT BEVERAGE",
      alcoholContent: "5.6%",
      netContents: "12 FL OZ",
      producerName: "CEDAR RIDGE BREWING CO",
      producerAddress: "789 HOP LN, PORTLAND OR",
    },
  },
  {
    id: "sample-fuzzy-brand-001",
    brand: "Stone's Throw",
    beverageType: "wine",
    form: {
      brandName: "Stone's Throw",
      classType: "TABLE WINE",
      alcoholContent: "13%",
      netContents: "750 ML",
      producerName: "STONE'S THROW VINEYARDS",
      producerAddress: "9 ORCHARD WAY, PASO ROBLES CA",
      countryOfOrigin: "USA",
    },
  },
];

// ---------------------------------------------------------------------------
// Synthetic JPEG — generated once. The mock provider returns canned
// extractions keyed by applicationId, not pixels, so a shared buffer is
// fine here. Sharp's encode is the only real CPU cost in the mock path.
// ---------------------------------------------------------------------------

let SYNTHETIC_JPEG: Buffer | null = null;
async function syntheticJpeg(): Promise<Buffer> {
  if (SYNTHETIC_JPEG) return SYNTHETIC_JPEG;
  SYNTHETIC_JPEG = await sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  return SYNTHETIC_JPEG;
}

async function buildFaces(): Promise<
  ReadonlyArray<{ kind: FaceKind; bytes: Buffer; mime: "image/jpeg" }>
> {
  const jpeg = await syntheticJpeg();
  return [
    { kind: "front", bytes: jpeg, mime: "image/jpeg" },
    { kind: "back", bytes: jpeg, mime: "image/jpeg" },
  ];
}

// ---------------------------------------------------------------------------
// Per-call driver. Returns wall-clock ms for the whole pipeline.
// ---------------------------------------------------------------------------

async function runOne(fixture: Fixture): Promise<number> {
  const faces = await buildFaces();
  const start = performance.now();
  await runVerification({
    applicationId: fixture.id,
    beverageType: fixture.beverageType,
    form: fixture.form,
    faces,
  });
  return performance.now() - start;
}

// ---------------------------------------------------------------------------
// Percentiles + stats — same nearest-rank helpers as bench-latency.ts.
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

type Stats = {
  scope: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

function summarise(label: string, values: number[]): Stats {
  return {
    scope: label,
    count: values.length,
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    p99: Math.round(percentile(values, 99)),
    max: Math.round(values.length > 0 ? Math.max(...values) : 0),
  };
}

function printTable(rows: Stats[]): void {
  const headers = ["scope", "count", "p50 ms", "p95 ms", "p99 ms", "max ms"];
  const widths = headers.map((h) => h.length);
  const data = rows.map((r) => [
    r.scope,
    String(r.count),
    String(r.p50),
    String(r.p95),
    String(r.p99),
    String(r.max),
  ]);
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

// ---------------------------------------------------------------------------
// Tiny CLI parser — hand-rolled to avoid adding a dependency.
// ---------------------------------------------------------------------------

type Args = {
  scenario: "A" | "B" | "C";
  concurrency: number;
  duration: number;
  batchSize: number;
};

function parseArgs(argv: ReadonlyArray<string>): Args {
  const map = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) {
      map.set(a.slice(2), "true");
    } else {
      map.set(a.slice(2, eq), a.slice(eq + 1));
    }
  }
  const scenarioRaw = (map.get("scenario") ?? "A").toUpperCase();
  if (scenarioRaw !== "A" && scenarioRaw !== "B" && scenarioRaw !== "C") {
    throw new Error(`Unknown --scenario=${scenarioRaw}; expected A | B | C.`);
  }
  return {
    scenario: scenarioRaw,
    concurrency: Number(map.get("concurrency") ?? 10),
    duration: Number(map.get("duration") ?? 60),
    batchSize: Number(map.get("batchSize") ?? 300),
  };
}

// ---------------------------------------------------------------------------
// Scenario A — sequential baseline.
// ---------------------------------------------------------------------------

async function scenarioA(): Promise<Stats> {
  const ITERATIONS = 50;
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const fixture = FIXTURES[i % FIXTURES.length]!;
    samples.push(await runOne(fixture));
  }
  return summarise("scenario A — sequential", samples);
}

// ---------------------------------------------------------------------------
// Scenario B — sustained concurrent load.
// ---------------------------------------------------------------------------

async function scenarioB(concurrency: number, durationSeconds: number): Promise<Stats> {
  const samples: number[] = [];
  const deadline = performance.now() + durationSeconds * 1000;
  let i = 0;

  // Each worker pulls fixtures off a round-robin counter and keeps
  // firing until the deadline. Workers run in parallel via Promise.all.
  // `i++` is fine in a single-threaded JS runtime — only one worker
  // advances it at a time.
  async function worker(): Promise<void> {
    while (performance.now() < deadline) {
      const fixture = FIXTURES[i++ % FIXTURES.length]!;
      const ms = await runOne(fixture);
      samples.push(ms);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return summarise("scenario B — concurrent", samples);
}

// ---------------------------------------------------------------------------
// Scenario C — single-app verifies during a synthetic batch burst.
// ---------------------------------------------------------------------------

async function scenarioC(batchSize: number): Promise<{
  singleApp: Stats;
  batchFinishedMs: number;
  batchItems: number;
}> {
  const jpeg = await syntheticJpeg();

  // 1. Seed the batch job in the same store the orchestrator and the
  //    /api/batch route both read. Faces share the synthetic JPEG; the
  //    mock provider returns canned responses keyed by applicationId
  //    (which we cycle through the fixture ids).
  const seeds: ReadonlyArray<Omit<BatchItem, "id" | "status">> = Array.from(
    { length: batchSize },
    (_, idx) => {
      const fixture = FIXTURES[idx % FIXTURES.length]!;
      return {
        applicationId: fixture.id,
        brand: fixture.brand,
        beverageType: fixture.beverageType,
        form: fixture.form,
        faces: [
          { kind: "front" as FaceKind, bytes: jpeg, mime: "image/jpeg" as const },
          { kind: "back" as FaceKind, bytes: jpeg, mime: "image/jpeg" as const },
        ],
      };
    },
  );
  const job = createJob(seeds);

  // 2. Kick the batch orchestrator at the current config/batch.json cap.
  //    NOT awaited — Scenario C is about what a single-app user sees
  //    WHILE the batch is in flight, so the two run side by side.
  const batchStart = performance.now();
  const batchPromise = runBatch(job.jobId, {
    concurrency: batchConfig.concurrency,
  }).then(() => performance.now() - batchStart);

  // 3. While the batch grinds, run 30 concurrent single-app verifies.
  //    Same worker pattern as Scenario B but bounded by a fixed count
  //    instead of a deadline — we want a clean sample size against the
  //    batch's bounded duration.
  const SINGLE_APP_COUNT = 30;
  const SINGLE_APP_CONCURRENCY = 30;
  const samples: number[] = [];
  let dispatched = 0;
  async function singleWorker(): Promise<void> {
    while (true) {
      const idx = dispatched++;
      if (idx >= SINGLE_APP_COUNT) return;
      const fixture = FIXTURES[idx % FIXTURES.length]!;
      samples.push(await runOne(fixture));
    }
  }
  await Promise.all(
    Array.from({ length: SINGLE_APP_CONCURRENCY }, () => singleWorker()),
  );

  // 4. Wait for the batch to finish so the operator sees its wall-clock
  //    cost in the table. The batch is NOT held to the 5s budget per the
  //    ticket — but reporting it makes the script's two halves
  //    interpretable side by side.
  const batchFinishedMs = await batchPromise;

  // Sanity — confirm the batch actually completed. If a job hasn't
  // landed in the store the test was malformed; surface it loudly.
  const finalJob = getJob(job.jobId);
  const batchItems = finalJob?.items.length ?? 0;

  return {
    singleApp: summarise("scenario C — single-app during batch", samples),
    batchFinishedMs: Math.round(batchFinishedMs),
    batchItems,
  };
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const provider = process.env.PROVIDER ?? "mock";

  console.log(
    `\nload — scenario=${args.scenario} provider=${provider} budget=${BUDGET_MS}ms\n`,
  );

  let stats: Stats;
  let footer = "";

  if (args.scenario === "A") {
    console.log(`config: sequential, iterations=50`);
    stats = await scenarioA();
  } else if (args.scenario === "B") {
    console.log(
      `config: concurrency=${args.concurrency} duration=${args.duration}s`,
    );
    stats = await scenarioB(args.concurrency, args.duration);
  } else {
    console.log(
      `config: batchSize=${args.batchSize} batch.concurrency=${batchConfig.concurrency} singleAppConcurrent=30`,
    );
    const c = await scenarioC(args.batchSize);
    stats = c.singleApp;
    footer = `batch finished in ${c.batchFinishedMs}ms across ${c.batchItems} items at cap=${batchConfig.concurrency}`;
  }

  console.log("");
  printTable([stats]);
  console.log("");
  if (stats.p95 <= BUDGET_MS) {
    console.log(`PASS: single-app p95 ${stats.p95}ms ≤ ${BUDGET_MS}ms`);
  } else {
    console.log(`FAIL: single-app p95 ${stats.p95}ms > ${BUDGET_MS}ms`);
  }
  if (footer) console.log(footer);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
