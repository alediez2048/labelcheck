/**
 * File-backed corpus store for the agent-correction feedback loop (P5-3).
 *
 * Append-only JSONL files under `eval-data/agent-corrections/{ISO date}.jsonl`.
 * One day per file so the daily reader for the disagreement queue and
 * the sampler's "today's overrides" counter only have to open one file,
 * not scan an unbounded directory.
 *
 * **Prototype-only.** The ticket gotcha calls out that this moves to a
 * governed DB in P6-2 — the prototype rewrites a day's file in
 * `updateCorpusRecord`, which is acceptable for the prototype's volume
 * but not for production. The function signatures here are the seam:
 * P6-2 swaps the implementation, the recorder + the API routes don't
 * change.
 *
 * Privacy: every line is a `CorpusRecord` (see `types.ts`) — no raw
 * applicant id, no raw applicant text. The append-only file format
 * makes after-the-fact redaction trivial (the line is the unit).
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CorpusRecord } from "./types";

const DEFAULT_DATA_DIR = path.join(
  process.cwd(),
  "eval-data",
  "agent-corrections",
);

function isoDate(d: Date): string {
  // ISO date (YYYY-MM-DD) in UTC. The recorder anchors the file on the
  // record's `recordedAt`, so a day rollover at midnight UTC is the
  // file rollover too.
  return d.toISOString().slice(0, 10);
}

function fileFor(record: CorpusRecord, dataDir: string): string {
  const date = isoDate(new Date(record.recordedAt));
  return path.join(dataDir, `${date}.jsonl`);
}

/**
 * Append one record as a single JSON line. Creates the dir if needed.
 *
 * Best-effort fsync: `appendFile` followed by `writeFile`-style flush is
 * not used — Node's append in append mode is atomic per line on POSIX
 * for lines under PIPE_BUF (~4KB), and our records sit well under that.
 * Production migrates to a real DB anyway (P6-2).
 */
export async function appendCorpusRecord(
  record: CorpusRecord,
  opts?: { now?: () => Date; dataDir?: string },
): Promise<void> {
  const dataDir = opts?.dataDir ?? DEFAULT_DATA_DIR;
  await mkdir(dataDir, { recursive: true });
  const target = fileFor(record, dataDir);
  const line = JSON.stringify(record) + "\n";
  const { appendFile } = await import("node:fs/promises");
  await appendFile(target, line, "utf-8");
}

/**
 * Read ALL `.jsonl` files in the corpus dir, parse each line into a
 * `CorpusRecord`, and return them sorted oldest-first by `recordedAt`.
 *
 * Optional `from` / `to` date filters are inclusive on `from`, exclusive
 * on `to` (standard half-open range). Malformed lines are skipped with
 * a single console.warn per file rather than throwing — a single
 * corrupt line should not take the agreement endpoint down.
 */
export async function readCorpusRecords(opts?: {
  dataDir?: string;
  from?: Date;
  to?: Date;
}): Promise<CorpusRecord[]> {
  const dataDir = opts?.dataDir ?? DEFAULT_DATA_DIR;
  let entries: string[];
  try {
    entries = await readdir(dataDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const records: CorpusRecord[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const filePath = path.join(dataDir, name);
    let body: string;
    try {
      body = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = body.split("\n");
    let badLines = 0;
    for (const raw of lines) {
      if (raw.length === 0) continue;
      try {
        const parsed = JSON.parse(raw) as CorpusRecord;
        records.push(parsed);
      } catch {
        badLines += 1;
      }
    }
    if (badLines > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[feedback/corpus] skipped ${badLines} malformed line(s) in ${filePath}`,
      );
    }
  }
  // Filter by half-open date range if supplied.
  let filtered = records;
  if (opts?.from || opts?.to) {
    const fromTs = opts?.from ? opts.from.getTime() : Number.NEGATIVE_INFINITY;
    const toTs = opts?.to ? opts.to.getTime() : Number.POSITIVE_INFINITY;
    filtered = records.filter((r) => {
      const t = new Date(r.recordedAt).getTime();
      return t >= fromTs && t < toTs;
    });
  }
  filtered.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return filtered;
}

/**
 * Update one record by id. Reads the day's file, rewrites it with the
 * patched line. Acceptable for the prototype's volume; production
 * (P6-2) does a single-row UPDATE against the governed datastore.
 *
 * Returns the updated record, or `null` when no record matches.
 */
export async function updateCorpusRecord(
  id: string,
  patch: Partial<CorpusRecord>,
  opts?: { dataDir?: string },
): Promise<CorpusRecord | null> {
  const dataDir = opts?.dataDir ?? DEFAULT_DATA_DIR;
  let entries: string[];
  try {
    entries = await readdir(dataDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const filePath = path.join(dataDir, name);
    let body: string;
    try {
      body = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = body.split("\n");
    let updated: CorpusRecord | null = null;
    const rewritten: string[] = [];
    for (const raw of lines) {
      if (raw.length === 0) {
        rewritten.push(raw);
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as CorpusRecord;
        if (parsed.id === id) {
          updated = { ...parsed, ...patch, id: parsed.id };
          rewritten.push(JSON.stringify(updated));
        } else {
          rewritten.push(raw);
        }
      } catch {
        rewritten.push(raw);
      }
    }
    if (updated) {
      await writeFile(filePath, rewritten.join("\n"), "utf-8");
      return updated;
    }
  }
  return null;
}
