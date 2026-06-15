/**
 * Vitest config.
 *
 * `@/*` alias mirrors `tsconfig.json` so production code and tests use the
 * same import surface. The `tests/` directory holds top-level smoke and
 * acceptance tests; per-module tests live next to the code in `__tests__/`.
 *
 * P5-2 (offline eval harness) adds a separate `test:eval` invocation that
 * runs the golden-set evaluation through `scripts/eval-harness.ts` rather
 * than through Vitest, because the eval surface needs different metrics
 * and reporting than the unit-test runner provides.
 */

import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node — most of the suite is pure functions and HTTP
    // route handlers. Component tests live alongside their own files
    // with /** @vitest-environment jsdom */ banners so jsdom only spins
    // up where it's actually needed (cheaper, no global pollution).
    environment: "node",
    include: [
      "lib/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "app/**/*.{test,spec}.{ts,tsx}",
    ],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
