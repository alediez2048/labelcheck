/**
 * UploadDropzone — admin file picker + drag-and-drop for KB ingestion
 * (P4-1).
 *
 * Why a dropzone AND a button: the admin mental model is "drop the
 * file here" — but keyboard users and the screen-reader path need an
 * actual `<input type="file">`. Both interactions feed the same
 * upload handler; the visual area is purely affordance.
 *
 * The component is intentionally optimistic: a successful 202 from
 * `/api/kb/upload` does NOT mean the doc is indexed, only that
 * ingestion has been kicked off. The page polls `/api/kb/sources` to
 * watch the status transition. The success notice here just confirms
 * "we accepted your file" — the source list is where progress shows.
 *
 * Errors are surfaced inline (rose) so the admin can see what went
 * wrong without losing the file they tried to upload. Network errors
 * get a generic message because the admin can do nothing about the
 * specifics; 4xx errors echo the server's reason because they're
 * actionable (wrong file type, too big).
 *
 * The `replaceModeFor` caption is the simplest "replace this source
 * with a new version" UX the prototype needs: it sets context, then
 * the existing pipeline (same filename = new version) does the rest.
 */

"use client";

import React, { useCallback, useRef, useState } from "react";

type Props = {
  uploadedBy: string;
  onUploadComplete: () => void;
  /**
   * Filename of an existing source the admin clicked "Replace" on.
   * Purely a caption — the upload still sends whatever the admin
   * picks; the server-side version bump fires on filename match.
   */
  replaceModeFor?: string | null;
  /** Called after a successful upload so the page can clear replace mode. */
  onReplaceModeCleared?: () => void;
};

const ALLOWED_EXTENSIONS = ".pdf,.docx,.md,.txt";

type UiState =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "success"; filename: string }
  | { kind: "error"; message: string };

export function UploadDropzone({
  uploadedBy,
  onUploadComplete,
  replaceModeFor,
  onReplaceModeCleared,
}: Props): React.ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setState({ kind: "uploading", filename: file.name });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploadedBy", uploadedBy);

      try {
        const res = await fetch("/api/kb/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setState({
            kind: "error",
            message: body.error ?? "Upload failed — please try again.",
          });
          return;
        }

        // Clear the native input so the same filename can be re-picked
        // (browsers suppress the change event on identical re-selection).
        if (inputRef.current) inputRef.current.value = "";
        setState({ kind: "success", filename: file.name });
        if (onReplaceModeCleared) onReplaceModeCleared();
        onUploadComplete();
      } catch {
        setState({
          kind: "error",
          message: "Could not upload — please try again.",
        });
      }
    },
    [onReplaceModeCleared, onUploadComplete, uploadedBy],
  );

  const onPickClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const uploading = state.kind === "uploading";

  return (
    <section
      aria-labelledby="kb-upload-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="kb-upload-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600"
        >
          Add a document
        </h2>
        {replaceModeFor ? (
          <p className="text-xs font-medium text-indigo-700">
            Replace mode for{" "}
            <span className="font-mono text-indigo-900">{replaceModeFor}</span>
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        PDF, DOCX, Markdown, or TXT. Max 12 MB. Re-uploading the same filename
        creates a new version and supersedes the prior one.
      </p>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={
          isDragOver
            ? "mt-3 flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-indigo-400 bg-indigo-50 p-6 text-center"
            : "mt-3 flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center"
        }
      >
        <p className="text-sm text-slate-700">
          {isDragOver
            ? "Drop to upload"
            : "Drag a file here, or pick one from your computer."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS}
          onChange={onInputChange}
          className="sr-only"
          aria-label="Choose a file to upload"
        />
        <button
          type="button"
          onClick={onPickClick}
          disabled={uploading}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-indigo-700 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {uploading ? (
            <>
              <Spinner />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">↑</span>
              <span>Choose file</span>
            </>
          )}
        </button>
      </div>

      {state.kind === "uploading" ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 text-sm text-slate-600"
        >
          <Spinner />
          <span>
            Uploading <span className="font-mono">{state.filename}</span>…
          </span>
        </p>
      ) : null}

      {state.kind === "success" ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <span aria-hidden="true" className="mt-0.5">
            ✓
          </span>
          <span>
            <span className="font-mono">{state.filename}</span> queued for
            indexing — watch the status in the list below.
          </span>
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          <span aria-hidden="true" className="mt-0.5">
            ⚠
          </span>
          <span>{state.message}</span>
        </p>
      ) : null}
    </section>
  );
}

function Spinner(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
