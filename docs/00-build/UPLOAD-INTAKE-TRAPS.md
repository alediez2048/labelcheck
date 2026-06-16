# Upload-intake traps (P5-8) — debugging runbook

Five issues we hit getting the drag-and-drop TTB PDF upload working end to end. Each one was independently sufficient to make every upload fail with a useless "Review lane / extraction did not produce usable text" outcome — they had to be fixed in order, and each one masked the next. If a future contributor sees blank verdicts after dropping a PDF, work the list top to bottom.

## 1. Shell env overrides `.env.local` (the silent killer)

**Symptom**: every Anthropic call returns `401 invalid x-api-key`, no matter what's in `.env.local`. The verdict is always Review lane with "no usable text".

**Root cause**: Next.js's env loader does NOT override variables that are already set in the shell. If your `~/.zshrc` or `~/.bashrc` has any `export ANTHROPIC_API_KEY=...` line (even a placeholder like `your-key-here`), it wins over `.env.local`.

**How to detect**:
```bash
echo "shell key length: ${#ANTHROPIC_API_KEY}"
# 0 means clean — anything else means the shell is set
```

**Fix (one shell)**:
```bash
unset ANTHROPIC_API_KEY && pnpm dev
```

**Fix (permanent)**: remove the `export ANTHROPIC_API_KEY=...` line from `~/.zshrc` / `~/.bashrc`, then `source ~/.zshrc`.

## 2. `pdfjs-dist@6.x` has a `for…of readableStream` regression in the browser

**Symptom**: client-side error `undefined is not a function (near '...value of readableStream...')` when the dropzone tries to parse a PDF.

**Root cause**: `pdfjs-dist@6.0.x` uses sync `for...of` over a `ReadableStream`. Some browser combos don't expose a sync iterator on streams, and it crashes inside the worker.

**Fix**: pin to `pdfjs-dist@4.7.76`. The API is the same except `page.render` takes only `{ canvasContext, viewport }` (no `canvas` key — that's a v6 addition).

```
pnpm add pdfjs-dist@4.7.76
```

Then copy the matching worker file into `public/`:
```bash
cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

The component sets `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` from the path.

## 3. Detached `ArrayBuffer` between two pdfjs calls

**Symptom**: client error `Cannot perform Construct on a detached ArrayBuffer` when the second pdfjs call runs (text extracted OK, render fails — or vice versa).

**Root cause**: `pdfjs.getDocument({ data: buffer })` transfers the `ArrayBuffer` to the worker, detaching it from the main thread. A second `getDocument` call against the same buffer fails.

**Fix**: load the PDF **once** and do BOTH passes (text extract + label render) against the same `PDFDocumentProxy`. See `lib/intake/clientPdf.ts:processPdf()` — single function, single load, returns `{ page1Text, labelPng }`.

## 4. The label is on page 2, not page 3

**Symptom**: upload succeeds, Anthropic call succeeds, but every field comes back blank / null. Verdict lands as Review with 0% confidence.

**Root cause**: TTB Form 5100.31 structure (verified across the Public COLA Registry):

| pages | structure |
| --- | --- |
| 1     | form + label embedded together |
| 2     | page 1 = form, page 2 = label |
| 3+    | page 1 = form, page 2 = label, page 3+ = footer/instructions (mostly empty) |

The early heuristic picked page 3 for 3+ page PDFs → rendered the empty footer → Claude saw nothing.

**Fix** (`lib/intake/clientPdf.ts:pickLabelPageIndex`):
```ts
return pageCount <= 1 ? 1 : 2;
```

## 5. Claude returns `null` for unreadable fields → strict Zod schema rejects the whole response

**Symptom**: server-side error `Extraction response did not match schema (prompt v1.0.0): [... "expected": "string", "code": "invalid_type" ...]`. The orchestrator catches it and surfaces the `INTERNAL` error template "Something unexpected happened. Please try again." with `extractionFailed: true`.

**Root cause**: Claude correctly returns `null` for label fields it can't read (e.g. country of origin missing from a US-only label). The extraction response schema required every field to be a non-null string, so the whole face's extraction was rejected.

**Fix** (`lib/provider/anthropic.ts:FaceExtractionSchema`):
```ts
fields: z.record(
  FieldNameSchema,
  z.union([z.string(), z.null(), z.undefined()])
    .transform((v) => v ?? ""),
),
```

The matcher already treats `""` as "field not found" (returns `verdict: "missing"`, not a false-positive match), so coercing nulls to empty strings is safe.

## 6. Next.js dev mode HMR wipes the in-memory batch Map

**Symptom**: POST `/api/batch` returns a valid `jobId`, GET `/api/batch/<id>` returns 404 "Batch not found".

**Root cause**: the orchestrator's job store is a module-level `Map`. Next.js dev mode re-evaluates the `/api/batch/[id]/route.ts` module on first GET, creating a fresh Map instance that doesn't have the POST's job.

**Fix** (`lib/batch/store.ts`): attach the Map to `globalThis` so it survives HMR:

```ts
const globalForBatch = globalThis as unknown as {
  __labelcheckBatchJobs?: Map<string, BatchJob>;
};
const JOBS: Map<string, BatchJob> =
  globalForBatch.__labelcheckBatchJobs ?? new Map<string, BatchJob>();
globalForBatch.__labelcheckBatchJobs = JOBS;
```

In production builds the module is bundled once; this is dev-only safety.

---

## Quick verification (no UI required)

After making code changes, run this from the repo root to drive a full pipeline:

```bash
PNG_B64=$(base64 -i public/fixtures/images/abv_mismatch_001.png | tr -d '\n')
JOB=$(curl -s -X POST http://localhost:3000/api/batch \
  -H "content-type: application/json" \
  -d "{\"applications\":[{\"applicationId\":\"smoke-001\",\"beverageType\":\"distilled_spirits\",\"form\":{\"brandName\":\"OLD CEDAR\",\"classType\":\"BOURBON\",\"alcoholContent\":\"40%\",\"netContents\":\"750 ML\",\"producerName\":\"OLD CEDAR\",\"producerAddress\":\"123 ST\"},\"faces\":[{\"kind\":\"front\",\"bytes\":\"$PNG_B64\",\"mime\":\"image/png\"}]}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")
sleep 8
curl -s "http://localhost:3000/api/batch/$JOB" | python3 -c "
import sys,json
d=json.load(sys.stdin); i=d['items'][0]; r=i.get('result') or {}
print(f'lane={r.get(\"lane\")} conf={r.get(\"overallConfidence\")} fields={len(r.get(\"fields\",[]))} err={i.get(\"error\")}')"
```

Expected output: `lane=mismatch conf=0.5 fields=7 err=None`.

If the lane is `review` with `fields=0` and the error mentions extraction failing, work back through this list — odds are #1 (shell env) or #5 (null schema) regressed.
