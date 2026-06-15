/**
 * Configuration loader — reads JSON from `config/`, validates with Zod,
 * and exposes typed accessors. Memoised: each file is read once per
 * process, so the matching engine (P1-3) can call `getTolerances()` in
 * a hot path without thinking about it.
 *
 * Errors at startup cite the file and the offending field so a compliance
 * reviewer editing the JSON gets a clear, actionable message rather than
 * a stack trace.
 */

import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";

import type { BeverageType } from "@/types";
import {
  FieldsByTypeConfigSchema,
  TolerancesConfigSchema,
  WarningConfigSchema,
  type ConfigFieldKey,
  type FieldsByTypeConfig,
  type TolerancesConfig,
  type WarningConfig,
} from "./schema";

const CONFIG_DIR = path.join(process.cwd(), "config");

/**
 * Read a JSON file from `config/`, parse, validate with the given schema.
 * Throws a single, file-named error on any failure — no stack traces in
 * the message body.
 */
function loadJson<T>(file: string, schema: { parse: (v: unknown) => T }): T {
  const filepath = path.join(CONFIG_DIR, file);

  let raw: string;
  try {
    raw = fs.readFileSync(filepath, "utf8");
  } catch (err) {
    throw new Error(
      `Failed to read config/${file}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in config/${file}: ${(err as Error).message}`,
    );
  }

  try {
    return schema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      const summary = err.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid config/${file}: ${summary}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Memoised accessors
// ---------------------------------------------------------------------------

let warningCache: WarningConfig | null = null;
let tolerancesCache: TolerancesConfig | null = null;
let fieldsByTypeCache: FieldsByTypeConfig | null = null;

/** Canonical warning text + heading rules (FR-11, D6). */
export function getWarningConfig(): WarningConfig {
  if (warningCache === null) {
    warningCache = loadJson("warning.json", WarningConfigSchema);
  }
  return warningCache;
}

/** Per-field matching rules and thresholds (FR-8, FR-9, FR-10, A19). */
export function getTolerances(): TolerancesConfig {
  if (tolerancesCache === null) {
    tolerancesCache = loadJson("tolerances.json", TolerancesConfigSchema);
  }
  return tolerancesCache;
}

/** Required-field list for a beverage type (FR-3, A10). */
export function getRequiredFields(
  beverageType: BeverageType,
): readonly ConfigFieldKey[] {
  if (fieldsByTypeCache === null) {
    fieldsByTypeCache = loadJson("fields-by-type.json", FieldsByTypeConfigSchema);
  }
  return fieldsByTypeCache[beverageType];
}

/**
 * Test-only: reset the memo so a unit test can simulate a config reload.
 * Not part of the public surface that P1-3 consumes.
 */
export function _resetConfigCacheForTesting(): void {
  warningCache = null;
  tolerancesCache = null;
  fieldsByTypeCache = null;
}

export type {
  ConfigFieldKey,
  FieldsByTypeConfig,
  TolerancesConfig,
  WarningConfig,
} from "./schema";
