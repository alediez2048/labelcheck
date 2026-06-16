/**
 * In-memory + file-backed `KnowledgeBaseStore` — the prototype seam.
 *
 * Why both layers:
 *   - In-memory: cosine search and `listCurrentChunks` need to be cheap.
 *     For a prototype-sized corpus brute-force dot products over a
 *     `KnowledgeBaseChunk[]` is fine (P4-2 consumes this).
 *   - File-backed: the dev loop restarts the process constantly; without
 *     persistence every page refresh would re-index. One JSON file per
 *     source under `.data/kb/<filename>.json`. The directory is
 *     gitignored.
 *
 * NFR-4 caveat: KB content is admin-uploaded reference material, NOT
 * applicant PII, so it is allowed in the local file-backed store. If a
 * future change ever lets applicant data flow through here, that policy
 * has to be revisited before this file does.
 *
 * Production swap: `KnowledgeBaseStore` is the seam. The pgvector path
 * implements the same interface with the same column shape (schema.md
 * `knowledge_base`). `listCurrentChunks` becomes `WHERE effective_to IS
 * NULL`; `searchByEmbedding` (in `./search.ts`) becomes `ORDER BY
 * embedding <=> $1 LIMIT k`.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  KnowledgeBaseChunk,
  KnowledgeBaseSource,
  KnowledgeBaseStore,
} from "@/types/kb";

/**
 * Per-source persisted shape. We keep every historical version so an
 * admin can audit what the assistant was citing at a given time.
 *
 * `source` is the LATEST (highest-version) row; `history` is every
 * prior version row (already-superseded, each with `effectiveTo` set).
 * `chunks` is a flat array across ALL versions for this filename; the
 * caller filters by `version` when needed.
 */
type PersistedSource = {
  source: KnowledgeBaseSource;
  history: KnowledgeBaseSource[];
  chunks: KnowledgeBaseChunk[];
};

/**
 * Resolve the data directory from env so tests can point it at a tmpdir
 * without monkey-patching `fs`. Defaults to `.data/kb/` at the repo root.
 *
 * Resolved lazily (per call) rather than at module load so tests can
 * set `KB_DATA_DIR` before importing this module's consumers without
 * having to reset module cache between test files.
 */
function dataDir(): string {
  return resolve(process.env.KB_DATA_DIR ?? ".data/kb");
}

/**
 * Module-level state. Two maps keyed by filename:
 *   - sources: every version of every source filename, with the
 *              highest-version row at the end of each array.
 *   - chunks:  every chunk across every version of every source.
 */
const sourcesByFilename = new Map<string, KnowledgeBaseSource[]>();
const chunksByFilename = new Map<string, KnowledgeBaseChunk[]>();

let hydrated = false;

/**
 * First-touch hydration. Reads every `<filename>.json` under the data
 * dir and rebuilds the in-memory maps. Idempotent: subsequent calls are
 * no-ops once `hydrated` is set.
 *
 * If the directory is missing, create it and exit early. Files that
 * fail to parse are skipped with a console.warn — one corrupt file
 * shouldn't take down the whole store.
 */
function hydrate(): void {
  if (hydrated) {
    return;
  }
  const dir = dataDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory creation failure is unrecoverable from the store's POV;
    // re-attempt on next mutation rather than throwing on import.
    hydrated = true;
    return;
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    hydrated = true;
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    try {
      const raw = readFileSync(join(dir, entry), "utf8");
      const parsed = JSON.parse(raw) as PersistedSource;
      const filename = parsed.source.sourceFilename;
      const all = [...parsed.history, parsed.source].sort(
        (a, b) => a.version - b.version,
      );
      sourcesByFilename.set(filename, all);
      chunksByFilename.set(filename, parsed.chunks);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[kb/store] skipping corrupt file ${entry}: ${String(err)}`);
    }
  }
  hydrated = true;
}

/**
 * Persist a single source's state to disk. Called on every mutation
 * touching that filename. The write is synchronous and replaces the
 * whole file (no partial writes) so the on-disk shape always matches
 * an in-memory snapshot.
 */
function persist(filename: string): void {
  const versions = sourcesByFilename.get(filename) ?? [];
  if (versions.length === 0) {
    return;
  }
  const dir = dataDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Can't write — surface to the caller via a thrown writeFile error.
  }
  const latest = versions[versions.length - 1];
  if (!latest) {
    return;
  }
  const history = versions.slice(0, -1);
  const chunks = chunksByFilename.get(filename) ?? [];
  const payload: PersistedSource = {
    source: latest,
    history,
    chunks,
  };
  writeFileSync(join(dir, `${filename}.json`), JSON.stringify(payload, null, 2));
}

/**
 * Replace-or-append a source row in the per-filename version array.
 * "Same version" upserts (e.g. status transitions queued → indexing →
 * ready) overwrite in place; a new version appends.
 */
function upsertSourceInternal(source: KnowledgeBaseSource): void {
  const filename = source.sourceFilename;
  const existing = sourcesByFilename.get(filename) ?? [];
  const idx = existing.findIndex((row) => row.version === source.version);
  if (idx === -1) {
    existing.push(source);
  } else {
    existing[idx] = source;
  }
  existing.sort((a, b) => a.version - b.version);
  sourcesByFilename.set(filename, existing);
}

/**
 * Replace-or-append a chunk by (filename, version, id). New chunks
 * append; re-upserts of the same id replace in place.
 */
function upsertChunksInternal(chunks: ReadonlyArray<KnowledgeBaseChunk>): void {
  for (const chunk of chunks) {
    const filename = chunk.sourceFilename;
    const existing = chunksByFilename.get(filename) ?? [];
    const idx = existing.findIndex(
      (row) => row.id === chunk.id && row.version === chunk.version,
    );
    if (idx === -1) {
      existing.push(chunk);
    } else {
      existing[idx] = chunk;
    }
    chunksByFilename.set(filename, existing);
  }
}

const store: KnowledgeBaseStore = {
  upsertSource(source) {
    hydrate();
    upsertSourceInternal(source);
    persist(source.sourceFilename);
  },

  upsertChunks(chunks) {
    hydrate();
    if (chunks.length === 0) {
      return;
    }
    upsertChunksInternal(chunks);
    const touched = new Set<string>();
    for (const c of chunks) {
      touched.add(c.sourceFilename);
    }
    for (const filename of touched) {
      persist(filename);
    }
  },

  listSources() {
    hydrate();
    // The UI lists the LATEST row per filename. History stays internal
    // and is only reachable through `listChunks(filename, version)`.
    const out: KnowledgeBaseSource[] = [];
    for (const versions of sourcesByFilename.values()) {
      const latest = versions[versions.length - 1];
      if (latest) {
        out.push(latest);
      }
    }
    // Stable order by filename so the UI doesn't flicker between polls.
    return out.sort((a, b) => a.sourceFilename.localeCompare(b.sourceFilename));
  },

  getSource(filename) {
    hydrate();
    const versions = sourcesByFilename.get(filename);
    if (!versions || versions.length === 0) {
      return null;
    }
    return versions[versions.length - 1] ?? null;
  },

  listChunks(filename, version) {
    hydrate();
    const all = chunksByFilename.get(filename) ?? [];
    if (version === undefined) {
      return [...all];
    }
    return all.filter((c) => c.version === version);
  },

  listCurrentChunks() {
    hydrate();
    // "Current" = chunk's effectiveTo is undefined. A superseded source
    // marks both the source row AND every chunk for that version with
    // effectiveTo, so a single check on the chunk is sufficient.
    const out: KnowledgeBaseChunk[] = [];
    for (const chunks of chunksByFilename.values()) {
      for (const c of chunks) {
        if (c.effectiveTo === undefined) {
          out.push(c);
        }
      }
    }
    return out;
  },

  supersedeSource(filename, version, supersededAt) {
    hydrate();
    const versions = sourcesByFilename.get(filename);
    if (!versions) {
      return;
    }
    let changed = false;
    for (const row of versions) {
      if (row.version === version && row.effectiveTo === undefined) {
        row.effectiveTo = supersededAt;
        changed = true;
      }
    }
    const chunks = chunksByFilename.get(filename) ?? [];
    for (const c of chunks) {
      if (c.version === version && c.effectiveTo === undefined) {
        c.effectiveTo = supersededAt;
        changed = true;
      }
    }
    if (changed) {
      persist(filename);
    }
  },
};

/**
 * Singleton accessor — matches the `getProvider()` pattern from
 * `lib/provider/`. There is intentionally only ever one store per
 * process; the file-backed layer is the cross-process shared state.
 */
export function getStore(): KnowledgeBaseStore {
  return store;
}

/**
 * Module-level convenience wrappers — the upload route imports these
 * directly (the contract the UI agent codes against). They delegate to
 * the singleton.
 */
export function listSources(): KnowledgeBaseSource[] {
  return store.listSources();
}

export function getSource(filename: string): KnowledgeBaseSource | null {
  return store.getSource(filename);
}

/**
 * Test-only — clear in-memory state and force a re-hydrate on the next
 * call. Not exported through any barrel; tests import directly.
 *
 * The file-backed state on disk is NOT touched: tests that want a clean
 * disk should set `KB_DATA_DIR` to a fresh tmpdir, which is the
 * recommended pattern.
 */
export function __resetStoreForTests(): void {
  sourcesByFilename.clear();
  chunksByFilename.clear();
  hydrated = false;
}
