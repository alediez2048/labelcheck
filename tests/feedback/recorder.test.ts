/**
 * P5-3 — recorder + corpus round-trip (`lib/feedback/recorder.ts`).
 *
 * Hermetic file-backed tests using a tmpdir per `it`. Asserts the
 * three classification paths (agreement / flag / clear) AND the
 * NFR-4 invariant that the raw applicationId never appears in plain
 * text inside the corpus file.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordDispositionForFeedbackLoop } from "@/lib/feedback/recorder";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "feedback-recorder-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function readAllRecords(): Promise<unknown[]> {
  const entries = await readdir(dataDir);
  const lines: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const body = await readFile(path.join(dataDir, name), "utf-8");
    for (const line of body.split("\n")) {
      if (line.length > 0) lines.push(line);
    }
  }
  return lines.map((l) => JSON.parse(l));
}

async function readAllRaw(): Promise<string> {
  const entries = await readdir(dataDir);
  let out = "";
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    out += await readFile(path.join(dataDir, name), "utf-8");
  }
  return out;
}

describe("recordDispositionForFeedbackLoop (P5-3)", () => {
  it("records an agreement when predicted match + approve", async () => {
    const result = await recordDispositionForFeedbackLoop(
      {
        applicationId: "harbor-mist-vodka-001",
        beverageType: "distilled_spirits",
        brand: "Harbor Mist",
        predictedLane: "match",
        predictedFields: [
          {
            field: "brand_name",
            verdict: "match",
            confidence: 0.95,
            sourceFace: "front",
          },
        ],
        disposition: { kind: "approve" },
        decidedBy: "agent-marcus",
        decidedAt: "2026-06-15T12:00:00.000Z",
      },
      { dataDir },
    );

    expect(result.overrideKind).toBe("agreement");
    const records = (await readAllRecords()) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    const row = records[0]!;
    expect(row.overrideKind).toBe("agreement");
    expect(row.sampled).toBe(false);
    expect(row.confirmation).toBe("pending");
  });

  it("records a flag when predicted match + return for correction", async () => {
    const result = await recordDispositionForFeedbackLoop(
      {
        applicationId: "harbor-mist-vodka-001",
        beverageType: "distilled_spirits",
        brand: "Harbor Mist",
        predictedLane: "match",
        predictedFields: [
          {
            field: "alcohol_content",
            verdict: "match",
            confidence: 0.92,
            sourceFace: "front",
          },
        ],
        disposition: {
          kind: "return_for_correction",
          returnReason: {
            failedFields: [
              {
                field: "alcohol_content",
                formValue: "40%",
                extractedValue: "45%",
                reason: "ABV mismatch: form 40% vs label 45%",
              },
            ],
          },
        },
        decidedBy: "agent-marcus",
        decidedAt: "2026-06-15T12:01:00.000Z",
      },
      { dataDir },
    );

    expect(result.overrideKind).toBe("flag");
    const records = (await readAllRecords()) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    const row = records[0]!;
    expect(row.overrideKind).toBe("flag");
    expect(row.effectiveLane).toBe("mismatch");
    expect(typeof row.applicationIdHash).toBe("string");
    expect(String(row.applicationIdHash).startsWith("sha256:")).toBe(true);
    expect(row.returnReasonFields).toBeDefined();
  });

  it("records a clear when predicted mismatch + approve", async () => {
    const result = await recordDispositionForFeedbackLoop(
      {
        applicationId: "cedar-grove-merlot-002",
        beverageType: "wine",
        brand: "Cedar Grove",
        predictedLane: "mismatch",
        predictedFields: [
          {
            field: "net_contents",
            verdict: "mismatch",
            confidence: 0.66,
            sourceFace: "back",
          },
        ],
        disposition: { kind: "approve" },
        decidedBy: "agent-priya",
        decidedAt: "2026-06-15T12:02:00.000Z",
      },
      { dataDir },
    );

    expect(result.overrideKind).toBe("clear");
    const records = (await readAllRecords()) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    const row = records[0]!;
    expect(row.overrideKind).toBe("clear");
    expect(row.effectiveLane).toBe("match");
  });

  it("never writes the raw applicationId in plaintext", async () => {
    const applicationId = "harbor-mist-vodka-NEVER-IN-PLAINTEXT";
    await recordDispositionForFeedbackLoop(
      {
        applicationId,
        beverageType: "distilled_spirits",
        brand: "Harbor Mist",
        predictedLane: "match",
        predictedFields: [],
        disposition: { kind: "approve" },
        decidedBy: "agent-marcus",
        decidedAt: "2026-06-15T12:03:00.000Z",
      },
      { dataDir },
    );
    const raw = await readAllRaw();
    expect(raw).not.toContain(applicationId);
    // The hashed prefix is there.
    expect(raw).toContain("sha256:");
  });
});
