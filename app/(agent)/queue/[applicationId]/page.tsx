/**
 * /queue/[applicationId] — Review detail inside the queue context
 * (P2-1; reuses the P1-8 review components).
 *
 * Loads the application's VerificationResult from the queue store
 * (no fresh extraction; the queue holds precomputed results per
 * D15). Renders the same lane banner + as-submitted + per-field +
 * disposition panel as `/verify/result`, but on disposition the
 * auto-advance walks the queue rather than returning to the input
 * page.
 *
 * Auto-advance rule: after a disposition, pick the next claimed
 * exception (the same selector My Queue uses) and navigate to its
 * detail. When no claimed work remains, return to `/queue` so the
 * caught-up state renders.
 */

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useState } from "react";

import { AsSubmittedView } from "@/app/verify/result/AsSubmittedView";
import { DispositionPanel } from "@/app/verify/result/DispositionPanel";
import { FieldTable } from "@/app/verify/result/FieldTable";
import { LaneBanner } from "@/app/verify/result/LaneBanner";
import { ReturnForCorrectionForm } from "@/app/verify/result/ReturnForCorrectionForm";
import { UnreadableBanner } from "@/app/verify/result/UnreadableBanner";
import { useQueue } from "@/lib/queue/QueueProvider";
import { selectMyQueue } from "@/lib/queue/myQueue";
import type { ReturnReasonSummary } from "@/types";

import type { SampleForm } from "@/fixtures/samples";

const AUTO_ADVANCE_MS = 800;

type ViewState =
  | { mode: "review" }
  | { mode: "returning" }
  | { mode: "done"; label: string };

/**
 * The queue store doesn't hold the raw form values today (only the
 * precomputed VerificationResult). Reconstruct a minimal SampleForm
 * shape from the field results so the AsSubmittedView can render
 * something meaningful. Production loads the real form values from
 * the schema's `application.form_fields` JSONB column (P6-2).
 */
function reconstructFormFromFields(fields: ReadonlyArray<{ field: string; formValue: string }>): SampleForm {
  const get = (name: string): string =>
    fields.find((f) => f.field === name)?.formValue ?? "";
  return {
    brandName: get("brand_name"),
    fancifulName: get("fanciful_name") || undefined,
    classType: get("class_type"),
    alcoholContent: get("alcohol_content"),
    netContents: get("net_contents"),
    producerName: get("producer_name"),
    producerAddress: get("producer_address"),
    countryOfOrigin: get("country_of_origin") || undefined,
  };
}

export default function QueueReviewDetailPage(): React.ReactElement {
  const params = useParams<{ applicationId: string }>();
  const router = useRouter();
  const { state, currentAgent, recordDisposition } = useQueue();
  const [view, setView] = useState<ViewState>({ mode: "review" });

  const application = state.applications.find(
    (a) => a.applicationId === params.applicationId,
  );

  // Auto-advance after a disposition. Compute the next claimed
  // exception against the LIVE state (selectMyQueue returns whatever
  // remains after `recordDisposition` mutated the store).
  React.useEffect(() => {
    if (view.mode !== "done") return;
    const remaining = selectMyQueue(state);
    const timer = setTimeout(() => {
      if (remaining.length === 0) {
        router.push("/queue");
      } else {
        router.push(`/queue/${remaining[0]!.application.applicationId}`);
      }
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [view, state, router]);

  if (application === undefined) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Application not in queue</h1>
        <p className="mt-2 text-sm text-slate-600">
          This application was either dispositioned or never claimed. Return to{" "}
          <Link href="/queue" className="font-semibold text-slate-900 underline">
            My Queue
          </Link>
          .
        </p>
      </main>
    );
  }

  const verification = application.verification;
  const form = reconstructFormFromFields(verification.fields);

  function handleApprove(): void {
    if (!currentAgent || !application) return;
    recordDisposition({
      applicationId: application.applicationId,
      disposition: "approve",
      agentId: currentAgent.id,
    });
    setView({ mode: "done", label: "Approved" });
  }

  function handleReturnConfirm(reason: ReturnReasonSummary): void {
    if (!currentAgent || !application) return;
    recordDisposition({
      applicationId: application.applicationId,
      disposition: "return_for_correction",
      agentId: currentAgent.id,
      returnReason: reason,
    });
    setView({ mode: "done", label: "Returned for correction" });
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm text-slate-500">
          <Link href="/queue" className="hover:underline">
            ← My Queue
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {application.brand}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Application <span className="font-mono">{application.applicationId}</span>
        </p>
      </header>

      <LaneBanner
        lane={verification.lane}
        overallConfidence={verification.overallConfidence}
      />

      {verification.extractionFailed &&
        verification.recommendation === "return_unreadable_image" && (
          <UnreadableBanner flags={verification.flags} />
        )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
        <AsSubmittedView
          applicationId={application.applicationId}
          beverageType={application.beverageType}
          form={form}
          faces={application.faces}
        />
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
              Per-field comparison. Flagged rows pair color, icon, and text.
            </p>
          </header>
          <FieldTable fields={verification.fields} />
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
          fields={verification.fields}
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
          <p className="text-base font-semibold">Recorded: {view.label}</p>
          <p className="mt-1 text-sm text-slate-600">
            Auto-advancing to the next claimed exception…
          </p>
        </section>
      )}
    </main>
  );
}
