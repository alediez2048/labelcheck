# P5-8 — Empty-by-default state + drag-and-drop TTB intake (Vercel-safe)

Replace the in-memory seed queue with an empty initial state, and add an admin-facing drag-and-drop intake on Operations that accepts single PDFs, multi-select, or whole-folder uploads of TTB COLA PDFs. **PDF rasterisation and text extraction run in the browser via `pdfjs-dist` in a Web Worker** — the server never touches a PDF, so the deploy is Vercel-safe by construction. Form fields are parsed client-side (regex anchors first, vision-provider fallback on the rendered page when fields are missing), and each application is submitted through the existing `/api/batch` seam carrying a rendered label PNG + the assembled form object. A "Load demo prefill" button stays as a one-click convenience that ingests the curated 10 TTB greens (`data/sample-colas/manifest.curated.csv`, with pre-rendered PNGs committed under `public/sample-colas/`) + the 3 synthetic-defect reds (AC-2 ABV mismatch, AC-3 title-case warning, AC-4 net-contents mismatch).

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @requirements.md, @TICKETS.md, @docs/00-build/DEV-LOG.md, @docs/03-ui/mockup.md, and the existing ticket files for P0-3, P0-5, P1-1, P2-2, P3-1, P5-3, P5-4, P5-7.
Open @data/sample-colas/README.md, @data/sample-colas/manifest.csv, and @tools/cola-fetcher/pull_colas.py (the regex anchors this ticket ports to TypeScript).

I'm working on TICKET-P5-8: Empty-by-default state + drag-and-drop TTB intake (Vercel-safe).

Current state: (at start)
- [list what is DONE so far, with checks: every screen exists and is wired to real state through Phases 1–5; the seed in `lib/queue/fixtures.ts` exports `SEED_APPLICATIONS` + `SEED_DISPOSITIONED_APPLICATIONS` + `SEED_AUDIT_EVENTS`; `lib/queue/QueueProvider.tsx` boots from them (placeholder image bug: every queue row shows `/fixtures/images/none_001.png` because `PLACEHOLDER_FACES` is shared by reference); `/api/batch` POST already accepts explicit `applications[]` with base64 face bytes (P3-1); the mock provider keys canned answers off `applicationId`; the Anthropic provider is `PROVIDER=anthropic` with `ANTHROPIC_API_KEY`; the bake-off provider registry (P5-4) exposes the same adapter contract; `data/sample-colas/pdfs/*.pdf` carries 80 real approved TTB COLAs + `manifest.csv` with typed fields scraped from the TTB website (NOT from the PDFs); `pdf-parse` is a dependency used by P4-1 KB ingestion (server-side, local dev only)]

What's NOT done yet:
- [list with crosses: the QueueProvider INITIAL_STATE still references the seed arrays; no drag-and-drop intake; no client-side PDF rasteriser or form-field parser; no curated demo manifest; no Reset action; no committed prefill PNGs]

TICKET-P5-8 Goal:
Start the demo from zero — no fake applications, no fake dispositions, no fake audit. The reviewer can either (a) drag and drop one or many TTB COLA PDFs onto Operations, or (b) click "Load demo prefill" for a one-click curated set (10 real TTB greens + 3 synthetic defects). For every dropped PDF, the BROWSER renders the label page to PNG AND parses the form fields (regex anchors first; vision-provider fallback on the rendered form page when required fields are missing). The server only ever receives a base64 PNG + the assembled form object via the existing `/api/batch` route — no PDF rasterisation on the server, so the deploy ships on Vercel by construction. The placeholder-image bug ("all queue rows show the same picture") is fixed by construction because every loaded application carries its own face.

Check `lib/queue/QueueProvider.tsx` (INITIAL_STATE seam), `lib/queue/fixtures.ts` (current seed shape — KEEP `SEED_AGENTS` + `BASELINE_MATCH_RATE` + `AVG_MANUAL_HANDLING_SECONDS` + `DEFAULT_CURRENT_AGENT_ID` + `DEFAULT_SUPERVISOR_ID`), `app/api/batch/route.ts` (the wire shape for the explicit-applications payload + `SYNTHETIC_FIXTURE_META` for the 3 reds), `lib/batch/orchestrator.ts`, `lib/provider/index.ts` (the `PROVIDER` env switch), `app/(admin)/operations/page.tsx` (where the dropzone mounts), `lib/kb/parse.ts` (how the codebase handles `pdf-parse` lazily under Next 15 RSC — kept for KB only), `tools/cola-fetcher/pull_colas.py` (the FIELD_LABELS + scrape_field regex this ticket ports), and `data/sample-colas/manifest.csv`.
Follow @PRD.md (Phase 1 single-application verification is the headline; this ticket feeds it), @requirements.md (NFR-1 latency, NFR-4 prototype persists nothing, AC-2/AC-3/AC-4 must stay covered, NFR-2 color+icon+text), and @systemsdesign.md (D4 model reads / code decides, D8 swappable provider, D11 conservative defaults, D15 routing happens at intake).

CRITICAL: The deploy target is Vercel (P5-7). The server CANNOT rasterise PDFs (no native canvas binaries, no Poppler, no system libraries). All PDF processing (rendering + text extraction) happens in the BROWSER via `pdfjs-dist` in a Web Worker. The server receives PNGs + JSON, exactly as it does today for synthetic-batch intake.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (NFR-1, NFR-2, AC-2, AC-3, AC-4, AC-5, AC-9).
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste real branch state. P5-8 ships ahead of P5-6 because the design pass should style a real intake UI, not the seeded one.)_

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-P5-8 Scope

- Phase: Phase 5 — Evals, observability, and demo close-out
- Time budget: 6h (Web Worker + client raster + client parser + dropzone UI + vision fallback wire + demo prefill)
- Dependencies: P0-3 (provider adapter + mock), P0-5 (image preprocessing — the dropped PNG goes through it), P1-1 (single-application input contract), P2-2 (Operations view), P3-1 (batch intake — the `/api/batch` route is the submission target), P5-3 (corpus-write hook fires for any disposition), P5-4 (provider registry — the live grade goes through the same adapter)
- Branch: feat/dragdrop-intake

### Architecture (binding)

```
Browser                                       Server (Next.js + Vercel)
─────────────────────────────────────────────────────────────────────────
[Operations: Dropzone]
        │
        ▼  files dropped / chosen / folder picked
[lib/intake/client/recursiveFileWalk.ts]
        │  PDFs only; rejects non-PDFs
        ▼
[components/intake/PdfWorker.ts]   ← Web Worker, owns the pdfjs-dist instance
        │  per PDF, in parallel up to N_WORKER_CONCURRENCY:
        │    1. load PDF
        │    2. extract page-1 text → regex parse form fields
        │    3. render LABEL page to PNG (page 3 if it exists, else page 1)
        │    4. if any required field is missing AND a form page exists:
        │         render the FORM page to PNG too (extracted-from-text page 1)
        │    5. emit { applicationId, brand, form, formSources,
        │             labelPng (base64), formPagePng (base64 | null),
        │             missingFields[] }
        ▼
[lib/intake/client/dropzoneIntake.ts]
        │  assembles /api/batch payload from worker emissions
        │  if missingFields[] non-empty AND formPagePng present:
        │     attach the formPagePng as a second face with kind="form_page"
        │     so the existing orchestrator can route it to the vision
        │     provider's form-extraction prompt server-side
        ▼  POST /api/batch
                                                  [app/api/batch/route.ts]
                                                          │ unchanged wire shape;
                                                          │ adds an optional
                                                          │ `formFallbackHint?:
                                                          │  { missingFields[] }`
                                                          │ per application
                                                          ▼
                                                  [lib/batch/orchestrator.ts]
                                                          │ per item:
                                                          │   1. label extraction
                                                          │      (existing path)
                                                          │   2. if formFallbackHint,
                                                          │      run a separate
                                                          │      provider call against
                                                          │      formPagePng with the
                                                          │      form-extraction prompt
                                                          │   3. merge form: regex wins
                                                          │      on conflict; vision
                                                          │      fills missingFields[]
                                                          │   4. match + triage
                                                          ▼
                                                  emits VerificationResult
                                                          │
                                                          ▼  poll /api/batch/[id]
[lib/queue/QueueProvider.tsx]
        │  appendBatchResult(items)
        ▼
[My Queue / Operations funnel / review detail]
```

The server **never** loads `pdfjs-dist`, `pdf-parse`, `pdf-to-png-converter`, `pdf-poppler`, or any other PDF processor for the drag-and-drop path. `pdf-parse` is kept only for the KB ingestion path (P4-1), which runs locally and is not on the Vercel deploy critical path.

### Acceptance criteria

#### Empty state

- [ ] `lib/queue/QueueProvider.tsx` boots from an empty initial state: `applications: []`, `dispositionedApplications: []`, `auditEvents: []`. Agents + role defaults preserved.
- [ ] Analytics' empty-state copy: *"Drop a folder of TTB COLA PDFs on Operations to see the metrics, or click Load demo prefill for the curated demo set."* No fake metrics shown when no applications exist.

#### Drag-and-drop intake (the headline)

- [ ] A dropzone mounts on **Admin → Operations**, above the funnel. Accepts:
  - A single dropped PDF
  - Multiple PDFs (drop + multi-select via system picker)
  - An entire folder (Chrome/Edge `webkitdirectory`; Safari falls back to multi-file picker with a banner explaining the limitation)
- [ ] Non-PDF files are rejected at the dropzone with a clear per-file message (*"X.jpg is not a TTB COLA PDF — only PDFs are accepted in this build; image-only uploads are in P6-4"*). Other files in the same drop still process.
- [ ] An upload progress strip shows per-file status: queued → reading → parsing form → rendering label → submitting → grading → done (or failed with a reason). NFR-2: each status has color + icon + text; failure isn't conveyed by color alone.
- [ ] **Batch ceiling**: respects `config/batch.json`'s `maxItems`. If the operator drops more files than the ceiling: *"You dropped 73 files; batch ceiling is 50. Drop in two passes, or raise `maxItems` in `config/batch.json`."* No silent truncation.
- [ ] **Concurrency**: the batch orchestrator's `concurrency` governs server-side grading parallelism; the Web Worker has its own `N_WORKER_CONCURRENCY` (default 4) for parallel PDF processing on the client. The two are independent and tunable.

#### Client-side PDF rasteriser (Web Worker)

- [ ] `components/intake/PdfWorker.ts` is a Web Worker bundled with the page that owns the single `pdfjs-dist` instance. The main thread NEVER calls `pdfjs-dist` directly to avoid blocking the UI on large files.
- [ ] The worker accepts `{ id, pdfBytes }` messages and emits `{ id, type: "progress" | "done" | "error", payload }`. `progress` payloads carry the current stage ("text_extracted" | "label_rendered" | "form_rendered"). `done` carries the final `{ form, formSources, missingFields, labelPng, formPagePng }`.
- [ ] PDF rendering targets ~1568px long edge (matches P0-5's pre-processing cap; downstream resize is a no-op).
- [ ] **Label-page selection heuristic**: page 3 if the PDF has ≥3 pages, else page 1. Document the heuristic in code; the existing AC-5 unreadable path catches the rare wrong-page miss.
- [ ] **Form-page selection heuristic**: page 1 (TTB Form 5100.31's first page). The text extraction (next bullet) already runs on page 1.
- [ ] **Worker lifecycle**: one persistent worker per page session (not per file); torn down when the operator navigates away. Worker boot cost amortises across the batch.

#### Client-side form parser (regex first)

- [ ] `lib/intake/client/parseColaPdf.ts` runs inside the worker (or in a worker-safe module the worker imports). Reads the full PDF text via `pdfjs-dist`'s `getTextContent()` and applies the regex anchors ported from `tools/cola-fetcher/pull_colas.py`:
  - `Brand Name:` → `brand_name`
  - `Fanciful Name:` → `fanciful_name`
  - `Class/Type Code:` → `class_type`
  - `Alcohol Content:` → `alcohol_content`
  - `Net Contents:` → `net_contents`
  - `Origin Code:` → `country_of_origin`
  - Mailing Address / Bottler / Importer rows → `producer_name`, `producer_address`
- [ ] Anchor matching is case-insensitive and tolerant of whitespace + line wraps.
- [ ] Returns `{ form: PartialSampleForm, formSources: Record<field, "regex" | "missing">, missingFields: FieldName[] }`. `missingFields` is the subset of required fields (`brand_name`, `class_type`, `alcohol_content`, `net_contents`, `producer_name`) that did NOT match.

#### Vision fallback (server-side, fed by client-rendered PNG)

- [ ] When `missingFields[]` is non-empty AND the worker successfully rendered a form-page PNG, the dropzone payload attaches `formPagePng` as an additional face with `kind: "form_page"` and sets `formFallbackHint: { missingFields }` on the per-application payload.
- [ ] `app/api/batch/route.ts` schema is extended to accept `kind: "front" | "back" | "neck" | "form_page"` and the new optional `formFallbackHint` per application. Backwards-compatible: the existing 3-face limit becomes 4 to accommodate the form face. The form face does NOT count toward label-extraction face merge logic.
- [ ] `lib/batch/orchestrator.ts` (or a new `lib/batch/formFallback.ts` helper) runs a second provider call against the `form_page` face with a distinct form-extraction prompt (`lib/provider/prompts/formExtraction.ts`). Returns a partial form keyed only on `missingFields`.
- [ ] Final merge: regex value wins on every field both passes produced; vision fills `missingFields`. Each field carries `source: "regex" | "vision" | "missing"` through to the `VerificationResult` so the review detail can surface provenance (P5-6 styles the chip).
- [ ] Inline operator fallback: if both regex AND vision leave a required field empty, the progress strip surfaces an inline text field (*"We couldn't read `alcohol_content` for HARBOR_MIST.pdf — type it in to grade"*). Field source becomes `"operator"` for those.

#### Provider routing

- [ ] When `PROVIDER=anthropic` and `ANTHROPIC_API_KEY` is set, both label extraction and the vision form fallback hit the live Anthropic provider.
- [ ] When the key is absent, the loader falls back to mock with a non-blocking banner. The form-extraction prompt is mocked too (returns a no-op form).
- [ ] Provider switching is the existing `lib/provider/index.ts` mechanism. The dropzone does not call the provider directly — it posts to `/api/batch`, same as any other intake (D4 + D8).

#### Curated demo prefill (one-click convenience)

- [ ] A second button next to the dropzone: **"Load demo prefill"**. Loads exactly 13 items in this order:
  1. `03211001000018` — CASCADE WINERY — TABLE RED WINE
  2. `10363001000317` — LENZ MOSER — TABLE WHITE WINE
  3. `09079001000202` — TOMASELLO WINERY — SPARKLING WINE/CHAMPAGNE
  4. `14066001000403` — COTTON HOLLOW — STRAIGHT BOURBON WHISKY
  5. `12271001000359` — COTTON HOLLOW — RYE WHISKY
  6. `14049001000115` — CASAMIGOS — TEQUILA FB
  7. `13241001000512` — MONKEY 47 — OTHER DISTILLED GIN FB
  8. `13301001000314` — THE SUBSTANCE — ALE
  9. `13100001000426` — GEKKEIKAN — SAKE - IMPORTED
  10. `11038001000725` — BARENJAGER — OTHER HERB & SEED CORDIALS/LIQUEURS
  11. `sample-abv-mismatch-001` — HARBOR MIST — synthetic red (AC-2)
  12. `sample-warning-titlecase-001` — CEDAR RIDGE — synthetic red (AC-3)
  13. `sample-warning-missing-001` — COASTAL — synthetic red (AC-4)
- [ ] Curated rows live in committed `data/sample-colas/manifest.curated.csv` (one-time hand pick; same columns as upstream `manifest.csv`).
- [ ] The 10 label PNGs are committed under `public/sample-colas/<ttb_id>.png` so the prefill path **never invokes the worker or the rasteriser** — the assets ship as static files on Vercel.
- [ ] The 10 form-field rows are baked into the curated manifest (`brand_name`, `class_type`, `alcohol_content`, `net_contents`, `producer_name`) so the prefill never needs the vision form fallback either. All values are taken from `tools/cola-fetcher/pull_colas.py` output for those 10 IDs; one-off `scripts/build-curated-manifest.ts` reads upstream + emits the curated file. Missing fields in upstream (notably `abv`) are filled in by hand for those 10 IDs only.
- [ ] The 3 synthetic reds reuse `SYNTHETIC_FIXTURE_META` from `app/api/batch/route.ts` (move to `lib/intake/syntheticRedFixtures.ts` if cleaner) and always hit the mock provider.
- [ ] The prefill button is disabled while a drag-drop intake is in flight, and vice versa.

#### Reset

- [ ] **"Reset demo state"** button next to the dropzone + prefill button. Confirmation modal (NFR-2 visible/dismissable). Clears `applications`, `dispositionedApplications`, `auditEvents` back to empty. **Does NOT delete** `eval-data/agent-corrections/<date>.jsonl` — the agent-correction corpus is a long-lived eval signal (P5-3); session reset must not wipe it. The modal copy says so.

#### Bug fix carried by this ticket

- [ ] The placeholder-image bug (`PLACEHOLDER_FACES` shared by reference across the 9 seed entries → every queue row + review detail shows `/fixtures/images/none_001.png`) is gone by construction.

#### Vercel deploy verification

- [ ] After implementation, deploy a preview to Vercel (or run `vercel build && vercel dev` locally if no Vercel project is linked yet). Confirm: dropping a PDF on the deployed app produces a graded application end-to-end, with the label image visible on the queue row. No serverless function ever loads a PDF processor.
- [ ] The serverless function bundle size is logged in the build output; record it in the DEV-LOG entry. Confirm it's under Vercel's 50MB compressed / 250MB uncompressed limits.

#### Verification

- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm eval --gate` all pass. The eval gate's golden set is unchanged — this ticket does not touch matching logic.

### Implementation details

- **`pdfjs-dist` install**: `pnpm add pdfjs-dist`. Use the modern ESM build. Next.js 15 needs a `webpack` config tweak to load the worker as an asset — Next docs cover the pattern. The worker file is `components/intake/PdfWorker.ts`, compiled by Next's webpack into a worker chunk.
- **Worker loading from the dropzone**: `new Worker(new URL("./PdfWorker.ts", import.meta.url), { type: "module" })`. Standard pattern; Next 15 supports it.
- **No `pdf-parse` for the drag-drop path**. Keep it in the deps for `lib/kb/parse.ts` (P4-1 KB ingestion, run locally). Do not import it from any code on the Vercel serverless path. If you want to be defensive, add an ESLint rule that bans `pdf-parse` imports outside `lib/kb/**`.
- **Empty state.** `INITIAL_STATE` in `QueueProvider.tsx` keeps `agents`, `currentAgentId`, `baselineMatchRate`; sets `applications: []`, `dispositionedApplications: []`, `auditEvents: []`.
- **Seed file.** Do NOT delete `lib/queue/fixtures.ts`. Tests import `SEED_APPLICATIONS` + `SEED_DISPOSITIONED_APPLICATIONS`; port what they need into the test files (one fixture per test, scoped locally), then mark the production exports `@deprecated — used only by tests; production INITIAL_STATE is empty (P5-8)`. Agents/role exports stay live.
- **Dropzone component.** `components/intake/CorpusDropzone.tsx`. Native HTML5 dnd (no react-dropzone). `webkitdirectory` on the file input behind a "Choose folder" button gives folder-pick on Chrome/Edge; the dropzone falls back to `<input type="file" multiple>` on Safari. The drop handler walks `event.dataTransfer.items` for both files and directories (recursive expansion via `webkitGetAsEntry`).
- **`/api/batch` schema extension.** Add `kind: "form_page"` to the face enum. Add an optional per-application `formFallbackHint: { missingFields: FieldName[] }`. Both backward-compatible with the existing synthetic-batch + verify paths.
- **Provider prompts.** Add `lib/provider/prompts/formExtraction.ts` with the prompt: *"Extract the typed application fields from this TTB Form 5100.31 page: brand_name, class_type, alcohol_content, net_contents, producer_name. Return null for any field not visible. The page is a scanned form, not a label."* Keep the existing label-extraction prompt unchanged.
- **Curated manifest source.** `data/sample-colas/manifest.curated.csv` — committed, same columns as upstream + the parsed form-field columns filled in by hand for the 10 IDs.
- **Render cache.** `scripts/render-sample-pngs.ts` — one-off; runs on a dev machine; reads the curated manifest, renders the first label page from each PDF via `pdfjs-dist` + `@napi-rs/canvas` (or any node rasteriser — this script is dev-only and never on Vercel), writes to `public/sample-colas/<ttb_id>.png`. Commit the 10 PNGs.
- **Beverage-type map.** `lib/intake/beverageFromClass.ts` — `wine` for WINE/CHAMPAGNE/SAKE, `distilled_spirits` for WHISKY/BOURBON/RYE/TEQUILA/GIN/VODKA/CORDIAL/LIQUEUR, `malt_beverage` for ALE/BEER/MALT. Default `distilled_spirits`.

### Key constraints

1. **The server NEVER loads a PDF processor on the deploy critical path.** No `pdf-parse`, no `pdf-to-png-converter`, no `pdf-poppler`, no native canvas binaries from any module reachable from `/api/batch`. The whole point of this ticket's architecture is that the Vercel deploy ships safely. Violating this constraint blocks P5-7 from shipping.
2. **NFR-4 still holds.** Drag-and-drop intake stays in-memory; dropped files render in the browser, base64 PNG goes on the wire, the orchestrator's results live in the React store. The 10 curated PNGs under `public/sample-colas/` are static demo assets, not user data. `eval-data/agent-corrections/` is unchanged.
3. **D4 + D8.** The dropzone does NOT call the provider directly. It posts to `/api/batch`; the orchestrator + adapter handle grading.
4. **The eval gate stays green.** This ticket touches no matching logic, no thresholds, no config. A test failure on `pnpm eval --gate` is a real regression.
5. **The 3 reds are non-negotiable.** AC-2 / AC-3 / AC-4. Reuse `sample-abv-mismatch-001`, `sample-warning-titlecase-001`, `sample-warning-missing-001` exactly.
6. **Reset does not nuke the corrections corpus.** Modal copy says so.
7. **Regex wins on conflict, vision fills the gaps.** Auditable path wins; vision is for missing fields only.

### Files to modify

- `lib/queue/QueueProvider.tsx` — empty `INITIAL_STATE`; add `appendBatchResult(items)` and `resetDemoState()` actions.
- `lib/queue/fixtures.ts` — keep agents + role exports; mark application/disposition/audit seed exports `@deprecated — tests only`.
- `lib/queue/__tests__/*.test.ts` — port seed-dependent fixtures inline.
- `app/(admin)/operations/page.tsx` — mount `<CorpusDropzone />` + `<LoadDemoPrefillButton />` + `<ResetDemoButton />` + the progress strip.
- `app/(admin)/analytics/page.tsx` — empty-state CTA.
- `app/api/batch/route.ts` — extend the face enum to include `form_page`; add the optional `formFallbackHint` per application.
- `lib/batch/orchestrator.ts` — branch on `formFallbackHint`: when present, run the form-extraction provider call against the `form_page` face after the label extraction and merge the result.
- `lib/provider/anthropic.ts` (or the prompt file it imports) — wire the form-extraction prompt path; pure additive.
- `next.config.ts` — webpack tweak (if needed) so `pdfjs-dist` workers bundle correctly.

### Files to create

- `components/intake/CorpusDropzone.tsx`
- `components/intake/LoadDemoPrefillButton.tsx`
- `components/intake/ResetDemoButton.tsx`
- `components/intake/PdfWorker.ts` — the Web Worker entrypoint (imports `pdfjs-dist`, exposes the messaging contract)
- `lib/intake/client/parseColaPdf.ts` — runs inside the worker
- `lib/intake/client/dropzoneIntake.ts` — main-thread orchestration: walks the file list, hands PDFs to the worker, assembles `/api/batch` payloads, handles missing-field UI
- `lib/intake/client/recursiveFileWalk.ts` — `DataTransferItem` → flat PDF list
- `lib/intake/beverageFromClass.ts`
- `lib/intake/syntheticRedFixtures.ts` — exported `SYNTHETIC_FIXTURE_META` (moved from `app/api/batch/route.ts`)
- `lib/provider/prompts/formExtraction.ts`
- `lib/batch/formFallback.ts` — server-side: run the form-extraction provider call when `formFallbackHint` is present; merge regex + vision
- `data/sample-colas/manifest.curated.csv`
- `public/sample-colas/<ttb_id>.png` × 10
- `scripts/render-sample-pngs.ts` — one-off dev script
- `scripts/build-curated-manifest.ts` — one-off dev script: reads upstream + emits the curated CSV with form fields filled
- `tests/intake/client/parseColaPdf.test.ts` — text-fixture-driven regex tests (no real PDF parsing in unit tests)
- `tests/intake/client/dropzoneIntake.test.ts` — recursive walk + ceiling enforcement
- `tests/intake/syntheticRedFixtures.test.ts` — guards the 3 red IDs against renames
- `tests/batch/formFallback.test.ts` — server-side merge logic

### Config / schema / store updates

- `app/api/batch/route.ts` — schema extension noted above; backward-compatible.
- No other config or schema changes.
- Store shape unchanged; two new actions on `QueueProvider`.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
pnpm eval --gate
```

Manual (local dev):
- [ ] `pnpm dev` → fresh load → Operations shows empty funnel; dropzone + Load demo prefill + Reset buttons visible. My Queue is empty.
- [ ] Drop a single TTB PDF from `data/sample-colas/pdfs/`. The progress strip shows reading → parsing → rendering → submitting → grading → done within ~5–10s (mock) or ~10–20s (live Anthropic). The funnel ticks up by 1.
- [ ] Drop 3 PDFs at once. All three parse + render in parallel in the worker; orchestrator grades up to its concurrency.
- [ ] Drop a folder of 50 PDFs (Chrome). All 50 ingest.
- [ ] Drop 73 → see the "ceiling 50" notice.
- [ ] Drop a JPG alongside PDFs → JPG rejected with the right message; PDFs ingest.
- [ ] Drop a corrupt PDF → progress strip shows clear "parse failed" status; batch continues.
- [ ] Drop a PDF whose text doesn't include "Alcohol Content:" → confirm the vision fallback runs (network tab shows the second provider call against the `form_page` face); the field is filled with `source: "vision"`. The review detail shows the provenance chip (P5-6 styles it; the data tag must ship).
- [ ] Drop a PDF whose form is fully unreadable → confirm the inline "type the missing field" form appears; type a value; submit; the application grades normally with `source: "operator"`.
- [ ] Click Load demo prefill (no key). Banner appears; 13 items load via mock. Funnel: 13 received, 10 ready, 3 needing review.
- [ ] Set `ANTHROPIC_API_KEY` + `PROVIDER=anthropic`; reload. Click Load demo prefill. The 10 greens hit the live API; per-item latency under NFR-1 5s p95.
- [ ] Click Reset → confirmation modal → confirm → queue empty; `eval-data/agent-corrections/` files still present.
- [ ] Verify the placeholder bug is gone: each row's label image is unique.

Manual (Vercel preview deploy):
- [ ] Push the branch and let Vercel build a preview. Confirm the build succeeds and the function bundle size is well under the 50MB compressed limit (logged in the build output).
- [ ] Open the preview URL behind the access-gate passcode. Drop a single TTB PDF. Confirm end-to-end grading works — funnel ticks, queue row appears with its label image, the provider call hits the live API (verifiable in the Vercel function logs).
- [ ] Drop 5 PDFs. Confirm parallel processing works; no serverless function timeout.
- [ ] Click Load demo prefill. Confirm the 10 pre-rendered PNGs serve as static assets (Vercel's CDN; no function invocation for the images) and the 13 items grade.
- [ ] Grep the Vercel function logs for `pdf-parse`, `pdfjs-dist`, `pdf-to-png-converter`, `canvas`, `poppler`, `mupdf` — should be zero hits. Server-side never loads PDF processors.

Update docs: mark P5-8 done in TICKETS.md; add a DEV-LOG entry including the function bundle size + the Vercel preview URL; cross-reference the curated manifest in `data/sample-colas/README.md`.

### Reference

- @PRD.md — Phase 1 single-application verification; demo flow.
- @docs/03-ui/mockup.md — Operations view (dropzone mounts there); My Queue (rows need real images).
- @requirements.md — NFR-1 (p95 latency), NFR-2 (color + icon + text), NFR-4 (nothing persisted), AC-2/AC-3/AC-4 (the three red cases), AC-5 (unreadable / low confidence), AC-9 (status pills).
- @systemsdesign.md — D4 / D8 / D11 / D15.
- @data/sample-colas/README.md — upstream 80-COLA corpus.
- @tools/cola-fetcher/pull_colas.py — Python regex source the TypeScript parser ports from (`FIELD_LABELS`, `scrape_field`).
- @TICKETS.md P5-7 — the deploy that this ticket must not break.
- `pdfjs-dist` docs — Web Worker setup under Next.js.

### Common gotchas

1. **The server CANNOT load a PDF processor on the Vercel critical path.** This is THE constraint of the ticket. If `pnpm build` brings in `pdf-parse` or `pdf-to-png-converter` from any file reachable from `/api/batch`, fix that before going further. The function bundle blows up and Vercel cold-start tanks even if the code "works."
2. **`pdfjs-dist` Worker setup under Next 15.** The worker URL needs `new Worker(new URL(...), { type: "module" })`. The `next.config.ts` may need a small webpack tweak so the worker file is emitted as a separate chunk. The `pdfjs-dist` package's `mjs` entry point is the right one.
3. **Don't delete `lib/queue/fixtures.ts`.** Tests import the seeds. Port what they need inline and mark the production exports `@deprecated`.
4. **Don't bypass the provider adapter.** The dropzone posts to `/api/batch`; the orchestrator + adapter grade. Direct provider calls skip timeout + tracing + bake-off swappability.
5. **Don't commit the upstream PDFs.** They're gitignored per `data/sample-colas/README.md`. The cached prefill PNGs at `public/sample-colas/` ARE committed.
6. **Don't break the 3 reds.** Reuse the existing `applicationId`s exactly.
7. **Regex wins on conflict, vision fills the gaps.** The auditable path wins.
8. **Safari has no folder pick.** Document it in the dropzone copy; multi-file picker still works.
9. **Worker bundle.** Confirm the worker chunk is reasonably sized (`pdfjs-dist` is ~1.5MB minified; acceptable). The main bundle should stay close to today's size; the worker loads on demand.

### Definition of Done

Code complete when:
- [ ] `INITIAL_STATE` is empty.
- [ ] Drag-and-drop intake works for single, multi-file, and folder uploads against `pnpm dev`.
- [ ] The worker renders + parses TTB PDFs we have on disk; the regex catches the common fields and vision fallback fills the gaps.
- [ ] Load demo prefill works end-to-end against both mock and live providers.
- [ ] Reset clears in-memory state and preserves `eval-data/agent-corrections/`.
- [ ] Placeholder-image bug is gone.
- [ ] **Vercel preview build succeeds and the deployed app's dropzone works end-to-end.**
- [ ] **Grep of Vercel function logs for PDF processor names returns zero hits.**
- [ ] No console errors; no test failures.

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm eval --gate` pass.
- [ ] Manual checks above ticked (including the Vercel preview).
- [ ] TICKETS.md + DEV-LOG updated; the DEV-LOG records the function bundle size and the Vercel preview URL.
- [ ] Committed to `feat/dragdrop-intake`, pushed, merged to main.

### Expected output

The reviewer opens the deployed Vercel app: empty funnel, empty queue. Two paths:
- **Path A (operator)**: drag a folder of TTB COLA PDFs. The browser parses + rasterises locally; the server only grades. Each row appears with its own real label image. Form fields the regex missed get filled by the vision fallback (provenance chip on the review detail).
- **Path B (demo prefill)**: click "Load demo prefill". 10 real TTB greens + 3 synthetic defects flow through the same pipeline using pre-rendered cached PNGs. AC-2/AC-3/AC-4 stay deterministic.

The Reset button gives a clean slate. The placeholder-image bug is gone by construction. The Vercel deploy ships because the server never touches a PDF.

### Dependencies to install

```
pnpm add pdfjs-dist
```

The script `scripts/render-sample-pngs.ts` can install whatever it needs locally (`@napi-rs/canvas`, etc.) under `devDependencies` since it never runs in production.

### Why

The take-home demo's whole point is showing the AI verify real labels on a working deploy. The prototype currently boots with 9 synthetic fake applications that share one placeholder image, and the only intake path is a fixed sample loader. P5-7 (deployment) is the credibility close-out; if P5-8 ships PDF processing on the server, the Vercel deploy is at risk because native canvas binaries don't run reliably on serverless. Moving all PDF processing to the browser via `pdfjs-dist` in a Web Worker is Vercel-safe by construction: the server only ever receives PNGs and JSON, exactly as it does today for synthetic batches. Operators can ingest any TTB COLA PDF — the demo becomes a working tool rather than a slideshow. The regex anchors port the existing Python source so the team doesn't duplicate logic across languages; the vision fallback covers the long-tail PDFs the regex misses, using the same provider adapter through the same `/api/batch` seam. Curated 10-set + 3 synthetic reds stay reachable via Load demo prefill so a cold reviewer with no PDFs handy still has a deterministic end-to-end demo, and AC-2/AC-3/AC-4 stay covered. NFR-4 still holds (nothing persisted), and the placeholder bug is fixed by construction. P5-7's deploy ships; P5-6's design pass now styles a real intake UI.
