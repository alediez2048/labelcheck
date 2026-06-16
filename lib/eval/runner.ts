/**
 * Offline eval runner (P5-2).
 *
 * Walks the golden set, drives each case through the per-application
 * verification pipeline, and produces a `CaseRun[]` for the metric
 * functions in `metrics/`. The runner is provider-agnostic: it reads
 * `EVAL_PROVIDER` (defaults to "mock"); the provider selection itself
 * lives in `lib/provider/getProvider` which reads `PROVIDER` from the
 * environment. The runner forwards `EVAL_PROVIDER` to `PROVIDER` so a
 * caller can set just one knob.
 *
 * Why no `tests/golden/manifest.json`
 * -----------------------------------
 * The Phase 1 golden set is a typed array at `tests/golden/index.ts`.
 * That IS the manifest; importing it gives the runner strong typing,
 * the same source of truth the acceptance tests use, and zero drift
 * surface. The ticket's "manifest.json" framing predates the typed-
 * array decision in P1-10; the typed array is the right shape.
 *
 * Why we inject a canonical warning config
 * ----------------------------------------
 * `config/warning.json` ships the `__TODO_VERBATIM_TEXT_A18__`
 * placeholder until A18 is resolved. Using it as-is would fail every
 * green case in the eval and the false-negative rate would be 0% for
 * the wrong reason ("every case is a real negative"). The runner
 * plumbs the canonical 27 CFR § 16.21 text through `runVerification`'s
 * `warningConfig` parameter so the eval measures pipeline correctness
 * against the real warning the production config will eventually carry.
 * The route handler doesn't pass this — production behaviour is
 * unchanged.
 */

import sharp from "sharp";

import type { WarningConfig } from "@/lib/config";
import { runVerification } from "@/lib/verify/runVerification";
import { GOLDEN_SET, type GoldenEntry } from "@/tests/golden";
import type { FaceKind, FieldName } from "@/types";

import type { CaseRun, GoldenCase } from "./types";

const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

const TEST_WARNING_CONFIG: WarningConfig = {
  version: "eval",
  canonicalText: CANONICAL_WARNING,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

export type RunOptions = {
  /** Defaults to the full Phase 1 golden set. */
  goldenSet?: ReadonlyArray<GoldenCase>;
  /**
   * Override the canonical warning text injected into the pipeline. When
   * undefined, the runner uses the 27 CFR § 16.21 canonical text above;
   * when explicitly `null`, no override is passed and the pipeline reads
   * `config/warning.json` (which still ships the A18 placeholder — most
   * cases will lane as `mismatch` for the wrong reason). The default is
   * what callers want; `null` is for ticket-specific debugging.
   */
  warningConfig?: WarningConfig | null;
};

export type RunOutcome = {
  runs: CaseRun[];
  provider: "mock" | "live";
};

/**
 * Tiny representative JPEG. The mock provider keys off `applicationId`,
 * not on the bytes — the bytes only need to survive `sharp` preprocessing.
 * Mirror of the bench-latency helper for shape consistency.
 */
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

/**
 * Pick face count for one case. The mock fixtures are mostly two-face
 * (front + back); the unreadable fixture is one face by construction.
 */
function faceCountFor(caseRow: GoldenCase): number {
  return caseRow.category === "unreadableImages" ? 1 : 2;
}

async function buildFaces(
  caseRow: GoldenCase,
): Promise<Array<{ kind: FaceKind; bytes: Buffer; mime: "image/jpeg" }>> {
  const count = faceCountFor(caseRow);
  const faces: Array<{ kind: FaceKind; bytes: Buffer; mime: "image/jpeg" }> = [
    { kind: "front", bytes: await tinyJpeg(), mime: "image/jpeg" },
  ];
  if (count >= 2) {
    faces.push({ kind: "back", bytes: await tinyJpeg(), mime: "image/jpeg" });
  }
  return faces;
}

function resolveProvider(): "mock" | "live" {
  const raw = process.env.EVAL_PROVIDER ?? "mock";
  return raw === "live" ? "live" : "mock";
}

/**
 * Run the eval. Returns the per-case results plus the resolved provider
 * tag for the report. The caller assembles the metric report.
 */
export async function runEval(options?: RunOptions): Promise<RunOutcome> {
  const goldenSet: ReadonlyArray<GoldenCase> =
    options?.goldenSet ?? (GOLDEN_SET as ReadonlyArray<GoldenEntry>);
  // Default to the canonical-text override; pass `null` to opt out.
  const warningConfig: WarningConfig | undefined =
    options?.warningConfig === null
      ? undefined
      : (options?.warningConfig ?? TEST_WARNING_CONFIG);

  const provider = resolveProvider();
  // Forward EVAL_PROVIDER → PROVIDER so `getProvider()` lines up with the
  // operator's intent. We restore the prior value in `finally` so the
  // env stays clean for whatever the caller runs next.
  const priorProvider = process.env.PROVIDER;
  process.env.PROVIDER = provider === "live" ? "anthropic" : "mock";

  const runs: CaseRun[] = [];
  try {
    for (const caseRow of goldenSet) {
      const faces = await buildFaces(caseRow);
      const start = performance.now();
      const result = await runVerification({
        applicationId: caseRow.id,
        beverageType: caseRow.beverageType,
        form: caseRow.form,
        faces,
        ...(warningConfig ? { warningConfig } : {}),
      });
      const durationMs = performance.now() - start;

      const predictedFlaggedFields: FieldName[] = result.fields
        .filter((f) => f.verdict !== "match")
        .map((f) => f.field);

      runs.push({
        caseId: caseRow.id,
        category: caseRow.category,
        expectedLane: caseRow.expectedLane,
        predictedLane: result.lane,
        expectedFlaggedFields: caseRow.expectedFlaggedFields ?? [],
        predictedFlaggedFields,
        fields: result.fields.map((f) => ({
          field: f.field,
          verdict: f.verdict,
          confidence: f.confidence,
          sourceFace: f.sourceFace,
        })),
        overallConfidence: result.overallConfidence,
        durationMs,
        extractionFailed: result.extractionFailed,
      });
    }
  } finally {
    if (priorProvider === undefined) {
      delete process.env.PROVIDER;
    } else {
      process.env.PROVIDER = priorProvider;
    }
  }

  return { runs, provider };
}

/**
 * Exposed so the report builder can record the canonical text used.
 * Kept internal otherwise.
 */
export const EVAL_CANONICAL_WARNING_TEXT = CANONICAL_WARNING;
