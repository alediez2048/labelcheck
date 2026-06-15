/**
 * POST /api/verify — synchronous verification endpoint.
 *
 * This file is the only place the backend's pipeline is composed end to
 * end (preprocess → extract → match → confidence → merge → triage). Every
 * step lives in its own module; this handler is glue. Reimplementing any
 * step here would dilute the seams the rest of the system depends on,
 * which is why the spec is explicit about "glue, not logic" — see the
 * ticket file's Common Gotchas.
 *
 * Two non-obvious shapes the handler has to enforce:
 *
 * 1. Unreadable images return a STRUCTURED 200, not a 500. FR-16 / FR-26b
 *    treat "I couldn't read the image" as a normal outcome the agent
 *    handles by asking for a re-upload — not a server error. The short-
 *    circuit happens before matching runs, because there's nothing to
 *    match against.
 *
 * 2. Validation errors return 400 with plain-language messages, never a
 *    zod path or stack trace. The reasons are user-facing (NFR-2);
 *    leaking framework noise into the agent UI would erode trust.
 *
 * The access gate is enforced at the edge by `middleware.ts` (P0-6).
 * Nothing inside this handler depends on the gate being on or off — the
 * gate is a spend shield, not auth (P6-3 is the real identity work).
 */

import { NextResponse } from "next/server";

import { extract, type ExtractableApplication } from "@/lib/extraction/service";
import { matchApplication } from "@/lib/matching/match";
import { classify } from "@/lib/triage/classify";
import {
  validateApplication,
  type ApplicationSubmission,
} from "@/lib/validation/application";
import type { ExtractionResponse, FaceExtraction } from "@/lib/provider";
import type {
  FaceKind,
  FieldResult,
  VerificationResult,
  WarningFlags,
} from "@/types";

const FACE_LABELS: Readonly<Record<FaceKind, string>> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
};

type JsonFace = {
  kind?: unknown;
  /** Base64-encoded image bytes, optionally prefixed with a data: URL header. */
  bytes?: unknown;
  mime?: unknown;
};

type JsonBody = {
  applicationId?: unknown;
  beverageType?: unknown;
  form?: unknown;
  faces?: unknown;
};

// ---------------------------------------------------------------------------
// Wire decoding — base64 / data URLs → Buffer
// ---------------------------------------------------------------------------

/**
 * Decode a base64 string (or `data:image/...;base64,...` URL) into a
 * Buffer. Returns null on any malformed input — the caller emits a 400
 * with the user-facing reason.
 *
 * The wire shape is JSON because the form is a Next.js client component
 * that fetches() into this handler; multipart would force a separate
 * parsing path for tests vs. browser. Base64 is the cost of staying on
 * one JSON contract — at the 1568px preprocess cap, a face is well under
 * the request body limit.
 */
function decodeFaceBytes(raw: unknown): Buffer | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const stripped = raw.startsWith("data:")
    ? raw.slice(raw.indexOf(",") + 1)
    : raw;
  try {
    const buf = Buffer.from(stripped, "base64");
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

type DecodedSubmission = {
  applicationId: string;
  body: {
    beverageType: unknown;
    form: unknown;
    faces: Array<{ kind: unknown; bytes: Buffer; mime: unknown }>;
  };
};

type DecodeResult =
  | { ok: true; submission: DecodedSubmission }
  | { ok: false; error: string; fields: string[] };

function decodeBody(raw: JsonBody): DecodeResult {
  const applicationId =
    typeof raw.applicationId === "string" && raw.applicationId.length > 0
      ? raw.applicationId
      : null;
  if (applicationId === null) {
    return {
      ok: false,
      error: "Application id is required.",
      fields: ["applicationId"],
    };
  }

  if (!Array.isArray(raw.faces) || raw.faces.length === 0) {
    return {
      ok: false,
      error: "Upload at least one label face image.",
      fields: ["faces"],
    };
  }

  const decoded: Array<{ kind: unknown; bytes: Buffer; mime: unknown }> = [];
  for (let i = 0; i < raw.faces.length; i++) {
    const face = raw.faces[i] as JsonFace | undefined;
    if (!face || typeof face !== "object") {
      return {
        ok: false,
        error: `Face #${i + 1} is missing or malformed.`,
        fields: [`faces.${i}`],
      };
    }
    const bytes = decodeFaceBytes(face.bytes);
    if (bytes === null) {
      return {
        ok: false,
        error: `Face #${i + 1} image data is missing or could not be decoded.`,
        fields: [`faces.${i}.bytes`],
      };
    }
    decoded.push({ kind: face.kind, bytes, mime: face.mime });
  }

  return {
    ok: true,
    submission: {
      applicationId,
      body: {
        beverageType: raw.beverageType,
        form: raw.form,
        faces: decoded,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Unreadable-image detection
// ---------------------------------------------------------------------------

/**
 * A face is "unreadable" when the extraction layer produced nothing the
 * matching engine could use against it. That's the AC-6 / FR-26b case:
 * the model couldn't transcribe text, declined, or reported low
 * legibility WITH no usable transcription. We short-circuit BEFORE
 * matching because there's nothing to compare — running matching would
 * generate a wall of not_found verdicts that drown the real signal.
 *
 * The detection inputs are exactly what `lib/provider/types.ts` says the
 * model returns: a `fields` map and a `warning` flags object. A non-
 * empty `fields` value OR `warning.presence: true` counts as "some
 * usable text"; if both are empty the face is unreadable. A face that
 * is otherwise blank but reports `warning.legibility: "low"` is also
 * unreadable — the model is telling us it couldn't read this face.
 */
function isFaceUnreadable(face: FaceExtraction): boolean {
  const hasFieldText = Object.values(face.fields).some(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (hasFieldText) return false;
  if (face.warning.presence) return false;
  // No fields, no warning. If legibility is "low" the model is signalling
  // it couldn't read this face; if legibility is "good" the face was
  // genuinely blank, which is still unreadable for our purposes (the
  // matching engine has nothing to work with).
  return true;
}

function unreadableFaces(extraction: ExtractionResponse): FaceKind[] {
  return extraction.faces.filter(isFaceUnreadable).map((f) => f.kind);
}

// ---------------------------------------------------------------------------
// Building the unreadable VerificationResult
// ---------------------------------------------------------------------------

const EMPTY_WARNING: WarningFlags = {
  presence: false,
  allCaps: false,
  boldConfident: "uncertain",
  legibility: "low",
};

function unreadableFlagFor(face: FaceKind): string {
  return `${FACE_LABELS[face]} face is unreadable — please re-upload a clearer image.`;
}

function buildUnreadableResult(opts: {
  applicationId: string;
  unreadable: ReadonlyArray<FaceKind>;
}): VerificationResult {
  return {
    applicationId: opts.applicationId,
    lane: "review",
    overallConfidence: 0,
    fields: [],
    warning: EMPTY_WARNING,
    flags: opts.unreadable.map(unreadableFlagFor),
    extractionFailed: true,
    recommendation: "return_unreadable_image",
  };
}

/**
 * Build the structured "could not verify in time" result (D10, FR-16).
 *
 * Surfaced when the extraction service exhausted its timeout + retry
 * budget. Lane=review (input-quality issue, not a regulatory failure),
 * overall confidence pinned to zero so the triage classifier's "minimum
 * field confidence" intuition still reads, with a single flag the agent
 * can act on. We reuse `extractionFailed: true` because the downstream
 * shape is identical — extraction did not yield usable text — but the
 * message wording distinguishes the timeout from a generic unreadable.
 */
function buildTimeoutResult(opts: {
  applicationId: string;
  degraded: "timeout" | "transient";
}): VerificationResult {
  const message =
    opts.degraded === "timeout"
      ? "Could not verify in time — the label-reading service was slow to respond. Please try again, or request a better image from the applicant."
      : "Could not verify in time — the label-reading service is temporarily unavailable. Please try again in a moment.";
  return {
    applicationId: opts.applicationId,
    lane: "review",
    overallConfidence: 0,
    fields: [],
    warning: EMPTY_WARNING,
    flags: [message],
    extractionFailed: true,
    recommendation: "return_unreadable_image",
  };
}

// ---------------------------------------------------------------------------
// Building the standard VerificationResult
// ---------------------------------------------------------------------------

/**
 * Compose the public WarningFlags for the response.
 *
 * The per-face warning flags differ across faces (the front usually has
 * presence:false, the back carries the warning). For the public result
 * we surface the flags from the face the warning matcher pinned the
 * verdict to — that's the face the agent's UI is going to point at.
 * Falling back to the first face on a no-match edge case keeps the
 * shape stable; the warning's `presence: false` value carries the
 * "couldn't find a warning anywhere" signal in that case.
 */
function pickWarningFlags(
  fields: ReadonlyArray<FieldResult>,
  extraction: ExtractionResponse,
): WarningFlags {
  const warningField = fields.find((f) => f.field === "government_warning");
  const sourceFace = warningField?.sourceFace ?? null;
  if (sourceFace !== null) {
    const face = extraction.faces.find((f) => f.kind === sourceFace);
    if (face) return face.warning;
  }
  const first = extraction.faces[0];
  return first ? first.warning : EMPTY_WARNING;
}

function buildSuccessResult(opts: {
  applicationId: string;
  fields: FieldResult[];
  extraction: ExtractionResponse;
}): VerificationResult {
  const triage = classify({ fieldResults: opts.fields });
  return {
    applicationId: opts.applicationId,
    lane: triage.lane,
    overallConfidence: triage.overallConfidence,
    fields: opts.fields,
    warning: pickWarningFlags(opts.fields, opts.extraction),
    flags: triage.reasons,
    extractionFailed: false,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Log one end-to-end request span. Called from the POST handler's
 * `finally` so every return path is covered. PII (form values, image
 * bytes, transcribed text) stays out per NFR-4 / observability.md.
 */
function logRequestSpan(opts: {
  applicationId: string | null;
  outcome: "ok" | "validation" | "degraded" | "unreadable" | "error";
  lane?: string;
  startedAt: number;
  status: number;
}): void {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "verify.request",
      applicationId: opts.applicationId ?? "<unknown>",
      outcome: opts.outcome,
      lane: opts.lane,
      status: opts.status,
      e2eMs: Math.round(performance.now() - opts.startedAt),
    }),
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  // End-to-end timing for the /api/verify request — the NFR-1 5s
  // p95 budget is measured against this number. The extraction layer
  // also logs its own per-request timing so we can isolate the
  // dominant cost (P1-11; observability.md: What We Instrument).
  const startedAt = performance.now();
  let applicationId: string | null = null;
  let outcome: "ok" | "validation" | "degraded" | "unreadable" | "error" =
    "ok";
  let lane: string | undefined;
  let status = 200;
  try {
    // 1. Parse JSON. A malformed body is a 400 with a plain-language
    //    reason — never an unhandled exception bubbling up.
    let raw: JsonBody;
    try {
      raw = (await req.json()) as JsonBody;
    } catch {
      outcome = "validation";
      status = 400;
      return NextResponse.json(
        { error: "Request body must be valid JSON.", fields: [] },
        { status: 400 },
      );
    }

    if (!raw || typeof raw !== "object") {
      outcome = "validation";
      status = 400;
      return NextResponse.json(
        { error: "Request body must be a JSON object.", fields: [] },
        { status: 400 },
      );
    }

    // 2. Decode wire-format bytes → Buffer per face. Failure here is also a
    //    400 — the agent's UI can surface "face N could not be decoded"
    //    without leaking a zod path.
    const decoded = decodeBody(raw);
    if (!decoded.ok) {
      outcome = "validation";
      status = 400;
      return NextResponse.json(
        { error: decoded.error, fields: decoded.fields },
        { status: 400 },
      );
    }
    applicationId = decoded.submission.applicationId;

    // 3. Validate the (now Buffer-bearing) submission against the P1-1
    //    zod schema. The validator returns a UI-friendly shape — no zod
    //    paths leak through.
    const validation = validateApplication(decoded.submission.body);
    if (!validation.ok) {
      const fieldNames = Object.keys(validation.fieldErrors);
      const fieldMessages = Object.values(validation.fieldErrors).filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      );
      const message =
        fieldMessages[0] ??
        validation.formErrors[0] ??
        "Submission could not be validated.";
      outcome = "validation";
      status = 400;
      return NextResponse.json(
        { error: message, fields: fieldNames },
        { status: 400 },
      );
    }

    const submission: ApplicationSubmission = validation.data;

    // 4. Run extraction. Preprocessing happens inside the service so the
    //    handler stays a glue layer (D7). Bytes never leave the request
    //    lifecycle.
    const extractable: ExtractableApplication = {
      id: decoded.submission.applicationId,
      beverageType: submission.beverageType,
      faces: submission.faces.map((f) => ({
        kind: f.kind,
        bytes: f.bytes,
        mime: f.mime,
      })),
    };

    let extraction: ExtractionResponse;
    try {
      extraction = await extract(extractable);
    } catch {
      // An extraction-pipeline failure (decode error, provider exception)
      // is treated as an unreadable input rather than a 500 (FR-16).
      const allFaces = extractable.faces.map((f) => f.kind);
      outcome = "unreadable";
      lane = "review";
      return NextResponse.json(
        buildUnreadableResult({
          applicationId: decoded.submission.applicationId,
          unreadable: allFaces,
        }),
      );
    }

    // 5a. Short-circuit on a degraded extraction (D10 — timeout or
    //     exhausted-retry transient).
    if (extraction.degraded) {
      outcome = "degraded";
      lane = "review";
      return NextResponse.json(
        buildTimeoutResult({
          applicationId: decoded.submission.applicationId,
          degraded: extraction.degraded,
        }),
      );
    }

    // 5b. Short-circuit if any face is unreadable (FR-26b).
    const unreadable = unreadableFaces(extraction);
    if (unreadable.length > 0) {
      outcome = "unreadable";
      lane = "review";
      return NextResponse.json(
        buildUnreadableResult({
          applicationId: decoded.submission.applicationId,
          unreadable,
        }),
      );
    }

    // 6. Match → triage.
    const fieldResults = matchApplication({
      beverageType: submission.beverageType,
      form: submission.form,
      extraction,
    });

    const success = buildSuccessResult({
      applicationId: decoded.submission.applicationId,
      fields: fieldResults,
      extraction,
    });
    lane = success.lane;
    return NextResponse.json(success);
  } catch (err) {
    outcome = "error";
    status = 500;
    throw err;
  } finally {
    logRequestSpan({ applicationId, outcome, lane, startedAt, status });
  }
}
