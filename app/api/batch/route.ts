/**
 * POST /api/batch — create a batch job and kick the orchestrator.
 *
 * Two entry modes (mutually exclusive in practice; an explicit
 * `applications` payload wins when both are present):
 *
 *   1. Explicit batch — the caller posts an array of applications
 *      mirroring the `/api/verify` per-item shape. Per-item validation
 *      failures are seeded into the job as `status: "failed"` so the
 *      malformed-item posture is consistent with the rest of the
 *      run (Error Handling; expanded in P3-3). The batch is rejected
 *      with 400 only when the BODY itself is malformed.
 *
 *   2. Synthetic batch — the caller posts a `count` and we generate
 *      `count` items cycling through the mock provider's fixture IDs.
 *      The fixture's canned form values are used so the resulting
 *      verifications produce realistic per-lane distributions.
 *      Defaults to `syntheticDefaultCount` from `config/batch.json`
 *      when neither field is present.
 *
 * On success the response is `{ jobId }` with status 201. The
 * orchestrator is kicked off with `void runBatch(...)` — the handler
 * returns immediately and progress fills in on subsequent polls of
 * `GET /api/batch/[id]`.
 */

import { NextResponse } from "next/server";
// sharp is imported lazily inside getSyntheticJpeg() so the route's
// cold-start never touches the native binding. The synthetic-batch
// path is the only consumer; the real-upload path uses the browser-
// rendered PNG directly.
import { z } from "zod";

import batchConfig from "@/config/batch.json";
import { runBatch } from "@/lib/batch/orchestrator";
import { createJobWithFailures } from "@/lib/batch/store";
import type { BatchItem } from "@/lib/batch/types";
import { invalidInput } from "@/lib/errors/types";
import { validateApplication } from "@/lib/validation/application";
import type { BeverageType, FaceKind } from "@/types";
import type { SampleForm } from "@/fixtures/samples";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const BeverageTypeSchema = z.enum([
  "wine",
  "distilled_spirits",
  "malt_beverage",
]);
const FaceKindSchema = z.enum(["front", "back", "neck"]);
const MimeSchema = z.enum(["image/jpeg", "image/png"]);

const FaceSchema = z.object({
  kind: FaceKindSchema,
  /** Base64 (optionally data: URL) — decoded into a Buffer per item. */
  bytes: z.string().min(1),
  mime: MimeSchema,
});

const FormSchema = z.object({
  brandName: z.string().default(""),
  fancifulName: z.string().optional(),
  classType: z.string().default(""),
  alcoholContent: z.string().default(""),
  netContents: z.string().default(""),
  producerName: z.string().default(""),
  producerAddress: z.string().default(""),
  countryOfOrigin: z.string().optional(),
});

const ApplicationSchema = z.object({
  applicationId: z.string().min(1),
  beverageType: BeverageTypeSchema,
  form: FormSchema,
  faces: z.array(FaceSchema).min(1).max(3),
});

const BodySchema = z
  .object({
    count: z.number().int().positive().optional(),
    applications: z.array(ApplicationSchema).optional(),
  })
  .refine(
    (b) =>
      b.count !== undefined ||
      b.applications !== undefined ||
      // Both absent is OK — we fall back to the synthetic default.
      true,
    { message: "Provide either `count` or `applications`." },
  );

type ParsedApplication = z.infer<typeof ApplicationSchema>;

// ---------------------------------------------------------------------------
// Synthetic fixture forms
// ---------------------------------------------------------------------------

/**
 * The fixture IDs the synthetic batch cycles through. These are the same
 * keys the mock provider knows; using them directly means the per-item
 * pipeline exercises every signal case in one batch (clean, mismatch,
 * warnings, fuzzy, unreadable, FN probes). The synthetic batch runs the
 * same fixture multiple times — fine for a demo of throughput and
 * lane-bucket rendering.
 */
const SYNTHETIC_FIXTURE_IDS = [
  "sample-green-001",
  "sample-abv-mismatch-001",
  "sample-warning-titlecase-001",
  "sample-warning-missing-001",
  "sample-fuzzy-brand-001",
  "sample-unreadable-001",
  "sample-fn-probe-warning-case-001",
  "sample-fn-probe-abv-half-001",
  "sample-fn-probe-brand-drift-001",
] as const;

type SyntheticFixture = (typeof SYNTHETIC_FIXTURE_IDS)[number];

/**
 * Per-fixture synthetic form + beverage + display brand. The form values
 * mirror the canned extraction in `lib/provider/mock.ts` so the matching
 * engine produces the lane the fixture is named for.
 */
const SYNTHETIC_FIXTURE_META: Readonly<
  Record<SyntheticFixture, { brand: string; beverageType: BeverageType; form: SampleForm }>
> = {
  "sample-green-001": {
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
  "sample-abv-mismatch-001": {
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
  "sample-warning-titlecase-001": {
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
  "sample-warning-missing-001": {
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
  "sample-fuzzy-brand-001": {
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
  "sample-unreadable-001": {
    brand: "Unreadable label",
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
  "sample-fn-probe-warning-case-001": {
    brand: "RIVER BEND",
    beverageType: "wine",
    form: {
      brandName: "RIVER BEND",
      fancifulName: "Cabernet",
      classType: "TABLE WINE",
      alcoholContent: "14%",
      netContents: "750 ML",
      producerName: "RIVER BEND WINERY",
      producerAddress: "12 RIVER RD, SONOMA CA",
      countryOfOrigin: "USA",
    },
  },
  "sample-fn-probe-abv-half-001": {
    brand: "BLACK FOREST",
    beverageType: "distilled_spirits",
    form: {
      brandName: "BLACK FOREST",
      classType: "KENTUCKY STRAIGHT BOURBON",
      alcoholContent: "40%",
      netContents: "750 ML",
      producerName: "BLACK FOREST DISTILLERY",
      producerAddress: "33 OAK LN, LEXINGTON KY",
    },
  },
  "sample-fn-probe-brand-drift-001": {
    brand: "VINTAGE PARK",
    beverageType: "wine",
    form: {
      brandName: "VINTAGE PARK",
      classType: "TABLE WINE",
      alcoholContent: "13.5%",
      netContents: "750 ML",
      producerName: "VINTAGE PEAK CELLARS",
      producerAddress: "21 RIDGE LN, NAPA CA",
      countryOfOrigin: "USA",
    },
  },
};

// ---------------------------------------------------------------------------
// Synthetic image bytes
// ---------------------------------------------------------------------------

/**
 * A small synthetic JPEG that satisfies the preprocessing step. The
 * batch path doesn't need real label imagery — the mock provider
 * returns canned extractions keyed by `applicationId`, not by the
 * pixels — so a single shared buffer is fine for every face. Generated
 * once at module load so the synthetic batch path doesn't pay sharp's
 * encode cost per item.
 */
let SYNTHETIC_JPEG: Buffer | null = null;
async function getSyntheticJpeg(): Promise<Buffer> {
  if (SYNTHETIC_JPEG) return SYNTHETIC_JPEG;
  const sharpMod = (await import("sharp")) as unknown as
    | (typeof import("sharp"))["default"]
    | { default: (typeof import("sharp"))["default"] };
  const sharp =
    typeof sharpMod === "function"
      ? sharpMod
      : (sharpMod as { default: (typeof import("sharp"))["default"] }).default;
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

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

function decodeFaceBytes(raw: string): Buffer | null {
  const stripped = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  try {
    const buf = Buffer.from(stripped, "base64");
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

type SeedItem = Omit<BatchItem, "id">;

/**
 * Translate one parsed explicit application into either a pending seed
 * or a pre-failed seed. Validation failures are seeded as `failed` so
 * the batch keeps running and the supervisor sees every item that came
 * in, not just the ones that passed validation.
 */
function seedFromExplicit(app: ParsedApplication): SeedItem {
  const decodedFaces: Array<{
    kind: FaceKind;
    bytes: Buffer;
    mime: "image/jpeg" | "image/png";
  }> = [];
  for (const face of app.faces) {
    const bytes = decodeFaceBytes(face.bytes);
    if (bytes === null) {
      return {
        applicationId: app.applicationId,
        brand: app.form.brandName || app.applicationId,
        beverageType: app.beverageType,
        form: app.form,
        faces: [],
        status: "failed",
        error: invalidInput(
          `Face ${face.kind} bytes could not be decoded.`,
          [`faces.${face.kind}.bytes`],
        ),
      };
    }
    decodedFaces.push({ kind: face.kind, bytes, mime: face.mime });
  }

  // Run the per-item validator on the Buffer-bearing submission. The
  // route handler in /api/verify uses the same validator; mirroring it
  // here means a batch item is rejected for the same reasons a single
  // submission would be.
  const validation = validateApplication({
    beverageType: app.beverageType,
    form: app.form,
    faces: decodedFaces,
  });
  if (!validation.ok) {
    const fieldNames = Object.keys(validation.fieldErrors);
    const firstMessage =
      Object.values(validation.fieldErrors)[0] ??
      validation.formErrors[0] ??
      "Submission could not be validated.";
    return {
      applicationId: app.applicationId,
      brand: app.form.brandName || app.applicationId,
      beverageType: app.beverageType,
      form: app.form,
      faces: [],
      status: "failed",
      error: invalidInput(firstMessage, fieldNames),
    };
  }

  return {
    applicationId: app.applicationId,
    brand: app.form.brandName || app.applicationId,
    beverageType: app.beverageType,
    form: app.form,
    faces: decodedFaces,
    status: "pending",
  };
}

async function buildSyntheticItems(count: number): Promise<SeedItem[]> {
  const jpeg = await getSyntheticJpeg();
  const items: SeedItem[] = [];
  for (let i = 0; i < count; i++) {
    const fixtureId = SYNTHETIC_FIXTURE_IDS[i % SYNTHETIC_FIXTURE_IDS.length];
    if (!fixtureId) continue;
    const meta = SYNTHETIC_FIXTURE_META[fixtureId];
    items.push({
      applicationId: fixtureId,
      brand: meta.brand,
      beverageType: meta.beverageType,
      form: meta.form,
      faces: [
        { kind: "front", bytes: jpeg, mime: "image/jpeg" },
        { kind: "back", bytes: jpeg, mime: "image/jpeg" },
      ],
      status: "pending",
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (raw === null || typeof raw !== "object") {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request body did not match the batch schema." },
      { status: 400 },
    );
  }

  const { count, applications } = parsed.data;

  let seeds: SeedItem[];
  if (applications && applications.length > 0) {
    if (applications.length > batchConfig.maxItems) {
      return NextResponse.json(
        {
          error: `Batch exceeds maxItems (${applications.length} > ${batchConfig.maxItems}).`,
        },
        { status: 400 },
      );
    }
    seeds = applications.map(seedFromExplicit);
  } else {
    const requested = count ?? batchConfig.syntheticDefaultCount;
    if (requested > batchConfig.maxItems) {
      return NextResponse.json(
        {
          error: `Batch exceeds maxItems (${requested} > ${batchConfig.maxItems}).`,
        },
        { status: 400 },
      );
    }
    seeds = await buildSyntheticItems(requested);
  }

  const job = createJobWithFailures(seeds);

  // Fire-and-forget the orchestrator. The handler returns the jobId
  // immediately; subsequent polls of GET /api/batch/[id] reflect the
  // in-place updates the orchestrator makes.
  void runBatch(job.jobId, { concurrency: batchConfig.concurrency });

  return NextResponse.json({ jobId: job.jobId }, { status: 201 });
}
