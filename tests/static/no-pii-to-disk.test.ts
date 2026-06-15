/**
 * AC-10 / NFR-4 static check — fail the build if any verification-path
 * file imports a disk-write or persistence API.
 *
 * The prototype's privacy posture is "nothing persists" — images,
 * transcribed text, and the verification result all live in the request
 * lifecycle and disappear when it ends. A grep-level test catches the
 * regression where someone reaches for `fs.writeFile`, `localStorage`,
 * or a DB client to "just cache the result"; the static check fails
 * loud before the change can ship.
 *
 * This is NOT a runtime golden-set assertion (per the P1-10 ticket and
 * the brief): no PII to disk is verified by static analysis, not by
 * running the verification flow and inspecting side-effects. Side-
 * effect inspection would only catch the issue under the specific
 * scenarios the harness exercises; a grep catches the introduction
 * everywhere it could land.
 *
 * Scope:
 *   - `app/` — route handlers and pages
 *   - `lib/` — pipeline modules (extraction, matching, triage, etc.)
 *   - `middleware.ts` — the edge gate
 *
 * Allowlist:
 *   - `lib/image/preprocess.ts` may import `sharp` but must never
 *     `.toFile(...)` — preprocessing is in-memory only.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const PATHS = ["app", "lib", "middleware.ts"] as const;

/** Patterns whose presence in the verification path is a defect. */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bfs\.writeFile\b/, reason: "fs.writeFile — writes bytes to disk" },
  { pattern: /\bfs\.writeFileSync\b/, reason: "fs.writeFileSync — writes bytes to disk" },
  { pattern: /\bfs\.appendFile\b/, reason: "fs.appendFile — appends bytes to disk" },
  { pattern: /\bfs\.createWriteStream\b/, reason: "fs.createWriteStream — opens a disk write stream" },
  // `sharp(...).toFile(...)` — would persist a preprocessed image.
  { pattern: /\.toFile\s*\(/, reason: ".toFile() — sharp writes the image to disk" },
  { pattern: /\blocalStorage\b/, reason: "localStorage — browser persistence" },
  { pattern: /\bindexedDB\b/, reason: "indexedDB — browser persistence" },
  { pattern: /\bopen\(.+IDBDatabase/, reason: "IndexedDB usage" },
  // Known persistence clients — none of these belong in the Phase 1
  // verification path. Production persistence lands behind a separate
  // boundary in P6-2.
  { pattern: /from\s+["']pg["']/, reason: "pg — PostgreSQL client import" },
  { pattern: /from\s+["']postgres["']/, reason: "postgres — Postgres client import" },
  { pattern: /from\s+["']mongodb["']/, reason: "mongodb — MongoDB client import" },
  { pattern: /from\s+["']mysql2?["']/, reason: "mysql / mysql2 — MySQL client import" },
  { pattern: /from\s+["']sqlite3?["']/, reason: "sqlite / sqlite3 — SQLite client import" },
  { pattern: /from\s+["']redis["']/, reason: "redis — Redis client import" },
  { pattern: /from\s+["']ioredis["']/, reason: "ioredis — Redis client import" },
  { pattern: /from\s+["']@aws-sdk\/client-s3["']/, reason: "S3 client import" },
  { pattern: /from\s+["']@google-cloud\/storage["']/, reason: "GCS client import" },
];

const SKIP_FILE = (file: string): boolean => {
  if (file.includes("__tests__")) return true;
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return true;
  return false;
};

function listFiles(p: string, acc: string[]): void {
  const stat = statSync(p);
  if (stat.isFile()) {
    if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(p) && !SKIP_FILE(p)) acc.push(p);
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(p)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      listFiles(path.join(p, entry), acc);
    }
  }
}

describe("AC-10 — static no-PII-to-disk check (verification path)", () => {
  it("does not import any disk-write, browser-persistence, or DB-client API", () => {
    const files: string[] = [];
    for (const rel of PATHS) {
      listFiles(path.join(ROOT, rel), files);
    }

    const violations: Array<{ file: string; reason: string; line: number }> = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: path.relative(ROOT, file),
              reason,
              line: i + 1,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.reason}`)
        .join("\n");
      throw new Error(
        `AC-10 static check found persistence calls in the verification path:\n${msg}\n\n` +
          `If a real persistence boundary is being added, defer it to P6-2 and gate ` +
          `behind a feature flag — do not introduce it in the Phase 1 verification path.`,
      );
    }

    expect(violations.length).toBe(0);
  });
});
