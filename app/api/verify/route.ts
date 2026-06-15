/**
 * POST /api/verify — synchronous verification endpoint.
 *
 * This file is the only place the synchronous request lifecycle is glued
 * together: wire-decode → validate → invoke the reusable per-application
 * pipeline (`lib/verify/runVerification.ts`) → emit one structured log
 * line. The pipeline itself (extract → match → triage) is the SAME
 * function the batch orchestrator (P3-1) calls; extracting it kept the
 * single-application path identical to the batch path so the two cannot
 * drift.
 *
 * Two non-obvious shapes the handler has to enforce:
 *
 * 1. Unreadable images return a STRUCTURED 200, not a 500. FR-16 / FR-26b
 *    treat "I couldn't read the image" as a normal outcome the agent
 *    handles by asking for a re-upload — not a server error. The handler
 *    surfaces the result `runVerification` returns; the lane / flag
 *    distinction is inside the pipeline.
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

import { runVerification } from "@/lib/verify/runVerification";
import {
  validateApplication,
  type ApplicationSubmission,
} from "@/lib/validation/application";
import type { VerificationResult } from "@/types";

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

/**
 * Translate the pipeline's `VerificationResult` into the outcome label
 * used by the structured log line. The lane alone isn't enough — an
 * unreadable result and a degraded result both land in `review` but
 * have distinct flag shapes we want to surface in observability.
 */
function outcomeFor(
  result: VerificationResult,
): "ok" | "degraded" | "unreadable" {
  if (!result.extractionFailed) return "ok";
  // The pipeline emits the same recommendation for both unreadable and
  // degraded paths; the degraded message starts with "Could not verify
  // in time". That's a stable wire-level signal we can branch on here
  // without leaking pipeline internals.
  const firstFlag = result.flags[0] ?? "";
  if (firstFlag.startsWith("Could not verify in time")) return "degraded";
  return "unreadable";
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

    // 4. Run the reusable per-application pipeline (extract → match →
    //    triage). The pipeline lives in `lib/verify/runVerification.ts`
    //    so the batch orchestrator (P3-1) composes the same flow.
    const result = await runVerification({
      applicationId: decoded.submission.applicationId,
      beverageType: submission.beverageType,
      form: submission.form,
      faces: submission.faces.map((f) => ({
        kind: f.kind,
        bytes: f.bytes,
        mime: f.mime,
      })),
    });

    outcome = outcomeFor(result);
    lane = result.lane;
    return NextResponse.json(result);
  } catch (err) {
    outcome = "error";
    status = 500;
    throw err;
  } finally {
    logRequestSpan({ applicationId, outcome, lane, startedAt, status });
  }
}
