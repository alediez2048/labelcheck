/**
 * FaceUploader — multi-face upload with kind labels and previews (D12).
 *
 * The unit of verification is the Application, not the face (D13). This
 * component never submits on its own — it surfaces the in-memory File +
 * preview state up to the parent so the parent can pack one Application
 * submission containing all faces.
 *
 * Files live in memory only (NFR-4). Object URLs are revoked by the
 * parent when the component unmounts or a face is removed.
 */

"use client";

import React, { useRef } from "react";

import type { FaceKind } from "@/types";

type FaceState = {
  kind: FaceKind;
  previewUrl: string;
  file?: File;
  sourceUrl?: string;
};

const FACE_KIND_LABELS: Record<FaceKind, string> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
};

const ALL_KINDS: FaceKind[] = ["front", "back", "neck"];

const ACCEPTED_MIMES = "image/jpeg,image/png";

type Props = {
  faces: FaceState[];
  onChange: (next: FaceState[]) => void;
  maxFaces?: number;
};

export function FaceUploader({
  faces,
  onChange,
  maxFaces = 3,
}: Props): React.ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function nextUnusedKind(): FaceKind {
    const used = new Set(faces.map((f) => f.kind));
    return ALL_KINDS.find((k) => !used.has(k)) ?? "front";
  }

  function addFiles(files: FileList) {
    const accepted = Array.from(files).filter((f) =>
      ACCEPTED_MIMES.split(",").includes(f.type),
    );
    if (accepted.length === 0) return;
    const room = maxFaces - faces.length;
    const toAdd = accepted.slice(0, room);
    const additions = toAdd.map((file) => ({
      kind: nextUnusedKind(),
      previewUrl: URL.createObjectURL(file),
      file,
    }));
    onChange([...faces, ...additions]);
  }

  function removeFace(idx: number) {
    const removed = faces[idx];
    if (removed?.file) URL.revokeObjectURL(removed.previewUrl);
    onChange(faces.filter((_, i) => i !== idx));
  }

  function changeKind(idx: number, kind: FaceKind) {
    onChange(
      faces.map((f, i) =>
        i === idx ? { ...f, kind } : f.kind === kind ? { ...f, kind: nextUnusedKind() } : f,
      ),
    );
  }

  const canAdd = faces.length < maxFaces;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-slate-700">
        Label faces <span className="text-xs font-normal text-slate-500">(1–{maxFaces}; front, back, neck)</span>
      </legend>

      {faces.length > 0 && (
        <ul className="flex flex-col gap-2">
          {faces.map((face, i) => (
            <li
              key={`${face.kind}-${i}`}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={face.previewUrl}
                alt={`${FACE_KIND_LABELS[face.kind]} label preview`}
                className="h-20 w-20 rounded-md border border-slate-200 object-cover"
              />
              <div className="flex-1">
                <label
                  htmlFor={`face-kind-${i}`}
                  className="block text-xs font-medium text-slate-600"
                >
                  Face
                </label>
                <select
                  id={`face-kind-${i}`}
                  value={face.kind}
                  onChange={(e) => changeKind(i, e.target.value as FaceKind)}
                  className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  {ALL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FACE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {face.file
                    ? `${face.file.name} · ${formatBytes(face.file.size)}`
                    : "From sample fixture"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFace(i)}
                aria-label={`Remove ${FACE_KIND_LABELS[face.kind]} face`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_MIMES}
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white hover:file:bg-slate-800"
          />
          <p className="text-xs text-slate-500">JPEG or PNG. Up to {maxFaces - faces.length} more.</p>
        </div>
      )}
    </fieldset>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
