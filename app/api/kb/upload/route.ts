/**
 * POST /api/kb/upload — admin-only multipart ingest entry point (P4-1).
 *
 * Hands the uploaded file to `ingestUpload`, which kicks off the
 * parse → chunk → embed → upsert pipeline off the request path. The
 * handler returns 202 Accepted with `{ sourceFilename, version }` so
 * the UI can begin polling `/api/kb/sources` immediately; the file's
 * final `ready` / `failed` status comes from the source list, never
 * from this response.
 *
 * Prototype seam — admin gating: the route trusts the client-supplied
 * `uploadedBy` field. The actual admin check happens at two cheaper
 * layers in the prototype: (1) the route-layer redirect in
 * `app/(admin)/layout.tsx`, and (2) the access cookie in
 * `middleware.ts`. Production swaps this for a real auth context
 * (P6-3 — PIV/CAC + SSO + RBAC) and resolves the actor server-side.
 * Because there is no React context in a route handler, there is
 * nowhere to read the active admin from here today.
 *
 * Validation is deliberately strict on the wire: size (12 MB) and
 * mime allow-list. These limits are NOT the canonical caps — the
 * ingestion pipeline enforces its own — but rejecting at the edge
 * keeps obvious abuse off the embedding budget.
 */

import { NextResponse } from "next/server";

import { ingestUpload } from "@/lib/kb/ingest";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
]);

export async function POST(req: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (fileEntry.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 12 MB)" },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME_TYPES.has(fileEntry.type)) {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 400 },
    );
  }

  const uploadedByRaw = form.get("uploadedBy");
  const uploadedBy =
    typeof uploadedByRaw === "string" && uploadedByRaw.length > 0
      ? uploadedByRaw
      : "admin";

  const arrayBuffer = await fileEntry.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  const kickoff = ingestUpload({
    filename: fileEntry.name,
    bytes,
    mime: fileEntry.type,
    uploadedBy,
  });

  return NextResponse.json(
    { sourceFilename: kickoff.sourceFilename, version: kickoff.version },
    { status: 202 },
  );
}
