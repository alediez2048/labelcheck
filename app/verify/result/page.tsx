/**
 * /verify/result — the agent review surface (FR-14, FR-15, FR-21, FR-26).
 *
 * Client component because it reads the just-completed verification from
 * sessionStorage (the input page writes both the VerificationResult and
 * the as-submitted application there before navigating). SessionStorage
 * is scoped to the tab and cleared when the tab closes — meets NFR-4 (no
 * persistence) without threading a giant result through a URL.
 *
 * On a disposition the page records the decision in session state (no
 * persistence), clears the stored result, and auto-advances back to
 * /verify. In P2-1 that auto-advance becomes "next in queue"; the seam
 * is the same.
 */

"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import type { SampleForm } from "@/fixtures/samples";
import type {
  BeverageType,
  DispositionRecord,
  FaceKind,
  ReturnReasonSummary,
  VerificationResult,
} from "@/types";

import { AsSubmittedView } from "./AsSubmittedView";
import { DispositionPanel } from "./DispositionPanel";
import { FieldTable } from "./FieldTable";
import { LaneBanner } from "./LaneBanner";
import { ReturnForCorrectionForm } from "./ReturnForCorrectionForm";
import { UnreadableBanner } from "./UnreadableBanner";
import { RetryServiceBanner } from "./RetryServiceBanner";

const RESULT_STORAGE_KEY = "labelcheck:verification-result";
const SUBMISSION_STORAGE_KEY = "labelcheck:submitted-application";
const AUTO_ADVANCE_MS = 1500;

type Submission = {
  applicationId: string;
  beverageType: BeverageType;
  form: SampleForm;
  faces: Array<{ kind: FaceKind; previewUrl: string }>;
};

type ViewState =
  | { mode: "review" }
  | { mode: "returning" }
  | { mode: "done"; record: DispositionRecord };

export default function ResultPage(): React.ReactElement {
  const router = useRouter();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [view, setView] = useState<ViewState>({ mode: "review" });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawResult = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
    const rawSubmission = window.sessionStorage.getItem(SUBMISSION_STORAGE_KEY);
    if (rawResult) {
      try {
        setResult(JSON.parse(rawResult) as VerificationResult);
      } catch {
        // Corrupt stored result — fall back to "no result", which
        // routes the user back to /verify below.
      }
    }
    if (rawSubmission) {
      try {
        setSubmission(JSON.parse(rawSubmission) as Submission);
      } catch {
        // ignore
      }
    }
    setHydrated(true);
  }, []);

  // Auto-advance after the agent records a disposition. Clears the
  // session-scoped result so a back-button press doesn't re-render a
  // stale verification.
  useEffect(() => {
    if (view.mode !== "done") return;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(RESULT_STORAGE_KEY);
      window.sessionStorage.removeItem(SUBMISSION_STORAGE_KEY);
    }
    const t = setTimeout(() => {
      router.push("/verify");
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [view, router]);

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-slate-600">Loading…</p>
      </main>
    );
  }

  if (result === null) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">No verification on file</h1>
        <p className="mt-2 text-sm text-slate-600">
          Submit an application from the input page to see its verification result.
        </p>
        <p className="mt-4">
          <a
            href="/verify"
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            Go to input page
          </a>
        </p>
      </main>
    );
  }

  function handleApprove(): void {
    if (result === null) return;
    const record: DispositionRecord = {
      applicationId: result.applicationId,
      disposition: "approve",
      decidedAt: new Date().toISOString(),
      decidedBy: "agent",
    };
    setView({ mode: "done", record });
  }

  function handleReturnConfirm(reason: ReturnReasonSummary): void {
    if (result === null) return;
    const record: DispositionRecord = {
      applicationId: result.applicationId,
      disposition: "return_for_correction",
      returnReason: reason,
      decidedAt: new Date().toISOString(),
      decidedBy: "agent",
    };
    setView({ mode: "done", record });
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Verification result
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Application <span className="font-mono">{result.applicationId}</span>
        </p>
      </header>

      <LaneBanner
        lane={result.lane}
        overallConfidence={result.overallConfidence}
      />

      {result.extractionFailed && result.recommendation === "return_unreadable_image" && (
        <UnreadableBanner flags={result.flags} />
      )}

      {result.extractionFailed && result.recommendation === "retry_service_slow" && (
        <RetryServiceBanner flags={result.flags} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {submission && (
          <AsSubmittedView
            applicationId={result.applicationId}
            beverageType={submission.beverageType}
            form={submission.form}
            faces={submission.faces}
          />
        )}
        <section
          aria-labelledby="vs-label-heading"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <header className="mb-3 border-b border-slate-100 pb-2">
            <h2
              id="vs-label-heading"
              className="text-base font-semibold text-slate-800"
            >
              Application vs label
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Per-field comparison. Flagged rows are paired with an icon and a
              text verdict.
            </p>
          </header>
          <FieldTable fields={result.fields} />
        </section>
      </div>

      {view.mode === "review" && (
        <DispositionPanel
          disabled={false}
          onApprove={handleApprove}
          onReturn={() => setView({ mode: "returning" })}
        />
      )}

      {view.mode === "returning" && (
        <ReturnForCorrectionForm
          fields={result.fields}
          onCancel={() => setView({ mode: "review" })}
          onConfirm={handleReturnConfirm}
        />
      )}

      {view.mode === "done" && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-lg border-2 border-slate-300 bg-slate-50 px-5 py-4 text-slate-800"
        >
          <p className="text-base font-semibold">
            Recorded:{" "}
            {view.record.disposition === "approve"
              ? "Approved"
              : "Returned for correction"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Returning to the input page…
          </p>
        </section>
      )}
    </main>
  );
}
