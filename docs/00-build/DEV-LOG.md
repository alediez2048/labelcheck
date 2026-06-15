# DEV-LOG

Append-only log of completed tickets. Newest entries at the top. Each entry: ticket id, date, branch, summary, deviations, and a **Why** paragraph mirrored from the ticket file's `### Why` section. The Why rationale travels with both the per-ticket file (durable, topical) and this log (chronological, narrative).

---

## 2026-06-15 — Phase 0 exit ✅

All seven Phase 0 tickets are done and merged. Per the PRD §5 Phase 0 exit criteria:

- ✅ **The app boots** — `pnpm dev` serves the Tailwind-styled scaffold at `http://localhost:3000` (P0-1).
- ✅ **The mock adapter returns a structured extraction** — `getProvider()` defaults to `MockVisionProvider`; `extract()` returns canned `ExtractionResponse` data for the three sample IDs and a neutral fallback for unknown IDs (P0-3).
- ✅ **Types compile** — `types/domain.ts` exports the canonical contract; `pnpm build` succeeds in strict mode (P0-2).
- ✅ **CI runs** — `.github/workflows/ci.yml` runs lint + build + test on every push and PR. 25 tests across 5 files pass in under 1 second locally (P0-7).

Phase 1 (Core single-application verification — the MVP) is unblocked. The seams P0 named (the provider adapter at `lib/provider/`, the config store at `lib/config/`, the image preprocessor at `lib/image/`, the access gate at `middleware.ts`, the types at `types/`) are exactly the seams P1's matching engine, triage classifier, result API, and review UI attach to.

**Open from Phase 0:**
- **A18** — verbatim 27 CFR § 16.21 warning text is a placeholder in `config/warning.json`. Replace before production deployment; today the system runs against the placeholder and the matching engine compiles against it.

---

## 2026-06-15 — P0-7 CI and test harness

**Branch:** `feat/ci`
**Status:** Done

**What landed:**
- `pnpm add -D vitest @vitest/ui tsx` — Vitest 4.1, the UI runner, and `tsx` for the eval-harness script.
- `vitest.config.ts` — Node environment; `@/*` alias mirrors `tsconfig.json`; includes `lib/**/*.{test,spec}.ts`, `tests/**/*.{test,spec}.ts`, `app/**/*.{test,spec}.ts`.
- `package.json` scripts: `test` → `vitest run`; `test:watch` → `vitest`; `test:ui` → `vitest --ui`; `test:eval` → `tsx scripts/eval-harness.ts` (P5-2 hook).
- `tests/smoke.test.ts` — trivial passing test proving the runner is wired.
- `scripts/eval-harness.ts` — placeholder; prints "Eval harness wired by P5-2 — not implemented in Phase 0." and exits 0.
- `.github/workflows/ci.yml` — Node 20, pnpm 9, `pnpm install --frozen-lockfile`, lint + build + test on every push and PR. `ACCESS_PASSCODE` and `ACCESS_COOKIE_SECRET` explicitly emptied during build so the gate stays a no-op during route collection.
- Refactored `lib/provider/__tests__/mock.test.ts`, `lib/config/__tests__/load.test.ts`, `lib/image/__tests__/preprocess.test.ts`, `lib/access/__tests__/cookie.test.ts` to import from `vitest` instead of using the `declare function` scaffolding from P0-3..P0-6.
- README — added a Testing section (how to run locally, what `pnpm test:eval` reserves, NFR-4 no-PII-in-fixtures rule).

**Verification:**
- `pnpm test` clean — 5 files, **25 tests**, pass in 893ms locally.
- `pnpm test:eval` clean — prints the placeholder, exits 0.
- `pnpm build` clean (`✓ Compiled successfully in 1718ms`). New middleware bundle weight visible in build output: `ƒ Middleware 34.6 kB`.
- `pnpm lint` clean.

**Deviations from ticket:**
- None. All tests that were `declare`-scaffolded in P0-3..P0-6 promoted to real Vitest imports; none were `it.todo`'d.

**Why:**
P0-7 turns Phase 0's compile-time guarantees into runtime ones. The 25 tests across 5 files prove the type-level guards from P0-3 through P0-6 (extraction has no `verdict` field, dispositions are whole-application, the A18 placeholder is still in place, the image cap really fires at the long edge, the access cookie round-trips and rejects garbage) are not just type-system theater — they execute and pass. That matters because every later ticket reads this test surface as the contract; if Phase 0 shipped with skipped or `it.todo` tests, P1's matching engine would inherit the skipped state and the regression catch would shift to whenever someone noticed. Vitest is the right runner here for one specific reason: it's the standard the techstack already picked, and it reads our `@/*` alias from `vitest.config.ts` without a translator. We considered Jest — rejected because it doesn't understand ESM in 2026 without ts-jest plumbing, and the lint/build pipeline already runs Node ESM via Next.js. Jest would add a second module-resolution model that drifts from the rest of the project. We dropped the `declare function` blocks the P0-3–P0-6 test files used as Vitest-ready scaffolding and replaced them with real `import { describe, it, expect } from "vitest"`. The diff is mechanical; the tests are unchanged in behaviour; the runtime assertions that were previously zero-effect declarations now actually execute. The CI workflow pins Node 20 LTS and pnpm 9 by version because a floating "latest" guarantees a flaky build the day a new major lands; the local lockfile and the CI runner must agree, and that's only possible when both are pinned. `pnpm install --frozen-lockfile` is the safety net for a missing lockfile commit — CI fails loudly instead of silently resolving to whatever's newest. Test execution runs on Ubuntu rather than macOS because the deploy target (a single always-warm container per techstack Hosting) is Linux; catching a Linux-only `sharp` bug in CI is cheaper than catching it in production. `ACCESS_PASSCODE` and `ACCESS_COOKIE_SECRET` are explicitly emptied in the build step so the access gate stays a no-op during route collection — without that, Next's prerender of `/access` might fail in CI if a developer's shell happens to have the vars set. The `pnpm test:eval` script is reserved, not implemented; P5-2 owns the golden-set walker. We resisted scaffolding it here so the CI workflow and the `package.json` script don't need to be re-plumbed when P5-2 lands. The placeholder prints a single line and exits 0 so a curious developer running it today sees a clear "this is wired by P5-2" rather than a "command not found" or a half-built runner. `tsx` is the install cost we accepted to make the eval-harness runnable as a TypeScript file directly (no separate build step for a one-shot script).

**Next:** Phase 1 — Core single-application verification (the MVP). P1-1 (Application input and sample loader) is unblocked. Branch will be `feat/app-input`.

---

## 2026-06-15 — P0-6 Access gate

**Branch:** `feat/access-gate`
**Status:** Done

**What landed:**
- `middleware.ts` at the repo root — Edge-runtime gate. No-op when `ACCESS_PASSCODE` is unset; 500 fail-closed when set but `ACCESS_COOKIE_SECRET` is unset; otherwise verifies the `lc_access` HMAC cookie and either passes through, redirects browsers to `/access`, or 401s API calls. Matcher excludes `_next`, `favicon.ico`, `access`, `api/access`, `api/health`.
- `lib/access/cookie.ts` — WebCrypto HMAC-SHA256 sign/verify of a fixed payload (`"ok"`); base64url helpers; `timingSafeEqualString` for the passcode comparison. Edge-runtime compatible (no `node:crypto`).
- `app/access/page.tsx` — passcode entry form with a loud amber "spend shield, not security" banner citing NFR-8 / P6-3.
- `app/api/access/route.ts` — POST handler. Constant-time passcode compare; on success signs the cookie and sets it `HttpOnly`, `Secure`, `SameSite=Lax`; sanitises the `next` redirect target to same-origin.
- `app/api/health/route.ts` — `{ ok: true }`; excluded from the gate so deploy probes don't need a passcode.
- `.env.example` — documents all four env vars (`ACCESS_PASSCODE`, `ACCESS_COOKIE_SECRET`, `PROVIDER`, `IMAGE_MAX_LONG_EDGE`) with the spend-shield warning.
- `lib/access/__tests__/cookie.test.ts` — Vitest-ready (auto-discovered at P0-7) covering round-trip, wrong secret, empty/garbage cookies, base64url shape, and `timingSafeEqualString` cases.
- `README.md` — Environment table expanded with `ACCESS_PASSCODE` and `ACCESS_COOKIE_SECRET` rows, each citing the "not authentication" rule.

**Verification:**
- `pnpm build` clean (`✓ Compiled successfully in 1308ms`). Build output shows the new routes: `ƒ /access`, `ƒ /api/access`, `ƒ /api/health`.
- `pnpm lint` clean (`✔ No ESLint warnings or errors`).
- The TS 5.7+ generic typing of `Uint8Array<ArrayBufferLike>` required two explicit `Uint8Array<ArrayBuffer>` annotations (return type of `fromBase64Url` and the `sig` local in `verifyCookie`). Compiles strict mode; no casts.

**Deviations from ticket:**
- None on behaviour. The TS-typing fix required two explicit generic annotations rather than the simpler `Uint8Array` the ticket implied — documented inline in `cookie.ts`.

**Why:**
P0-6 is the SPEND SHIELD, full stop. The README says it, the entry page says it, `middleware.ts` says it, `cookie.ts` says it, and this DEV-LOG entry says it — four times — because the risk this ticket carries is that a future operator looks at a passcode-gated URL and concludes "we have auth." We don't. Production identity is PIV/CAC + SSO + RBAC + audit inside the FedRAMP boundary, and that's P6-3. Everything in this ticket is calibrated to make that confusion impossible: the env var is `ACCESS_PASSCODE` not `AUTH_SECRET`; the cookie is `lc_access` not `lc_auth`; the page banner uses the literal phrase "spend shield"; the JSDoc on `cookie.ts` repeats it. The scheme is HMAC over a fixed payload, not "the cookie IS the passcode." The cookie never carries the passcode in any form — it's a proof-of-knowledge token signed with `ACCESS_COOKIE_SECRET`. We considered a JWT and a session id and rejected both: a JWT brings claims, expiry, refresh logic, none of which fit a spend shield; a session id requires server-side state, which Phase 0 has none of (NFR-4) and an Edge-runtime middleware can't easily reach. The two-env-var split (`ACCESS_PASSCODE` for the human, `ACCESS_COOKIE_SECRET` for the server) means rotating the cookie secret invalidates every active session without changing the passcode users have to remember. WebCrypto over `node:crypto` because the middleware runs at the Edge runtime by default; `crypto.subtle.verify` is constant-time by spec, preferable to a hand-rolled string compare on the HMAC output. `timingSafeEqualString` is exported for the one place we DO compare strings directly (the passcode submission); the length leak it carries is not material because the passcode length is operator-known and fixed per deploy. The matcher excludes by design: a future agent who adds a public asset and forgets to add it to the matcher will see their asset return 401 and immediately understand why — that's the right failure mode. **Fail-closed on misconfiguration**: `ACCESS_PASSCODE` set but `ACCESS_COOKIE_SECRET` unset returns 500, not bypass; half-configured is more dangerous than unconfigured because it suggests the operator INTENDED to gate but the gate is open, so the 500 forces a fix.

**Next:** P0-7 — CI and test harness (Vitest installed; lint/build/test run in CI; the test stub from P0-1 replaced; the type-level test guards from P0-3, P0-4, P0-5, P0-6 light up as real runtime tests).

---

## 2026-06-15 — P0-5 Image preprocessing

**Branch:** `feat/image-prep`
**Status:** Done

**What landed:**
- `lib/image/preprocess.ts` — `preprocessImage(bytes, mime)` returns `{ bytes, width, height, mime }`. One chained sharp call: `.rotate().resize({ fit: "inside", withoutEnlargement: true })` expresses D7 as one line — cap the long edge at the configurable maximum if oversize, pass through unchanged otherwise, never upscale.
- `lib/image/index.ts` — barrel re-export.
- `lib/image/__tests__/preprocess.test.ts` — fixtures generated programmatically with `sharp.create` (no committed binaries). Covers: in-spec passthrough at 1200×800; landscape cap (3000×2000 → 1568×1045); portrait cap (2000×3000 → 1045×1568); EXIF orientation 6 normalises (400×600 stored → 600×400 displayed); corrupt bytes throw `Error("Image could not be decoded")`; `IMAGE_MAX_LONG_EDGE=1024` override respected.
- `README.md` — adds an Environment section documenting `PROVIDER` and `IMAGE_MAX_LONG_EDGE`, with the explicit "do not set below 1568 without changing the provider" warning (D7).
- `pnpm add sharp` (0.35.1) — promoted from transitive to explicit dep.

**Verification:**
- `pnpm build` clean (`✓ Compiled successfully in 956ms`)
- `pnpm lint` clean (`✔ No ESLint warnings or errors`)
- Structured log shape (`event`, `inputWidth`, `inputHeight`, `outputWidth`, `outputHeight`, `longEdgeCap`) is stable and PII-free — ready for the OpenTelemetry span swap in P5-1.

**Deviations from ticket:**
- Fixtures are generated programmatically in `beforeAll`-style setup inside each test rather than committed as binary JPEGs under `tests/fixtures/images/`. Self-documenting and keeps the repo light; the symptom of `sharp.create` breaking is loud and global, not specific to this test.
- One `eslint-disable-next-line no-console` carve-out for the structured log point, marked narrowly. The alternative (a logger package) is out of scope until P5-1.

**Why:**
P0-5 expresses D7 as a single chained sharp call: `.rotate().resize({ fit: "inside", withoutEnlargement: true })`. That one line is the entire safety case for the warning check — the smallest, highest-stakes text on the label. The temptation a future agent will face is to "improve latency" by shrinking the cap from 1568; D7 calls this out specifically, and the file's top comment makes the same point. We resisted writing the cap as `if (longEdge > maxEdge) resize else pass-through` because the chained `fit: "inside" + withoutEnlargement: true` expresses the exact same rule in sharp's vocabulary and is harder to break — there's no separate branch a future change can edit to insert a sneaky downscale. `.rotate()` with no args applies EXIF orientation; `.rotate(90)` rotates an **additional** 90 degrees on top. We call out this footgun in the comment because a future agent reading the code at midnight will absolutely add an angle by reflex. The two-pass metadata read (input metadata up front for the log; output metadata after the pipeline) is intentional — the log fires with pre-rotation dimensions so debugging "why is this image rotated" is one log line, and the result reports post-cap dimensions so consumers don't re-decode. Fixtures generated programmatically (via `sharp.create`) rather than committed binary JPEGs: the test reads "make a 3000x2000 image; expect 1568 long edge" which is self-documenting; a committed `oversize-3000x2000.jpg` requires opening it externally to know the assertion is meaningful. The repo stays lighter. `IMAGE_MAX_LONG_EDGE` is env-overridable with a Number-validated fallback — a bad value (`"abc"`, `0`, negative) silently falls back to the 1568 default rather than crashing the app; the only failure mode that actually matters here is "the cap is below 1568", and an unparseable value falls back to the right default. The `console.info` lint-disable for the structured log point is the one carve-out accepted; the log shape is the same shape OpenTelemetry's `image.preprocess` span will carry in P5-1, so the eventual swap is purely transport — the structured fields are stable. Bytes never log. Paths never log. A future change that adds a `path` or a `bytes` field silently violates NFR-4; the lint-disable is narrow enough that a reviewer will catch it.

**Next:** P0-6 — Access gate (shared-passcode middleware as a spend shield; documented as NOT a security control).

---

## 2026-06-15 — P0-4 Configuration store

**Branch:** `feat/config`
**Status:** Done

**What landed:**
- `config/warning.json` — canonical text slot (with the `__TODO_VERBATIM_TEXT_A18__` placeholder), heading text, CAPS strict, bold best-effort
- `config/tolerances.json` — per-field rules: brand/class fuzzy @ 0.92; producer-name fuzzy @ 0.90; producer-address fuzzy @ 0.85; ABV stated-equals-stated (A19); country-of-origin exact
- `config/fields-by-type.json` — required-field lists keyed by `BeverageType` (wine adds `countryOfOrigin`; spirits is the demo path per A10; malt mirrors spirits)
- `config/README.md` — what these files are, who edits them, the A18 placeholder note, the ABV-simplification note, the production-migration path (FR-25 → `rule_config` table at P6-2)
- `lib/config/schema.ts` — Zod schemas, all `.strict()`, with a discriminated union on `rule` for clear typo errors
- `lib/config/index.ts` — typed memoised accessors (`getWarningConfig`, `getTolerances`, `getRequiredFields`); throws a single file-named error on missing file, bad JSON, or schema violation
- `lib/config/__tests__/load.test.ts` — inverted A18 placeholder test (passes while A18 is open; fails the day someone replaces the placeholder so the test gets removed at the same time)

**Verification:**
- `pnpm build` clean (`✓ Compiled successfully in 1302ms`)
- `pnpm lint` clean (`✔ No ESLint warnings or errors`)
- `__TODO_VERBATIM_TEXT_A18__` appears in 6 files, all legitimate (real placeholder, test assertion, two READMEs, schema JSDoc, this ticket file) — no silent paraphrase anywhere

**Deviations from ticket:**
- None. `lib/provider/index.ts` was not extended to consume `getRequiredFields()` — the ticket explicitly left that for P1-2.

**Open assumptions still open:**
- **A18** — the verbatim 27 CFR § 16.21 warning text is still a placeholder. The system runs and the matching engine will compile against the placeholder; production deployment requires a separate small ticket to land the real text once a TTB stakeholder confirms the wording.

**Why:**
P0-4 puts the regulatory rules in JSON so a compliance reviewer can change a threshold without a developer (FR-25). This is small in code but load-bearing in process: the matching engine (P1-3) imports from `lib/config` rather than hardcoding strings or thresholds, which means a TTB stakeholder eventually has a one-file edit path to adjust similarity bars or the warning rules — a code change for what should be a rule change is the kind of friction that erodes adoption. We chose JSON over YAML because Zod parses it natively, the validation errors point at concrete fields, and a compliance reviewer can read it without a YAML syntax lesson. The biggest decision was leaving the verbatim warning text as a loud sentinel (`__TODO_VERBATIM_TEXT_A18__`) rather than paraphrasing 27 CFR § 16.21. Paraphrasing is a regulatory hazard — a near-correct warning string would still be the **wrong** string, and the verifier would silently disagree with TTB's published rule for as long as nobody noticed. The placeholder forces a deliberate ticket to land the real text once A18 is resolved, and the (inverted) test in `load.test.ts` fails loudly when someone replaces it, ensuring the test gets removed at the same time — no lingering "placeholder coverage" after the real text is in. ABV defaults to stated-equals-stated (FR-9, A19) for the same reason: TTB's real tolerance rules vary by beverage type and aren't trivially in scope; encoding them slightly wrong would be silently wrong, which is worse than visibly simplified. The `note` field in `tolerances.json` documents the simplification so a reviewer reading the file sees it. Similarity thresholds (0.92 brand/class-type, 0.90 producer-name, 0.85 producer-address) are seed values the matching engine in P1-3 will calibrate against the golden set in P5-2 — we set them now so the engine has something defensible to compile against, and P5-2 tunes them with evidence rather than vibes. Every schema is `.strict()` for one reason: the whole point of FR-25 is human-editable rules, and a typo'd key silently ignored would be a regulatory failure mode — the warning check would silently weaken. Strict rejection at startup forces the reviewer to fix the typo before the system runs, which is the right ergonomic. The discriminated union on `rule` gives clear error messages when a future reviewer mistypes `"fuzy"` instead of `"fuzzy"`, where a simple union would produce the unhelpful "did not match any union member" error. The loader memoises with `module-init read once` because the config is small (<10KB total) and stable for the process lifetime — there's no async story to be told, and a synchronous `fs.readFileSync` at first access is simpler than passing config around as state. The `_resetConfigCacheForTesting` export is the one exception accepted; it's underscore-prefixed and explicitly named "for testing" so a future agent can't innocently use it in production code. Trade-off accepted on Next.js: `process.cwd()` works in both dev and production but it's a Node-runtime assumption — the loader won't run on the Edge runtime if someone later moves a route there. Left explicit because no current ticket needs an edge route.

**Next:** P0-5 — Image preprocessing (orientation normalize, cap at provider max resolution per D7).

---

## 2026-06-15 — P0-3 Vision provider adapter + mock

**Branch:** `feat/provider-adapter`
**Status:** Done

**What landed:**
- `lib/provider/types.ts` — `VisionProvider` interface, `ExtractionRequest`, `ExtractionResponse`, `FaceExtraction`, `ProviderFaceInput`
- `lib/provider/mock.ts` — `MockVisionProvider` with three canned fixtures: `sample-green-001` (clean wine), `sample-abv-mismatch-001` (front face reads 45% ALC/VOL), `sample-warning-titlecase-001` (back-face warning with `allCaps: false`); neutral front-face fallback for unknown IDs
- `lib/provider/index.ts` — `getProvider()` env-driven factory (default `mock`); throws with ticket pointers for known live providers (`anthropic` → P1-2, `azure-openai`/`olmocr` → P6-1)
- `lib/provider/README.md` — contract note: same shape across mock and live; text-only; D4/D5
- `lib/provider/__tests__/mock.test.ts` — type-level guards that fail the build if a `verdict` or `confidence` field gets added to `ExtractionResponse`, plus Vitest-ready `describe`/`it` blocks (auto-discovered once P0-7 installs Vitest)
- `pnpm add zod` (4.4.3) — staged for P1-2's runtime validation; unused by the mock

**Verification:**
- `pnpm build` clean (`✓ Compiled successfully in 1281ms`)
- `pnpm lint` clean (`✔ No ESLint warnings or errors`)
- TypeScript guards enforce the no-verdict, no-overall-confidence contract at compile time

**Deviations from ticket:**
- Did NOT add the optional `app/api/_debug/extract` smoke route — the type-level guards in the test file are stronger than a runtime smoke route and don't require cleanup before merge.

**Why:**
P0-3 is the load-bearing seam: every model integration (today's mock, P1-2's Claude Sonnet 4.6, P6-1's Azure OpenAI or self-hosted olmOCR) sits behind one interface, so the rest of the system never knows or cares which one is on. We made the interface as narrow as it could possibly be — one method `extract()`, one input shape, one output shape — because every field added today is a coupling we have to maintain across every future provider; the production-migration story in P6-1 only works if this stays narrow. The response is per-face **text** plus warning structural flags — no `verdict`, no `match`, no overall confidence number. We considered exposing the model's self-reported confidence "just in case" and rejected it: the matching engine (P1-3) and the triage classifier (P1-5) compute confidence in code (D5), and a model-confidence field on `ExtractionResponse` would silently get consumed by some future hot fix and quietly bring back the exact anti-pattern D5 was written to prevent. `boldConfident` is a three-value flag (`yes | no | uncertain`), not a boolean, because D6 makes bold detection best-effort — a boolean would force a false binary on an unreliable read, and "uncertain" routes the case to the review lane instead of forcing a verdict on a styling cue. The mock comes first because every later ticket needs a working extraction without an API key — P1-3 matching, P1-5 triage, P1-7 result API, P1-8 review UI, even P5-2 evals can all be built and CI'd against it. The three fixtures cover the three lanes (match, mismatch, review) plus the hardest field (the government warning), so any consumer can exercise every branch. Crucially, the mock returns the same response shape every real provider must — if the mock is sloppy with optional fields, the live adapter in P1-2 and the in-boundary adapter in P6-1 will silently diverge. `getProvider()` is env-driven (`PROVIDER=mock` default) because that matches every dev/test/CI workflow without code edits, and because D8 says swappable-by-config — we lock that in now even with one impl. We explicitly throw clear errors for known live provider names with pointers to the tickets that land each, rather than silently falling back to the mock. Trade-off accepted on tests: full Vitest isn't installed until P0-7, so the test file uses type-level guards that `pnpm build` catches at compile time, plus runtime `describe`/`it` blocks that Vitest auto-discovers once installed; the type-level guards are the most important enforcement because they fail the build if a future agent adds a `verdict` field to the response, which is the change we most want to prevent. `zod` is installed but unused by the mock; staged for P1-2's runtime validation of live-provider responses where the type system alone can't catch shape mismatches at the wire boundary.

**Next:** P0-4 — Configuration store (canonical warning text, per-field tolerances, per-beverage-type field requirements).

---

## 2026-06-15 — P0-2 Domain types and result contract

**Branch:** `feat/types`
**Status:** Done

**What landed:**
- `types/domain.ts` — single-file export of the canonical domain types
- `types/index.ts` — barrel re-export so importers write `import { VerificationResult } from "@/types"`
- All enums from CONTEXT.md as string-literal unions: `Lane`, `Verdict`, `Disposition`, `BeverageType`, `FaceKind`, `Role`, `FieldName`
- Composite types: `FormFields`, `LabelFace`, `Application`, `WarningFlags`, `FieldResult`, `VerificationResult`, `ReturnReasonSummary`, `DispositionRecord`
- JSDoc on every exported type pointing to its FR / D / AC
- TICKET-TEMPLATE.md updated with `### Why (fill at completion)` section — every future ticket carries a completion-time rationale paragraph
- DEV-LOG header updated to document the Why convention
- P0-1 ticket file retrofitted with the Why paragraph

**Verification:**
- `pnpm build` clean (`✓ Compiled successfully in 997ms`)
- `pnpm lint` clean (`✔ No ESLint warnings or errors`)
- Impossible states are structurally unrepresentable: `Disposition` excludes `"per_face"` / `"per_field"`; `Lane` excludes `"approved"`; `DispositionRecord` has no face/field discriminator
- `extractedValue: string | null` enforces D4 (model returns text only, never a verdict)
- `LabelFace.imageRef: string` enforces NFR-4 boundary (transient handle, not durable URL or inline buffer)

**Deviations from ticket:**
- None on the types themselves.
- Bundled the Why-convention docs (TICKET-TEMPLATE + P0-1 retrofit + DEV-LOG header) into this commit per the convention's effective date.

**Why:**
P0-2 is the only chance to lock the wire contract before any service depends on it — every later ticket (extraction, matching, triage, API, UI) reads these types, so a name change later forces a sweep. We put every shared type into a single `types/domain.ts` (with `types/index.ts` as a barrel) because at Phase 0 there's no reason to fragment — readers should be able to skim the whole contract in one place; we'll split when the file's complexity earns the split, not preemptively. Names follow CONTEXT.md verbatim (Lane, Verdict, Disposition, FaceKind, BeverageType, Role) because the glossary **is** the contract. The naming-convention split is deliberate: TypeScript field names are camelCase (project style), but wire-format identifiers (`FieldName` literals, enum values like `distilled_spirits`) stay snake_case to match `schema.md` — so the matching engine's lookup keys, the audit-trail `field_result` row values, and the future COLAs Online integration all speak the same identifier vocabulary; the boundary is the wire layer, not the type system. The hardest call was modeling Disposition: we made it whole-application only by **structure** (no per-face or per-field discriminator on `DispositionRecord`), so partial approvals are unrepresentable rather than convention-enforced. Same goes for the Lane vs Disposition split — Lane lives on `VerificationResult` (the AI's call), Disposition lives on `DispositionRecord` (the human's call), the two unions don't overlap; adding "approve" to Lane (the anti-pattern in CONTEXT.md) would require a knowing edit to the source of truth, not accidental drift. `extractedValue` is `string | null` (the model returns text or nothing per D4), never a verdict object, so the matching engine can't be fooled into treating the model as a judge. `confidence` is `number` — the code-derived signal from D5, not the model's self-reported number; we considered exposing both but kept the contract narrow because every field that could host the model's number is a future bug waiting to happen. `LabelFace.imageRef` is `string` (a transient in-memory handle), never `Buffer` or `Uint8Array`, so the type system makes it harder to accidentally inline image bytes into a serialized response or a log line — which would silently violate NFR-4. Trade-off accepted: `returnReason` on `DispositionRecord` is optional rather than discriminated; a stricter `{ disposition: "approve" } | { disposition: "return_for_correction"; returnReason: ReturnReasonSummary }` would prevent forgetting it, but adds type-narrowing noise at every consumer, and the disposition write path (P1-8) will validate with Zod anyway. JSDoc on every exported type cites its FR/D/AC so a future agent reading the file alone can reconstruct the rationale; leaving it only in the design docs invites drift the next time the schema evolves.

**Next:** P0-3 — Vision provider adapter + mock.

---

## 2026-06-15 — P0-1 Repo scaffold

**Branch:** `feat/scaffold`
**Status:** Done

**What landed:**
- Next.js 15.5 (App Router) + React 18.3 + TypeScript 5.9 (strict, noUncheckedIndexedAccess)
- Tailwind CSS 3.4 with smoke-test class on the default page
- ESLint (next/core-web-vitals + next/typescript) with `@typescript-eslint/no-explicit-any: "error"`
- Prettier 3.8 with project conventions (semi, double-quotes, 100-col)
- pnpm 9 with scripts: `dev`, `build`, `start`, `lint`, `test` (test is a placeholder until P0-7)
- Empty seam directories with `.gitkeep`: `lib/`, `config/`, `types/`
- Expanded `README.md` from the original stub to scaffold instructions

**Verification:**
- `pnpm dev` boots on `http://localhost:3000`, renders the Tailwind smoke-test banner
- `pnpm build` completes with `✓ Compiled successfully in 2.2s`, generates static pages clean
- `pnpm lint` is clean on the empty tree; correctly errors on a planted `const x: any = 1`
- `pnpm test` returns exit code 0 with placeholder message

**Deviations from ticket:**
- None.

**Why:**
Scaffolding is the highest-leverage hour of Phase 0: every later ticket attaches at a seam that's defined here, so getting the seams right now prevents reshuffles later. We picked the App Router over `pages/` because P1-7 (Result API) and P0-6 (access-gate middleware) both assume route handlers under `app/api/` — the older router shape would have forced a rewrite in P1. `strict: true` plus `noUncheckedIndexedAccess` matter for the matching engine in P1-3: without the second flag, an off-by-one in the per-field rule table would compile silently and ship as a verifier bug. `@typescript-eslint/no-explicit-any: "error"` prevents the slow erosion of type safety that always happens when projects tolerate it; we'd rather break the build than discover a stringly-typed `any` in the matching code six tickets from now. Tailwind because that's what techstack.md picked for the low-tech-comfort agent UI (NFR-2 demands color + icon + text together, which Tailwind makes trivial). pnpm 9 / Node 20 because they're what the rest of the toolchain expects and what CI will run in P0-7. The empty seam directories (`lib/`, `config/`, `types/`) with `.gitkeep` are a forcing function — anyone opening the repo immediately sees where extraction, matching, triage, and config belong; the alternative (creating them ad-hoc later) tends to drift into a flat structure. We deliberately did not add a database client, ORM, session store, or serverless adapter — those would violate NFR-4 (no persistence) and NFR-1 (cold-start budget). The `pnpm test` placeholder exits 0 so the script slot is reserved but the build doesn't fail before Vitest lands in P0-7. Trade-off accepted: the eslint 8.x and next-lint deprecation warnings are unavoidable because `eslint-config-next@15` pins to them; both clear when we bump to Next 16, planned around P0-7 or after the prototype ships.

**Notable warnings (non-blocking):**
- `next lint` is deprecated in favor of the ESLint CLI starting Next 16. Migrate when we bump Next, planned around P0-7 / CI setup.
- `eslint@8` is EOL but pinned by `eslint-config-next@15`. Resolves automatically when we move to Next 16 / eslint-config-next 16.

**Next:** P0-2 — Domain types and result contract (`Application`, `LabelFace`, `Field`, `Verdict`, `Lane`, `Disposition`).
