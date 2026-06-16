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

import { ZodError } from "zod";

import warningJson from "../../config/warning.json";
import tolerancesJson from "../../config/tolerances.json";
import fieldsByTypeJson from "../../config/fields-by-type.json";
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

/**
 * Validate one of the bundled JSON config blobs against its Zod
 * schema. Bundled at build time via direct ES-module imports so the
 * code runs everywhere — including serverless functions where
 * process.cwd() doesn't point at the source tree.
 */
function validateConfig<T>(
  file: string,
  raw: unknown,
  schema: { parse: (v: unknown) => T },
): T {
  try {
    return schema.parse(raw);
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
    warningCache = validateConfig("warning.json", warningJson, WarningConfigSchema);
  }
  return warningCache;
}

/** Per-field matching rules and thresholds (FR-8, FR-9, FR-10, A19). */
export function getTolerances(): TolerancesConfig {
  if (tolerancesCache === null) {
    tolerancesCache = validateConfig("tolerances.json", tolerancesJson, TolerancesConfigSchema);
  }
  return tolerancesCache;
}

/** Required-field list for a beverage type (FR-3, A10). */
export function getRequiredFields(
  beverageType: BeverageType,
): readonly ConfigFieldKey[] {
  if (fieldsByTypeCache === null) {
    fieldsByTypeCache = validateConfig("fields-by-type.json", fieldsByTypeJson, FieldsByTypeConfigSchema);
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
  ConfidenceConfig,
  ConfigFieldKey,
  FieldRule,
  FieldsByTypeConfig,
  TolerancesConfig,
  WarningConfig,
  WarningLegibilityRereadConfig,
} from "./schema";
