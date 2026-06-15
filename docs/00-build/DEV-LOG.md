# DEV-LOG

Append-only log of completed tickets. Newest entries at the top. Each entry: ticket id, date, branch, summary, deviations, and a **Why** paragraph mirrored from the ticket file's `### Why` section. The Why rationale travels with both the per-ticket file (durable, topical) and this log (chronological, narrative).

---

## 2026-06-15 — P1-6 Multi-face merge

**Branch:** `feat/multiface`
**Status:** Done

**What landed:**
- `lib/matching/merge.ts` — `mergeFaces(perFaceResults: ReadonlyArray<FieldResult>): FieldResult[]`. Groups results by field, picks the best per the priority tiers `match > mismatch > low_confidence > not_found`. Within tier: highest confidence wins; on equal confidence, deterministic face order `front > back > neck`. Tie-break order matters for stable test fixtures and for the review UI pointer (FR-15).
- `lib/matching/match.ts` — orchestrator refactored. Instead of "first face's reading wins" (`findExtracted`), the engine now collects per-face readings (`readingsFor`), runs the matcher on each, attaches confidence, and feeds the per-face FieldResults through `mergeFaces`. The government warning bypasses `mergeFaces` because `matchWarning` already merges across faces by construction (D12); it contributes one result that passes through as a single-element group.
- `lib/matching/__tests__/merge.test.ts` — 12 new tests across two surfaces:
  - **Unit (mergeFaces):** any-face-matches wins, no-match-but-mismatch wins, low_confidence-over-not_found, all-not_found case, deterministic face-priority tie-break, group-by-field.
  - **Integration (matchApplication):** single front face → missing warning is a real mismatch (sourceFace null), front+back with warning on back → all match (warning sourceFace='back'), three-face split with brand on neck / ABV on front / warning on back → each sourceFace correctly tagged, front-only with warning on the front → warning passes with sourceFace='front', altered warning on the back-only face → mismatch with sourceFace='back', equal-confidence brand on front+back → front wins by deterministic tie-break.

**Verification:**
- `pnpm test` clean — 11 files, **94 tests** (82 prior + 12 new), all pass in 640ms.
- `pnpm build` clean. No new routes (P1-7 wires the result API).
- `pnpm lint` clean.

**Deviations from ticket:**
- The ticket text described "warning verdict is `not_found`" for a front-only upload with no warning; the actual behaviour (preserved here, confirmed by existing tests in `classify.test.ts` AC-4 and `match.test.ts` AC-4) is that a missing warning produces `verdict: "mismatch"` with reason `"not present"` and the triage classifier routes that to the mismatch lane. That is the correct agency-risk posture: a missing warning is a real, regulatory-grade defect, not an "I couldn't check it" case. The parenthetical in the ticket ("this is the correct behaviour: missing warning is a real mismatch") agrees with the implementation; the verdict-name slip in the bullet list is the inconsistency.

**Why:**
P1-6 is the layer that makes the Application — not a single face — the unit of verification (D13). Real labels distribute information across faces by design: the front carries the brand and the brand identity work, the back carries the regulated text (warning, address, lot codes), the neck (when present) often carries the brand again or the bottle number. Treating each face independently and then unioning gives the right semantics — a field is satisfied if **any** face carries it — without forcing every face to carry every field, which would false-flag normal labels as defective.

The merge priority order — match > mismatch > low_confidence > not_found — is intentionally NOT "majority wins" or "average". Majority would hide a defect on a single face behind two clean faces. Averaging would similarly smear strong and weak signals together. The priority order picks the **most informative** read available: a clean match is the strongest possible signal; a confident mismatch is a real defect; low_confidence routes to review; not_found is the absence of signal and only wins when nothing else is available. This is the same conservative posture as P1-5's triage classifier — the merge and the classifier reinforce each other.

The highest-confidence-within-tier tie-break makes the multi-face merge **picky** in the right direction: when the same field shows up on multiple faces, we keep the cleaner read. The confidence number is the code-derived signal from P1-4 — for fuzzy fields it's the similarity margin, for exact fields it's binary 1.0. A face with a slightly off transcription (lower margin) loses to a face with a clean transcription, and that propagates into the public result so the review UI in P1-8 points the agent at the face that's actually worth looking at (FR-15). Without this, "first-face-wins" would arbitrarily lock in whichever face happens to be uploaded first.

Deterministic face-order tie-break (front > back > neck) sounds cosmetic but it's load-bearing for two reasons. (1) Test fixtures: equal-confidence cases would be flaky if the merge picked whichever face it encountered first in `Map.values()` iteration order. The fixed front>back>neck rule means `pnpm test` is reproducible byte-for-byte regardless of input order. (2) Review UX: when two faces both pass cleanly, the agent usually wants to look at the front first — it carries the brand identity and is the canonical "what does this product call itself" face. Routing the merged sourceFace to front in ties matches the agent's mental model.

The warning bypasses `mergeFaces` because `matchWarning` already does cross-face logic by construction: it walks all faces looking for presence, picks the one with the warning text, then runs the strict verbatim + caps + bold checks against that face. Routing the warning back through the generic merge would either double-count (the warning would appear with a single result and merge would pass it through unchanged — wasted work) or, worse, produce per-face per-face warning FieldResults that don't make sense (e.g. "warning not found on the front face" as a separate signal from "warning found on the back face"). The cleaner design is: warning has its own merge; everything else uses the generic one.

A front-only upload with no warning correctly produces `government_warning: mismatch` with reason "not present", and the triage classifier in P1-5 routes that to the mismatch lane. A future "I uploaded the wrong face" UX (P1-9's degraded-extraction path is the closest analogue) could add a "warning not checked" disposition, but that's a different feature — for now the right behaviour is to surface the absence of the warning as a real defect because the system can't distinguish "user forgot to upload the back" from "the bottle ships without a back warning". The agency's risk posture says: **flag it, let a human disambiguate**.

**Next:** P1-7 — Result API (assemble the public VerificationResult shape from extraction + merged FieldResults + triage, including the `extractionFailed` + `recommendation: "return_unreadable_image"` wiring per FR-26b).

---

## 2026-06-15 — P1-5 Triage classifier

**Branch:** `feat/triage`
**Status:** Done

**What landed:**
- `lib/triage/classify.ts` — `classify(input)` returns `{ lane, overallConfidence, reasons }`. Five explicit branches in priority order, none consolidated into math:
  1. Any field's verdict is `mismatch` AND confidence ≥ threshold → mismatch lane.
  2. Warning verdict is `mismatch` at ANY confidence → mismatch lane.
  3. Unreadable face in context → review lane with "needs a better image" reason (FR-16, FR-26b).
  4. Any not_found / low_confidence / below-threshold match or mismatch → review lane.
  5. Otherwise → match lane.
- `overallConfidence` is the **minimum** field confidence (D11 conservative posture).
- Threshold is dependency-injected (`confidentThreshold` optional input; defaults to `tolerances.confidence.threshold` from `lib/config`).
- `lib/triage/__tests__/classify.test.ts` — 13 new tests: AC-1 (clean match), AC-2 (ABV mismatch surfaces with reason), AC-3 (warning caps fail surfaces even with everything else clean), AC-4 (missing warning surfaces), AC-6 (unreadable → review with "needs a better image"), near-miss → review (D5), bold-uncertain → review, not_found → review, near-miss mismatch → review (NOT mismatch — confident-mismatch-only goes to mismatch lane), confident mismatch beats unreadable-face review, warning-first reason ordering, overall-confidence-as-minimum.

**Verification:**
- `pnpm test` clean — 10 files, **82 tests** (69 prior + 13 new), all pass in 915ms.
- `pnpm build` clean (`✓ Compiled successfully in 1424ms`). No new routes (P1-7 wires the result API).
- `pnpm lint` clean.

**Deviations from ticket:**
- None. Triage classifier returns the lightweight `TriageResult` shape (`{ lane, overallConfidence, reasons }`) rather than a full `VerificationResult` — the route handler in P1-7 will assemble the public shape from triage + extraction + field results.

**Why:**
P1-5 operationalises the review model. The priority order is the single most important design decision in the whole verifier — anything that "tidies" it (one big switch, a scoring function, a "weighted lane" computation) silently breaks the agency's risk posture, because a clean-looking aggregate can hide a single bad field. The implementation refuses every consolidation temptation: five branches, in order, each explicit, none collapsing into a math expression. A future maintainer staring at this will think "this could be simpler" — and the answer is "yes, but at the cost of the agency's risk posture, which is the whole product." The warning surfaces at any confidence (branch 2, not just branch 1) intentionally. The warning is the highest-stakes check (FR-11, FR-12) and the matching engine already does the strict work — a warning mismatch verdict is by construction a real, regulatory-grade flag. Routing it to the review lane on a low confidence number would mean the system saw a regulatory failure and then said "I'm not sure, you decide" — which is exactly what we don't want for the highest-stakes field. Overall confidence = minimum field confidence (D11). The alternative — averaging — was rejected explicitly: one weak signal averaged with three strong ones produces a confident-looking aggregate that hides exactly the case the review model exists to catch. Minimum makes the weakest link visible. The near-miss mismatch case (branch 4: `verdict=mismatch AND confidence<threshold`) is the subtle one. A fuzzy field that comes in just below its similarity threshold reads as mismatch from the matching engine, but the confidence is near 0.5. Routing it to the mismatch lane would mean asserting we're confident in the mismatch when we're not. Routing it to the review lane is the right call — the agent looks, decides whether it's a real mismatch or a typo. This is the case where the review model's "when in doubt, escalate" stance materialises in code. Dependency injection of the threshold (`confidentThreshold` optional input that defaults to the config value) follows the same pattern as P1-3 / P1-4. Tests pass a fixed value; production reads from config. The configurable threshold is what makes future P5-2 calibration possible — the eval harness sweeps the threshold across the golden set and finds the value that balances false-negative rate (headline safety metric) against false-positive review-lane volume (headline cost metric). The unreadable-image context is wired as a separate input rather than overloaded into the field-results array — the matching engine doesn't know which faces failed extraction; that's information the upstream extraction service and the route handler carry. The reasons array preserves the warning failure first in mismatch lane outputs so the agent's UI surfaces "Warning missing" above "ABV mismatch" — sorting by field type rather than insertion order would lose the priority signal at exactly the point a stakeholder might overlook it.

**Next:** P1-6 — Multi-face merge ("a field is satisfied if found on any face; warning checked across all faces" per D12).

---

## 2026-06-15 — P1-4 Confidence derivation

**Branch:** `feat/confidence`
**Status:** Done

**What landed:**
- `lib/matching/confidence.ts` — pure `deriveConfidence({ verdict, margin, rule, legibility, config })` returning a 0..1 scalar. Does NOT accept the model's self-reported overall confidence as a parameter (D5 — structural defense, not a check).
- `lib/matching/match.ts` — orchestrator return type promoted from `MatchResult[]` to `FieldResult[]`. Adds `legibilityFor()` to look up the face's warning.legibility as a coarse face-level proxy and `attachConfidence()` to wrap each match.
- `config/tolerances.json` — new `confidence` sub-object with `threshold`, `legibilityFactors`, `notFoundConfidence`, `lowConfidenceVerdict`, and a documentation `note`.
- `lib/config/schema.ts` — `ConfidenceConfigSchema` added to `TolerancesConfigSchema` (both `.strict()` so a typo at startup fails loudly).
- `lib/config/index.ts` — `ConfidenceConfig` type re-exported.
- `lib/matching/__tests__/confidence.test.ts` — 13 tests covering the headline D5 cases: near-miss → below threshold (the test that validates D5), comfortable match → near 1.0, exact mismatch → high confidence (routes to mismatch lane, NOT review), exact match with low legibility → below threshold, not_found → mid-confidence, low_confidence verdict → mid-low, default legibility, purity (same inputs → same output), and clamp-to-[0,1].

**Verification:**
- `pnpm test` clean — 9 files, **69 tests** (56 prior + 13 new), all pass in 624ms.
- `pnpm build` clean (`✓ Compiled successfully in 1550ms`). No new routes.
- `pnpm lint` clean.
- The orchestrator tests from P1-3 still pass — they assert on `verdict`, which is unchanged; the new `confidence` field is additive.

**Deviations from ticket:**
- The `confidence` block is a new sub-object inside `tolerances.json` rather than a new top-level config file. One file edit, one Zod sub-schema, one loader, and a `.strict()` schema means a typo like `"thresholdd"` fails at startup. The alternative (a separate `confidence.json`) was rejected as ceremony.
- `MatchResult` → `FieldResult` happens at the orchestrator boundary, not in a separate `withConfidence(matchResult)` step. Every caller eventually wants confidence; wrapping would force every site to reach in twice (`r.matchResult.verdict`, `r.confidence`).

**Why:**
P1-4 is the smallest ticket in Phase 1 by line count and the largest by load-bearing weight. D5 calls confidence-from-model "the most-likely-to-be-fixed-incorrectly decision in the system" — a future maintainer staring at a `model.confidence` field will absolutely think "why are we ignoring this number?" The defence is structural: this function takes the model's per-region legibility flag as input but does not accept the model's overall self-reported confidence as a parameter at all. There's no place to plug it in without editing the signature, which means a reviewer notices. `deriveConfidence` is a pure function — no `Date.now()`, no `Math.random()`, no logger calls. That's not aesthetic — it's what makes P5-2's calibration curve possible. The eval harness replays historical extractions through this function and expects bit-identical outputs; any nondeterminism would silently invalidate the curve. The formula is intentionally simple and inspectable: fuzzy fields use `0.5 + 0.5 * (|margin| / range)`, where the range is `1 − minSimilarity` from the config (typically 0.08). That makes the near-miss case mechanical — a margin near zero produces a confidence near 0.5, which is below the 0.7 threshold and routes to review. Exact-match fields short-circuit to 1.0 because there's no continuous metric — pass and fail are binary, and a confident mismatch must go to the mismatch lane, not the review lane. The legibility multiplier sits at the END of the chain — base confidence is computed first, then legibility scales it — so a low-legibility region can drag an otherwise-clean field below the threshold even when the rule "technically passed", which is exactly what we want for image-quality-driven review. The per-field legibility proxy is a known coarseness: the extraction response carries `warning.legibility` per face but doesn't carry per-field legibility, so the orchestrator uses that face-level signal for every field on that face. P5-2 calibration will tell us if it generalises. We changed the orchestrator's return type from `MatchResult[]` to `FieldResult[]` rather than wrap it because every caller eventually wants confidence and `FieldResult` is already the public domain type in `types/domain.ts`. Promoting at the matching boundary is the right place — earlier (per-field matchers) we don't have legibility; later (P1-5 triage) we'd be deriving confidence in the wrong module. Trade-off accepted: `margin` becomes invisible to the public API, which means P1-5 can't second-guess the confidence value with the raw margin. That's correct — second-guessing is a smell, and P5-2 has access to the full evaluation history regardless. Config schema: `confidence` is a sibling key inside `tolerances.json`, not a separate file. The strict Zod schema catches a typo like `"thresholdd"` at startup rather than silently substituting a default — same "rule lookup must be loud" pattern as P0-4.

**Next:** P1-5 — Triage classifier (roll per-field verdicts + confidence into one of three lanes with the priority order — warning failures always surface).

---

## 2026-06-15 — P1-3 Matching engine

**Branch:** `feat/matching`
**Status:** Done

**What landed:**
- `lib/matching/types.ts` — internal `MatchResult` type carrying `margin` rather than `confidence` (confidence is derived by P1-4).
- `lib/matching/normalize.ts` — shared normalisers: `normalizeForFuzzy`, `parseAbvPercent`, `parseNetContents` (rewritten twice), `normalizeWarningText`.
- `lib/matching/fuzzy.ts` — generic fuzzy matcher for brand / class-type / producer using `fastest-levenshtein` with a similarity threshold from `tolerances.json`.
- `lib/matching/abv.ts` — stated-equals-stated per FR-9, A19. Documents the TTB tolerance-table simplification in code.
- `lib/matching/netContents.ts` — unit-normalised exact match per FR-10. Does NOT cross-convert (750 mL vs 0.75 L is a mismatch even though equal volumes — the agent should see the unit discrepancy).
- `lib/matching/origin.ts` — exact match for country of origin, conditional on being in the beverage-type's required list.
- `lib/matching/warning.ts` — presence (across faces, D12) + verbatim (FR-11) + ALL CAPS strict + bold best-effort (D6, `"uncertain"` → `low_confidence`).
- `lib/matching/match.ts` — orchestrator. Walks `getRequiredFields(beverageType)`, dispatches each field to its matcher, pulls the threshold from `getTolerances()`. Tolerances and warning config are dependency-injected so tests can supply fixed values; production reads from `lib/config`.
- `lib/config/index.ts` — re-export `FieldRule` so external modules can type the matcher dispatch signature.
- `pnpm add fastest-levenshtein` (1.0.16).
- `lib/matching/__tests__/match.test.ts` — 20 tests covering AC-2 (ABV mismatch), AC-3 (title-case warning), AC-4 (missing warning), AC-5 (STONE'S THROW case variant), bold-uncertain → low_confidence, verbatim drift, multi-face presence, unit normalisation, cross-unit refusal, and a happy-path orchestrator integration.

**Verification:**
- `pnpm test` clean — 8 files, **56 tests** (36 prior + 20 new), all pass in 492ms.
- `pnpm build` clean (`✓ Compiled successfully in 1893ms`). No new routes; the matching engine is consumed by the still-unbuilt result API (P1-7), so bundle weights are unchanged.
- `pnpm lint` clean.

**Bugs caught during the run (and the design moves that resulted):**
- **`\b` failed on "750ML"** — `\bml\b` requires a word/non-word transition, but "0m" is digit-letter (both word chars), so the boundary is absent. Rewrote with negative lookbehind/lookahead.
- **Period-stripping ate decimals** — first cut of `parseNetContents` did `s.replace(/\./g, "")` to handle "fl. oz.", but the same regex hit "0.75 L" and produced 075. Rewrote to leave periods alone and let the unit regexes tolerate them explicitly.
- **`FieldRule` not re-exported from `@/lib/config`** — the matcher needed the type to declare `rule: FieldRule` on the dispatch input; added to the barrel re-export.

**Deviations from ticket:**
- The fuzzy matcher is one shared file (`fuzzy.ts`) rather than separate `brand.ts` / `producer.ts` — same rule, different thresholds supplied by the orchestrator. Simpler than two files with identical bodies.

**Why:**
P1-3 is the correctness core. Every decision in this engine is code — D4 and D5 say the model only reads and the code only decides, and this is where that promise is operationalised. The biggest design choice was separating the per-field matchers (one file each) from the orchestrator, with `MatchResult` as the shared output type. The alternative — one big switch statement — would have looked tidier but conflated two responsibilities: dispatching the right rule and applying the rule. When P5-2 starts calibrating thresholds against the golden set, the calibration work touches a single file per field; the orchestrator stays inert. `MatchResult` carries `margin` instead of `confidence` for a specific reason: P1-4 derives confidence in code from `margin` plus the model's per-region legibility flag (D5). If we'd put `confidence` here, P1-4 would have to either accept the matcher's number or override it, and override-mode is the kind of seam that silently breaks when someone forgets why it exists. By making `margin` the contract, P1-4's role is unambiguous — it's the only place confidence is ever assigned. The camelCase ↔ snake_case translation is back for the third time (P0-2 type contract, P1-2 extraction, here). The form-side uses camelCase because that's the TypeScript convention; the wire-side (`FieldName`, the `field_result` audit identifiers, the matching engine's lookup keys) uses snake_case because that's the schema vocabulary. The map lives in `match.ts` rather than in a shared utility because the boundary IS the matcher. `parseNetContents` was rewritten twice — `\b` boundaries failed between digit and letter, and blanket period-stripping ate decimals. Both bugs surfaced only when tests ran them through; the rewritten version uses lookbehind/lookahead and tolerates optional trailing periods explicitly. This is exactly the kind of subtle parsing bug an LLM-as-judge would let through — Levenshtein-on-strings would have called `"750ml"` and `"0.75 L"` similar; the structural parser catches the unit mismatch. The warning matcher's evaluation order is deliberate: presence first, then text, then ALL CAPS strict (FR-11), then verbatim, then bold last (because bold is best-effort per D6). `boldConfident: "uncertain"` downgrades the overall verdict to `low_confidence` rather than fail or pass — the failure mode that matters is an auto-fail on a flaky styling read, and routing to human review is the safe default. The legibility flag is consumed at this layer but doesn't change the verdict; P1-5 (triage) is where low legibility would push a marginal match into the review lane. Keeping the two concerns separate means P5-2's calibration can tune the thresholds independently. Test fixtures pass the warning config as a parameter rather than relying on `config/warning.json` (which still has the A18 placeholder) — dependency-injection-over-hidden-globals.

**Next:** P1-4 — Confidence derivation (turn `margin` + the model legibility flag into a 0..1 confidence number per D5).

---

## 2026-06-15 — P1-2 Extraction service (+ live Anthropic provider)

**Branch:** `feat/extraction`
**Status:** Done

**What landed:**
- `lib/extraction/service.ts` — `extract(application)` function and the server-side `ExtractableApplication` type. One `provider.extract()` round trip per Application carrying ALL faces (D14); preprocessing is concurrent across faces but does not touch the model. `CONFIG_KEY_TO_FIELD_NAME` map translates camelCase config keys to snake_case `FieldName` values at the form-side/wire-side seam.
- `lib/extraction/prompt.ts` — versioned prompt template (`EXTRACTION_PROMPT_VERSION = "v1.0.0"`). Asks the model for text + four warning flags only; explicitly forbids any "matches" judgement (D4, D5).
- `lib/provider/anthropic.ts` — `AnthropicVisionProvider` implements `VisionProvider`. Uses base64 multimodal images, parses JSON tolerant of code-fence wrappers, validates response with Zod against the public `ExtractionResponse` shape. Default model `claude-sonnet-4-6`; `ANTHROPIC_MODEL` env override for P5-4 bake-off.
- `lib/provider/index.ts` — `getProvider()` now returns `AnthropicVisionProvider` when `PROVIDER=anthropic`; the "not yet implemented" branch for `anthropic` is gone.
- `lib/provider/types.ts` — `ExtractionRequest.faces` and `fieldSchema` widened to `ReadonlyArray<...>` so provider implementations can't accidentally mutate the request.
- `README.md` + `.env.example` — `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` documented.
- `pnpm add @anthropic-ai/sdk` (0.104.2).
- `lib/extraction/__tests__/service.test.ts` — 4 new tests asserting (a) exactly one provider call per Application, (b) every face attached, (c) text + warning flags only (no `verdict` / `confidence` at runtime), (d) field schema includes `country_of_origin` for wine + always-on `government_warning`.

**Verification:**
- `pnpm test` clean — 7 files, **36 tests** (32 prior + 4 new), all pass in 353ms.
- `pnpm build` clean (`✓ Compiled successfully in 1334ms`). No new routes; bundle weight unchanged on `/verify` because the extraction service is server-only.
- `pnpm lint` clean.

**Bugs caught during test (and the resulting design moves):**
- **Infinite recursion** in the first test attempt: the spy on `getProvider()` called `getProvider()` from within — which returned the spy itself. Fixed by instantiating `MockVisionProvider` directly inside the spy implementation.
- **Field-schema translation gap** ("wine schema includes country_of_origin"): the original code filtered config keys against the snake_case `FieldName` set, silently dropping every camelCase key. Replaced with the explicit `CONFIG_KEY_TO_FIELD_NAME` map. This was exactly the kind of silent-narrowing bug that would have shown up only in the matching engine in P1-3.
- **TypeScript readonly mismatch**: `fieldSchemaFor()` returns `ReadonlyArray<FieldName>` but `ExtractionRequest.fieldSchema` was `FieldName[]`. Resolved at the **type level** (made the request type ReadonlyArray) rather than with a cast, because providers shouldn't be mutating the request anyway.

**Deviations from ticket:**
- None on behaviour. The provider supports `claude-sonnet-4-6` as the default; the actual model ID can be overridden via `ANTHROPIC_MODEL` for P5-4 bake-off without code edits.

**Why:**
P1-2 is two related deliverables — the extraction service that converts a validated Application into a model call, and the live Anthropic Claude provider behind the same `VisionProvider` interface the mock has been satisfying since P0-3. We kept them in one ticket because either alone is a half-build. The biggest call was one call per Application, all faces attached (D14). The temptation a future agent will face is to "improve parallelism" by calling the model per face and merging the responses — that would silently break the 5-second p95 latency budget (NFR-1) once you add three round trips of overhead, and the per-application cost model (NFR-3). The implementation enforces this structurally — one `provider.extract()` invocation; the only loop is the concurrent `Promise.all` over preprocessing, which doesn't touch the model. The camelCase form-key → snake_case `FieldName` translation is the kind of seam that, left implicit, eats a day six tickets later. The config uses camelCase because the form-side `FormFields` shape does; the wire vocabulary is snake_case. The `CONFIG_KEY_TO_FIELD_NAME` map lives in the extraction service rather than in the config schema because the translation is where the form-side meets the wire-side — putting it in `lib/config` would push form-side knowledge into the config loader. The first test failure (`country_of_origin` not in the schema) was the right failure mode: the matching engine in P1-3 reads the schema by snake_case names, and a silently-empty schema would mean the model is never asked for half the fields. The `ReadonlyArray` change on `ExtractionRequest.faces` and `fieldSchema` is a small but principled correctness move — provider implementations have no business mutating the request, and making the type read-only enforces the contract at compile time. The Anthropic adapter uses base64-in-multimodal-content rather than the Files API because the Files API adds a separate upload round trip per face (breaking D14), the per-application payload at the 1568px cap is well under the 5MB Anthropic message limit, and Files API requires retention reasoning that doesn't fit NFR-4's no-persistence rule. The JSON parsing tolerance (`parseJsonStrict` accepting code-fence-wrapped output) is the one defensive bit; the prompt explicitly says "no markdown" but Sonnet sometimes ignores it, and failing-strict on a transient model behavior we can't control would be worse than parsing the actual content. P5-1 will track fenced-vs-clean responses as a rolling signal. `ANTHROPIC_MODEL` is env-overridable specifically so P5-4's bake-off can swap models without code edits. We resisted adding tool use / structured outputs here — the JSON-prompt path works against the current model and adds zero new SDK surface to test against; a future ticket swaps if the JSON failure rate is non-trivial in P5-2 evals.

**Next:** P1-3 — Matching engine (per-field rules: fuzzy brand/class, normalized-exact ABV/net contents, verbatim+styling warning per FR-7 through FR-12 and D6).

---

## 2026-06-15 — P1-1 Application input and sample loader

**Branch:** `feat/app-input`
**Status:** Done

**What landed:**
- `app/verify/page.tsx` — server component; loads `getRequiredFields(...)` for all three beverage types and passes them to the client form alongside the bundled samples.
- `app/verify/InputForm.tsx` — client component; holds beverage-type / form-values / faces / errors / submission-preview state; validates required fields against the config-driven list; renders one primary "Verify" action (FR-21).
- `app/verify/FaceUploader.tsx` — multi-face uploader with kind labels (front / back / neck), thumbnail previews, JPEG/PNG accept, up to three faces (D12). Object URLs are revoked on unmount and on face removal so the browser doesn't leak.
- `app/verify/SamplePicker.tsx` — list of preloaded fixtures with their notes; one click hydrates form + faces.
- `fixtures/samples.ts` — three preloaded samples (`sample-green-001`, `sample-abv-mismatch-001`, `sample-case-variant-001`) — IDs match the mock provider's fixture keys so a chosen sample produces a canned extraction in P1-2 without re-keying.
- `public/fixtures/images/` — three AI-synthesised label PNGs (committed; <1MB each; NFR-4 allows synthetic).
- `lib/validation/application.ts` — Zod schemas (`FormFieldsSchema`, `RawLabelFaceSchema`, `ApplicationSubmissionSchema`) + `validateApplication()` returning a discriminated `{ ok: true } | { ok: false, fieldErrors, formErrors }` union. Per-beverage-type required fields read from `lib/config` (FR-25); raw zod issue paths never leak through.
- `lib/validation/__tests__/application.test.ts` — 7 new tests covering the validator: valid distilled-spirits, valid wine, wine missing countryOfOrigin, spirits doesn't require countryOfOrigin, zero faces, too many faces, UI-friendly error messages.
- `app/page.tsx` — home page now has a primary CTA linking to `/verify`.

**Verification:**
- `pnpm test` clean — 6 files, **32 tests** (25 from Phase 0 + 7 new), all pass in 588ms.
- `pnpm build` clean (`✓ Compiled successfully in 1954ms`). New route in the build output: `ƒ /verify   3.25 kB   106 kB`.
- `pnpm lint` clean.
- **UI walkthrough confirmed:** loading the Old Cedar (ABV mismatch) sample hydrates form + face preview + submission preview JSON; clearing brand name + Verify shows the inline `⚠ Brand name is required for distilled spirits` error (color + icon + text, AC-9); loading the Harbor Mist wine sample switches beverage type and `countryOfOrigin: "USA"` appears (config-driven field rendering).

**Deviations from ticket:**
- The Verify button shows a "Submission preview" panel with the validated `Application` JSON rather than POSTing to `/api/verify`. The endpoint lands in P1-7; a fake POST that just sets state today would be more code than the preview without extra demonstration. Documented inline and in the Why.
- Samples are single-face. Multi-face fixtures wait for P1-6 (the merge code) where the multi-face story is actually exercised.

**Why:**
P1-1 is the first agent-facing screen, and the design constraints all pull in the same direction: one obvious primary action (FR-21), color + icon + text validation (NFR-2, AC-9), beverage-type-driven required fields (FR-3, FR-25), and a strict client/server contract that maps cleanly onto the `Application` type from P0-2. We resolved the client/server seam by making `app/verify/page.tsx` a server component that loads the field config once via `getRequiredFields(beverageType)` and passes the result as a prop; `InputForm.tsx` is the client component that owns the form state. That means the per-beverage-type required-field list is sourced from `config/fields-by-type.json` (FR-25) without smuggling `fs` reads into the client bundle. Trade-off accepted: the field config is captured at render time, so editing the JSON without a dev-server restart doesn't update an open browser tab — fine for a prototype where edits go through a restart anyway. We deliberately stopped before building the API route — the Verify button validates and shows a "Submission preview" panel rather than POSTing to `/api/verify` (which lands in P1-7), for two reasons: (1) no extraction service to call yet (P1-2); (2) the preview makes the contract visible to a stakeholder before the API exists, which is a good intermediate milestone. The fixtures are committed under `public/fixtures/images/` so the bundled demo and the offline acceptance tests (P1-10) read the same data; the sample IDs deliberately match the mock provider's fixture keys in `lib/provider/mock.ts` so a chosen sample produces a canned extraction in P1-2 without re-keying — the demo flow and the matching engine speak the same vocabulary by accident-prevention. The same `fixtures/samples.ts` module is imported by both the picker and the P1-10 acceptance tests, so the demo path and the test path **cannot** drift. `RawLabelFaceSchema` uses `z.instanceof(Buffer)` because the verify API will receive raw bytes through FormData (P1-7), and zod's Buffer check is the cheapest shape assertion without invoking sharp inside validation. `validateApplication` returns a discriminated union rather than throwing because every consumer wants invalid input as data, not exceptions. The `fieldErrors` map is keyed by camelCase form-field name (not zod's `form.brandName` path) so the UI binds errors to specific inputs without parsing zod strings — that's the explicit "no raw zod paths leak through" test in the suite. Multi-face handling is wired but the prototype samples are single-face; the merge story (P1-6 — "a field is satisfied if found on any face, warning checked across faces") is the meaningful test of multi-face, and putting it through a contrived demo before the merge code exists adds noise without information.

**Next:** P1-2 — Extraction service (single model call per application carrying all faces, transcribed text only per D4, D14).

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
