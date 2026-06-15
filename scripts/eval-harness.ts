/**
 * Eval harness placeholder.
 *
 * P5-2 (offline eval harness) implements this script. The hook is reserved
 * here so the CI workflow and the `pnpm test:eval` script slot in P0-7
 * don't need to be re-plumbed when P5-2 lands.
 *
 * What P5-2 will do (per observability.md, Component A):
 *   - Walk the golden set: green pairs from the Public COLA Registry +
 *     synthesized defects from the cola-generator.
 *   - For each case, run the verification path against the provider
 *     adapter (mock by default; live with a key set).
 *   - Compute and report: per-field precision/recall, lane accuracy,
 *     false-negative rate on real mismatches (the headline metric),
 *     warning-check accuracy, confidence calibration vs D5.
 *   - Exit non-zero on regression (P5-5 wires this into CI).
 */

console.log("Eval harness wired by P5-2 — not implemented in Phase 0.");
process.exit(0);
