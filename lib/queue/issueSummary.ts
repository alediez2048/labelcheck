/**
 * Derives the one-line plain-language issue summary that My Queue
 * renders on each row (FR-15; mockup.md My Queue).
 *
 * The summary comes from the worst-verdict field in the latest
 * verification — NOT from a model self-report (D5). The priority is
 * mismatch > not_found > low_confidence; ties broken by the natural
 * field order so the warning surfaces above a fanciful-name nit when
 * both are wrong (FR-11/FR-12 are the highest-stakes check; the queue
 * row reflects that).
 *
 * Match-lane applications never reach the queue, so a verification
 * with every field cleared returns an empty string (the caller never
 * shows them; the route filters them out upstream).
 */

import type { FieldName, FieldResult, VerificationResult } from "@/types";

const FIELD_LABELS: Readonly<Record<FieldName, string>> = {
  brand_name: "Brand name",
  fanciful_name: "Fanciful name",
  class_type: "Class / type",
  alcohol_content: "Alcohol content",
  net_contents: "Net contents",
  producer_name: "Producer name",
  producer_address: "Producer address",
  country_of_origin: "Country of origin",
  government_warning: "Government warning",
};

const VERDICT_PRIORITY: Readonly<Record<FieldResult["verdict"], number>> = {
  mismatch: 0,
  not_found: 1,
  low_confidence: 2,
  match: 99,
};

/**
 * Pick the worst-verdict field and format it as a one-line summary the
 * queue row can render. Falls back to the verification's first `flags`
 * string when there are no per-field results (e.g. unreadable face).
 */
export function deriveIssueSummary(verification: VerificationResult): string {
  // Unreadable / degraded / structurally-empty result — the flags array
  // already carries the agent-readable sentence (FR-26b).
  if (verification.extractionFailed) {
    return verification.flags[0] ?? "Could not verify — please re-upload.";
  }

  const flaggedFields = verification.fields.filter(
    (f) => f.verdict !== "match",
  );
  if (flaggedFields.length === 0) {
    return "";
  }

  const sorted = [...flaggedFields].sort((a, b) => {
    const av = VERDICT_PRIORITY[a.verdict];
    const bv = VERDICT_PRIORITY[b.verdict];
    return av - bv;
  });

  const worst = sorted[0]!;
  return formatField(worst);
}

function formatField(f: FieldResult): string {
  const label = FIELD_LABELS[f.field] ?? f.field;
  if (f.field === "government_warning") {
    // Warning's reason is already plain language ("not present on any
    // label face", "must be ALL CAPS", ...). Surface it verbatim.
    return `${label}: ${f.reason}`;
  }
  if (f.verdict === "not_found") {
    return `${label}: not found on any face`;
  }
  if (f.verdict === "low_confidence") {
    return `${label}: reading uncertain — please verify`;
  }
  // Mismatch — the form-vs-label phrasing is the most-actionable shape.
  return `${label}: form ${quote(f.formValue)} vs label ${quote(f.extractedValue ?? "—")}`;
}

function quote(s: string): string {
  if (s.length === 0) return "(blank)";
  return s;
}
