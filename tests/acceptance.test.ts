/**
 * Phase 1 acceptance tests — drives the golden set through the
 * verification pipeline and asserts AC-1 through AC-7.
 *
 *   AC-1 (clean match), AC-2 (ABV mismatch), AC-3 (warning title-case),
 *   AC-4 (missing warning), AC-5 (fuzzy brand), AC-6 (unreadable face),
 *   plus the false-negative probes — assertion: lane !== 'match' on
 *   planted-mismatch fixtures (the observability.md headline safety
 *   metric).
 *
 *   AC-7 — a smoke timing check that the pipeline completes well under
 *   the NFR-1 5s budget on representative inputs. The formal p95 bench
 *   lands in P1-11.
 *
 *   AC-8 — a ~300 batch is Phase 3 (P3-1). Marked as skipped here with
 *   the deferral reference, so a future agent can find the seam.
 *
 *   AC-9 — color + icon + text in the review UI — automated by the
 *   jest-axe sweep in `tests/a11y.test.tsx` (where present) plus a
 *   manual screen-reader pass logged in `tests/MANUAL-CHECKS.md`.
 *
 *   AC-10 — no PII to disk — asserted by the static grep in
 *   `tests/static/no-pii-to-disk.test.ts` and recorded in
 *   `tests/MANUAL-CHECKS.md`.
 *
 * The pipeline is exercised by calling the lib modules directly — no
 * HTTP round-trips — so the tests are deterministic and fast. The
 * route handler's wire contract is exercised separately in
 * `app/api/verify/__tests__/route.test.ts`.
 *
 * Warning text comes from a TEST_WARNING_CONFIG injected via vi.spyOn —
 * `config/warning.json` still ships the `__TODO_VERBATIM_TEXT_A18__`
 * placeholder, and using the placeholder would silently fail every
 * green pair. P1-10's job is to assert pipeline behaviour, not the
 * pending A18 text.
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extract } from "@/lib/extraction/service";
import type { ExtractableApplication } from "@/lib/extraction/service";
import { matchApplication } from "@/lib/matching/match";
import * as configModule from "@/lib/config";
import { classify } from "@/lib/triage/classify";
import type { FieldName, Lane } from "@/types";

import { GOLDEN_SET, byCategory, type GoldenEntry } from "./golden";

const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

const TEST_WARNING_CONFIG: configModule.WarningConfig = {
  version: "test",
  canonicalText: CANONICAL_WARNING,
  headingText: "GOVERNMENT WARNING:",
  headingCapsRequired: true,
  headingBoldRequired: true,
  headingBoldEnforcement: "best_effort",
};

/**
 * Tiny JPEG so we have real bytes to feed through preprocessing.
 * Lifted from `lib/extraction/__tests__/service.test.ts`.
 */
async function tinyJpeg(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg({ quality: 50 })
    .toBuffer();
}

type LaneResult = {
  lane: Lane;
  flaggedFields: FieldName[];
  durationMs: number;
};

async function runPipeline(entry: GoldenEntry): Promise<LaneResult> {
  const buf = await tinyJpeg();
  const app: ExtractableApplication = {
    id: entry.id,
    beverageType: entry.beverageType,
    faces: [{ kind: "front", bytes: buf, mime: "image/jpeg" }],
  };
  const start = Date.now();
  const extraction = await extract(app);
  // The route handler's unreadable short-circuit lives in the route
  // file. Inline the same shape here so the golden-set assertion stays
  // honest — the lane on AC-6 is `review`, not whatever a wallop of
  // not_founds would produce through matching.
  if (
    extraction.faces.every(
      (f) =>
        Object.values(f.fields).filter((v) => typeof v === "string" && v.length > 0).length === 0 &&
        !f.warning.presence,
    )
  ) {
    return {
      lane: "review",
      flaggedFields: [],
      durationMs: Date.now() - start,
    };
  }
  const fields = matchApplication({
    beverageType: entry.beverageType,
    form: entry.form,
    extraction,
  });
  const triage = classify({ fieldResults: fields });
  return {
    lane: triage.lane,
    flaggedFields: fields
      .filter((f) => f.verdict !== "match")
      .map((f) => f.field),
    durationMs: Date.now() - start,
  };
}

describe("Phase 1 acceptance — golden set", () => {
  beforeEach(() => {
    process.env.PROVIDER = "mock";
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of GOLDEN_SET) {
    it(`${entry.acceptanceCriterion} — ${entry.id}: ${entry.notes}`, async () => {
      const result = await runPipeline(entry);
      expect(result.lane, `expected lane ${entry.expectedLane}, got ${result.lane}`).toBe(
        entry.expectedLane,
      );
      if (entry.laneMustNotBe) {
        expect(result.lane).not.toBe(entry.laneMustNotBe);
      }
      if (entry.expectedFlaggedFields) {
        for (const field of entry.expectedFlaggedFields) {
          expect(
            result.flaggedFields,
            `expected ${field} to be flagged for ${entry.id}; got ${result.flaggedFields.join(", ")}`,
          ).toContain(field);
        }
      }
    });
  }
});

describe("Phase 1 acceptance — false-negative safety net", () => {
  beforeEach(() => {
    process.env.PROVIDER = "mock";
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("planted real mismatches NEVER land in the match lane", async () => {
    const probes = byCategory("falseNegativeProbes");
    expect(probes.length).toBeGreaterThanOrEqual(3);
    for (const probe of probes) {
      const result = await runPipeline(probe);
      expect(
        result.lane,
        `FN probe ${probe.id} cleared to match lane — this is the headline safety regression`,
      ).not.toBe("match");
    }
  });
});

describe("Phase 1 acceptance — AC-7 latency smoke", () => {
  beforeEach(() => {
    process.env.PROVIDER = "mock";
    vi.spyOn(configModule, "getWarningConfig").mockReturnValue(
      TEST_WARNING_CONFIG,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mock pipeline completes well under the 5s budget on a representative input", async () => {
    const entry = byCategory("greenPairs")[0];
    expect(entry).toBeDefined();
    const result = await runPipeline(entry!);
    // The mock provider is in-process — the real measurement lands in
    // P1-11 against the live adapter. We assert a generous ceiling here
    // (1s) to catch any accidental regression in the in-process path.
    expect(result.durationMs).toBeLessThan(1000);
  });
});

describe.skip("AC-8 — batch of ~300 applications", () => {
  // TODO: batch lands in P3-1 (Batch intake). The harness will iterate
  // a synthesised batch through /api/verify with bounded concurrency
  // and assert grouped-by-lane results.
  it("is deferred to P3-1", () => {
    expect(true).toBe(true);
  });
});
