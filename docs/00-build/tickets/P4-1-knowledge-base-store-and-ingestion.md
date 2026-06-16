# P4-1 — Knowledge base store and ingestion

Stand up the admin-managed grounding source for the assistant: an upload-chunk-embed-index pipeline behind the Knowledge Base tab (placeholder from P2-5), with per-document status. This is the corpus the read-only assistant in P4-2 is allowed to cite from — and only from.

## Copy-Paste Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, @schema.md, @observability.md, and @TICKETS.md.

I'm working on TICKET-P4-1: Knowledge base store and ingestion.

Current state: (at start)
- [list what is DONE so far, with check, including P2-5 role shells with the Admin Knowledge Base nav placeholder, and any deployed URL]

What's NOT done yet:
- [P4-1] Knowledge Base tab is a navigation placeholder only — no upload, no ingest, no index.
- [P4-1] No knowledge_base store exists; assistant cannot retrieve anything.
- [P4-2] Retrieval-grounded assistant blocked on this ticket.
- [P4-3] Guardrails blocked on P4-2.

TICKET-P4-1 Goal:
Implement the admin-only Knowledge Base tab: upload a document (PDF, DOCX, Markdown, TXT), chunk it, embed each chunk, and write the chunks into a knowledge_base store (in-memory + file-backed for the prototype; pgvector in production per schema.md). Show per-document status (queued, indexing, ready, failed) and version every chunk so admins can supersede stale guidance. No chat path yet — that lands in P4-2.

Check `app/(admin)/knowledge-base/page.tsx` and `lib/kb/` before starting. Don't overwrite existing code.
Follow the architecture in @systemsdesign.md (Assistant component, Configuration store separation) and the data shape in @schema.md (knowledge_base table). Match the cross-cutting rules in @PRD.md §6 (NFR-4: prototype persists nothing sensitive; the KB content is admin-uploaded reference material, not applicant PII, so it is allowed in a local file-backed store).

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md (FR-31).
```

## Context Summary for Agent

### What the previous ticket delivered (at start)

_(Fill when ticket starts — paste the actual files, infra, and branch state from P3-4 / P2-5. Expected: the Admin shell from P2-5 has a `Knowledge Base` nav entry that renders an empty placeholder page; no upload UI, no store. Role switcher from P2-5 already gates the route to Admin only.)_

Files created: [paths from prior tickets, e.g. `app/(admin)/knowledge-base/page.tsx` placeholder, `lib/auth/role.ts`]
Infrastructure: [Vercel-style single host, env vars for provider key, no DB]
Current branch: [previous feature branch state]

### TICKET-P4-1 Scope

- Phase: Phase 4 — Assistant and knowledge base
- Time budget: 4h
- Dependencies: P2-5 (role shells, Admin gating, Knowledge Base nav placeholder)
- Branch: `feat/kb-ingest`

### Acceptance criteria

- [ ] Admin Knowledge Base tab accepts uploads of PDF, DOCX, Markdown, and TXT (FR-31).
- [ ] Each upload is chunked, embedded, and indexed into a knowledge_base store (schema.md knowledge_base; one row per chunk, sharing source_filename) (FR-31).
- [ ] Per-document status is shown and progresses through queued, indexing, ready, failed (FR-31; schema knowledge_base.status).
- [ ] Chunks are versioned (version + effective_from), so an admin can upload a newer version of the same source and the older version is superseded, not deleted (schema knowledge_base.version; parallels rule_config versioning).
- [ ] The route is Admin-only — Agents cannot reach it via direct URL (FR-29; D16).
- [ ] No chat / retrieval endpoint yet — that is P4-2; this ticket only writes to the store.
- [ ] The KB store is the only authoritative grounding source the assistant will be allowed to cite (FR-30; observability.md Component B: groundedness).

### Implementation details

1. Define the `KnowledgeBaseChunk` type in `types/kb.ts` mirroring schema.md knowledge_base (id, topic, title, body, source_filename, uploaded_by, status, embedding, version, effective_from).
2. Build a `KnowledgeBaseStore` interface in `lib/kb/store.ts` with `upsertChunks`, `listSources`, `getStatus`, `searchByVector` (the search method is implemented but not consumed until P4-2), and `supersedeSource`. Prototype implementation: in-memory map persisted to a local JSON file under `.data/kb/` (file-backed for restart resilience across the prototype; not in a real DB). Production note inline: this interface is the seam where pgvector lands.
3. Implement document parsing in `lib/kb/parse.ts`: PDF via `pdf-parse`, DOCX via `mammoth`, Markdown and TXT read directly. Strip binary, preserve paragraph breaks. Reject files over a configured size cap.
4. Implement chunking in `lib/kb/chunk.ts`: paragraph-aware split with overlap (target ~500 tokens per chunk, ~50-token overlap). Carry through `topic` (inferred from filename or a top-level header) and `title` (per-chunk first sentence or heading).
5. Implement embedding in `lib/kb/embed.ts` behind a `KnowledgeBaseEmbedder` interface (mirrors D8 swappable adapter). Prototype embedder: Anthropic or OpenAI embeddings via API; mock embedder returns deterministic hash-derived vectors so tests run with no key (parallels P0-3 mock adapter).
6. Cosine-similarity search helper in `lib/kb/search.ts` (used by P4-2; in-memory dot product over normalised vectors). Production note: in pgvector this is `ORDER BY embedding <=> $1 LIMIT k`.
7. Ingestion orchestrator in `lib/kb/ingest.ts`: takes an uploaded file, sets status `queued`, then `indexing`, parses → chunks → embeds → upserts → sets status `ready`. On any failure, set status `failed` and capture an error reason. Off the request path: kick off async (in the prototype, fire-and-forget with a tracking id; production: a job queue).
8. Build the upload UI under `app/(admin)/knowledge-base/page.tsx`: a list of uploaded sources with per-source status badge (queued / indexing / ready / failed), an upload control, and a "Replace with new version" affordance per source (which calls `supersedeSource`, writes new chunks with a bumped version and a new effective_from, and marks prior version's effective_to).
9. Add an `app/api/kb/upload` POST route (Admin-only via middleware role check) that accepts multipart upload and hands off to `ingest`.
10. Add an `app/api/kb/sources` GET route returning the source list and status, polled by the UI.
11. Seed a sample KB doc (e.g. a paraphrased "How to handle warning failures" markdown) under `fixtures/kb/` so the demo and P4-2 tests have content to ground on. The verbatim TTB warning text remains in the configuration store (P0-4), not in the KB — these are different concerns per CONTEXT.md.

### Key constraints (from CONTEXT.md, constraints.md, systemsdesign.md)

1. The Knowledge base is distinct from the Configuration store — KB holds help articles, onboarding, best-practice notes; config holds the verification rules and the verbatim warning text (CONTEXT.md: Knowledge base vs Configuration store). Do not put the canonical warning text in the KB.
2. The assistant can only cite what has been uploaded (FR-30, FR-31; systemsdesign Assistant) — this ticket is the deliberate control on what the assistant says. If the KB is empty, the assistant in P4-2 must decline rather than fall back to model priors.
3. Admin-only (FR-29, FR-31; D16) — the role switcher from P2-5 gates the route; server-side check on the upload route in addition to the UI hide.
4. Versioning (schema.md knowledge_base.version, effective_from / effective_to mirrors rule_config) — re-uploading a source bumps version rather than overwriting, so an admin can roll back and so traces in observability can be tied to the version that was indexed at the time.
5. TypeScript strict, no `any` (PRD §6).
6. NFR-4: applicant PII is not persisted; KB content is admin-uploaded reference material so it is allowed in a local file-backed store. The store path is gitignored.
7. The ingestion runs off the request path (systemsdesign Assistant: "an ingestion step (off the chat path)").

### Files to modify

Primary: `app/(admin)/knowledge-base/page.tsx`
Current contents: (at start) placeholder page from P2-5 — `<h1>Knowledge Base</h1>` and a "coming soon" note.
Action: replace with the upload UI, source list, and per-source status badges; poll `/api/kb/sources` on an interval while any source is `queued` or `indexing`.

Also modify:
- `app/(admin)/layout.tsx` — no nav change (Knowledge Base nav already exists from P2-5); ensure the route is wrapped by the Admin role guard.
- `middleware.ts` — confirm the `/api/kb/*` routes are behind the access gate (P0-6).

### Files to create

1. `types/kb.ts` — `KnowledgeBaseChunk`, `KnowledgeBaseSource`, `IngestStatus` enums mirroring schema.md knowledge_base.
2. `lib/kb/store.ts` — `KnowledgeBaseStore` interface + in-memory + file-backed prototype implementation under `.data/kb/`.
3. `lib/kb/parse.ts` — PDF / DOCX / MD / TXT parsing.
4. `lib/kb/chunk.ts` — paragraph-aware chunker with overlap.
5. `lib/kb/embed.ts` — `KnowledgeBaseEmbedder` interface + real (Anthropic/OpenAI) + mock implementations.
6. `lib/kb/search.ts` — cosine-similarity search over the in-memory store (consumed by P4-2).
7. `lib/kb/ingest.ts` — the parse → chunk → embed → upsert orchestrator with status transitions.
8. `app/api/kb/upload/route.ts` — POST multipart upload, Admin-only.
9. `app/api/kb/sources/route.ts` — GET source list + status.
10. `fixtures/kb/sample-warning-guidance.md` — seed content for the demo and P4-2 tests.
11. `tests/lib/kb/chunk.test.ts`, `tests/lib/kb/search.test.ts` — unit tests for the chunker and the cosine search.
12. `.gitignore` update: add `.data/kb/`.

### Config / schema / store updates

- New store: `.data/kb/` (gitignored) holding one JSON file per source (chunks + embeddings + version metadata).
- No schema change in the prototype DB (there is no prototype DB — NFR-4). The schema target for production is schema.md knowledge_base; this ticket implements the same column shape in-memory so the production swap is a persistence change only.

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```

Tests to add:
- `tests/lib/kb/chunk.test.ts` — chunker respects max-token target and overlap; preserves paragraph boundaries.
- `tests/lib/kb/search.test.ts` — cosine similarity ranks the obviously-relevant chunk first for a fixture query, using the mock embedder.
- `tests/lib/kb/ingest.test.ts` — status transitions queued → indexing → ready on success; queued → indexing → failed on parse error; superseding a source bumps the version.

Manual:
- [ ] As Admin, upload the seeded `sample-warning-guidance.md`. Confirm the status badge transitions queued → indexing → ready within a few seconds.
- [ ] Inspect `.data/kb/` and confirm chunks were written with version = 1 and an `effective_from` timestamp.
- [ ] Re-upload the same filename with edited content. Confirm a new version = 2 is written and the prior version is marked superseded (effective_to set), not deleted.
- [ ] Upload a corrupt PDF; confirm status ends in `failed` with a readable error reason.
- [ ] As Agent (via the role switcher), confirm the Knowledge Base route returns 403 / redirects, and `POST /api/kb/upload` returns 403.

Eval: not directly applicable in this ticket — assistant evals land in P4-2 and P4-3. But this ticket must populate the corpus that P4-2's groundedness and faithfulness evals will run against (observability.md Component B).

Update docs: mark P4-1 done in TICKETS.md; add a DEV-LOG entry capturing the chunker config, the prototype store path, and the production seam (pgvector).

### Reference

- requirements.md — FR-30 (assistant grounded in KB), FR-31 (admin manages KB; supported file types; per-document status).
- schema.md — `knowledge_base` table (the column shape this ticket mirrors in-memory), and the note that the assistant adds no other application-side tables.
- systemsdesign.md — Assistant component (the KB is the deliberate control on what the assistant says; ingestion off the chat path).
- CONTEXT.md — Knowledge base vs Configuration store distinction; Assistant definition.
- observability.md — Component B: groundedness is the primary quality bar; KB versioning supports tying traces to the indexed version.
- techstack.md — D8 swappable adapter pattern (mirrored here for the embedder).

### Common gotchas

1. The prototype uses an in-memory + file-backed store and computes cosine similarity in Node; production uses pgvector against the `knowledge_base` table in schema.md. Keep the `KnowledgeBaseStore` interface narrow so the swap is one adapter, not a refactor.
2. Version chunks so admins can supersede stale guidance — re-uploading a source must not overwrite. Bump `version`, set the prior row's `effective_to`, and write new rows with a new `effective_from`. Traces in observability tie back to the version that was retrieved at the time, which is impossible if you overwrite.
3. Status per document must transition through queued → indexing → ready → failed (schema.md knowledge_base.status). The UI polls `/api/kb/sources` while any source is mid-flight; do not block the upload request on the full embed.
4. Do not put the canonical government warning text in the KB — that lives in the Configuration store (P0-4, config/warning.json) per CONTEXT.md (Knowledge base vs Configuration store). The KB holds help articles and onboarding, not the regulatory rules the matching engine uses.
5. PDF parsing is the most failure-prone leg — many TTB-style PDFs are image-only and `pdf-parse` returns empty text. Route those to status `failed` with a clear "no extractable text — re-upload as DOCX or MD" reason rather than silently writing zero chunks.

### Definition of Done

Code complete when:
- [ ] Admin can upload a PDF / DOCX / MD / TXT and see status transitions to `ready`.
- [ ] Chunks are stored with embeddings, version, effective_from, source_filename.
- [ ] Re-uploading a source bumps version; prior version's effective_to is set.
- [ ] Upload route is Admin-only (server-side check, not just UI).
- [ ] No console / test errors; `pnpm lint` + `pnpm build` + `pnpm test` clean.
- [ ] Maintainability seams in place: `KnowledgeBaseStore` and `KnowledgeBaseEmbedder` interfaces are the production swap points (NFR-6).

Ticket complete when:
- [ ] All code-complete criteria met.
- [ ] Tests pass (lint, build, test, manual).
- [ ] TICKETS.md and DEV-LOG updated.
- [ ] Committed to `feat/kb-ingest`, pushed, merged to main.

### Expected output

An admin can upload a document into the Knowledge Base tab, watch it transition from queued to ready, and see it listed with its version. Chunks with embeddings are written to a file-backed store. The assistant cannot yet retrieve from it — that is P4-2 — but the corpus and the retrieval seam are in place.

### Dependencies to install

```
pnpm add pdf-parse mammoth
pnpm add -D @types/pdf-parse
# Embedding provider — pick one for the prototype; the other is a documented drop-in:
pnpm add @anthropic-ai/sdk
# OR
pnpm add openai
# Optional, if standing up an in-memory ANN index instead of brute-force cosine
# (brute force is fine for a prototype-sized corpus; hnswlib is the bridge to pgvector at scale):
# pnpm add hnswlib-node
```

---

## Outcome — done 2026-06-15

**Branch:** `feat/knowledge-base`
**Status:** Done — 324 tests pass + 1 skipped (+12 new); lint + build clean.
**Workflow:** Sixth parallel-agent build. Agent A: data layer + lib + tests + seed fixture. Agent B: upload UI + API routes. Contract-first dispatch.

**What landed:**
- `types/kb.ts` — full type set mirroring `knowledge_base` from schema.md.
- `lib/kb/{store,parse,chunk,embed,search,ingest}.ts` — pipeline + interfaces.
- `fixtures/kb/sample-warning-guidance.md` — seed help doc (NOT the verbatim warning text — that's the Configuration store's job).
- `tests/lib/kb/{chunk,search,ingest}.test.ts` — 12 new tests.
- `app/api/kb/{upload,sources}/route.ts` — POST + GET.
- `components/kb/{UploadDropzone,SourcesList}.tsx`.
- `app/(admin)/knowledge-base/page.tsx` — replaces the P2-5 placeholder. Polls every 800ms.
- `.gitignore` — `.data/` added.

**Runtime bug fixed during smoke:** `pdf-parse@2.4.5` static import loads `pdfjs-dist@5.4.296` at module load → fails under Next 15.5 RSC webpack with `"Object.defineProperty called on non-object"`. Even Markdown uploads broke. Fix: `await import("pdf-parse")` inside the PDF branch only. Documented inline.

**Verified end-to-end:** upload MD → 202 `{sourceFilename, version:1}` → poll shows `ready, v1, 1 chunk`. Re-upload bumps to v2; the v1 row lives in `history[]` with `effectiveTo` set.

**Deviations:**
- Lazy `pdf-parse` import (above).
- `lib/kb/store.ts` ships `getStore()` factory rather than the contract's named `listSources()` / `getSource()` exports. Agent B's route handler adapted; functionally equivalent.
- Mock-only embedder by default (deterministic FNV-1a hash → 384-dim unit vector). Production swap (Voyage AI / OpenAI) documented at the seam.
- The "Replace with new version" UX is the simplest possible: clicking Replace scrolls to the dropzone with a caption; the actual version bump is server-side via filename match in `ingestUpload`.

### Why

P4-1 opens Phase 4 with the corpus the assistant in P4-2 is allowed to cite from — and only from. The Knowledge base / Configuration store distinction (CONTEXT.md) is structural: KB holds help articles; config holds regulatory rules. The verbatim 27 CFR § 16.21 text stays in `config/warning.json`; the KB has guidance ABOUT the warning check.

The **`KnowledgeBaseStore` interface as production seam** is the discipline that lets pgvector drop in without touching the route layer. The prototype's in-memory + file-backed store IS the structural smoke; the contract maps one-for-one onto pgvector queries.

The **`setImmediate` background ingest** is the right shape for "off the request path". A real queue (BullMQ, Inngest) lands in production; the prototype's setImmediate is the structural equivalent. The upload returns 202 immediately; the UI polls for status transitions.

The **versioning rule** — re-upload bumps version, sets prior `effective_to`, keeps prior chunks for audit — is the structural enforcement of "the assistant's trace ties back to the version that was retrieved at the time" (observability.md Component B). Overwriting on re-upload would make P5-1's traces lie.

The **mock embedder with deterministic hash-derived vectors** is the right scope. A real embedder costs money on every chunk + every query; the prototype doesn't want that on every CI run. Same text → same vector is what `tests/lib/kb/search.test.ts` asserts. P4-2's retrieval surface reads the same mock by default; a real embedder ships when the reviewer wants to demo semantic quality (one env-var flip).

The **lazy `pdf-parse` import** is load-bearing for the route's resilience. Static import broke even Markdown uploads. The lazy import means PDF's known Next.js bundling pitfalls are paid only by PDF uploads.

The **content of `sample-warning-guidance.md`** matters as much as the pipeline. The doc is ABOUT the warning check, not the warning itself. If the canonical text lived in the KB, an admin upload could silently change the matching engine's behaviour — exactly what CONTEXT.md says shouldn't happen.
