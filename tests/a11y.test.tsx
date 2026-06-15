// @vitest-environment jsdom
/**
 * AC-9 — automated a11y sweep of the review UI (P1-8).
 *
 * Renders the three lane states the agent will see — match / mismatch /
 * review (unreadable) — through the same components the production
 * route uses, and runs jest-axe to assert zero accessibility
 * violations. The redundant manual screen-reader pass is logged in
 * `tests/MANUAL-CHECKS.md` (AC-9 has BOTH an automated and a manual
 * check).
 *
 * The components under test are leaves: LaneBanner, FieldTable,
 * AsSubmittedView, UnreadableBanner, DispositionPanel, and the
 * ReturnForCorrectionForm. The composing page (`app/verify/result/page.tsx`)
 * is client-only, depends on `next/navigation` and sessionStorage, and
 * is exercised manually + via the build. Asserting the leaves covers
 * the failure surface (text contrast, ARIA roles, label associations)
 * without dragging in Next runtime mocks.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

// jest-axe ships a custom matcher; register it with Vitest's expect.
expect.extend(toHaveNoViolations);

import { AsSubmittedView } from "@/app/verify/result/AsSubmittedView";
import { DispositionPanel } from "@/app/verify/result/DispositionPanel";
import { FieldTable } from "@/app/verify/result/FieldTable";
import { LaneBanner } from "@/app/verify/result/LaneBanner";
import { ReturnForCorrectionForm } from "@/app/verify/result/ReturnForCorrectionForm";
import { UnreadableBanner } from "@/app/verify/result/UnreadableBanner";
import type { FieldResult } from "@/types";

afterEach(() => {
  cleanup();
});

const CLEAN_FIELDS: FieldResult[] = [
  {
    field: "brand_name",
    formValue: "HARBOR MIST",
    extractedValue: "HARBOR MIST",
    verdict: "match",
    confidence: 1,
    reason: "Brand name matches",
    sourceFace: "front",
  },
  {
    field: "alcohol_content",
    formValue: "12.5%",
    extractedValue: "12.5% ALC/VOL",
    verdict: "match",
    confidence: 1,
    reason: "Alcohol content matches",
    sourceFace: "front",
  },
];

const MISMATCH_FIELDS: FieldResult[] = [
  {
    field: "brand_name",
    formValue: "OLD CEDAR",
    extractedValue: "OLD CEDAR",
    verdict: "match",
    confidence: 1,
    reason: "Brand name matches",
    sourceFace: "front",
  },
  {
    field: "alcohol_content",
    formValue: "40%",
    extractedValue: "45% ALC/VOL",
    verdict: "mismatch",
    confidence: 1,
    reason: "Alcohol content mismatch: form 40% vs label 45%",
    sourceFace: "front",
  },
];

describe("AC-9 — a11y sweep of the review UI", () => {
  it("LaneBanner — match state has no a11y violations", async () => {
    const { container } = render(
      <LaneBanner lane="match" overallConfidence={1} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("LaneBanner — mismatch state has no a11y violations", async () => {
    const { container } = render(
      <LaneBanner lane="mismatch" overallConfidence={0.8} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("LaneBanner — review state has no a11y violations", async () => {
    const { container } = render(
      <LaneBanner lane="review" overallConfidence={0.4} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("FieldTable — clean rows have no a11y violations", async () => {
    const { container } = render(<FieldTable fields={CLEAN_FIELDS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("FieldTable — mismatch rows have no a11y violations", async () => {
    const { container } = render(<FieldTable fields={MISMATCH_FIELDS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AsSubmittedView has no a11y violations", async () => {
    const { container } = render(
      <AsSubmittedView
        applicationId="sample-green-001"
        beverageType="wine"
        form={{
          brandName: "HARBOR MIST",
          classType: "TABLE WINE",
          alcoholContent: "12.5%",
          netContents: "750 ML",
          producerName: "HARBOR MIST CELLARS",
          producerAddress: "123 VINE ST, NAPA CA",
          countryOfOrigin: "USA",
        }}
        faces={[]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("UnreadableBanner has no a11y violations", async () => {
    const { container } = render(
      <UnreadableBanner flags={["Front face is unreadable — please re-upload a clearer image."]} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("DispositionPanel has no a11y violations", async () => {
    const { container } = render(
      <DispositionPanel
        disabled={false}
        onApprove={() => {}}
        onReturn={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ReturnForCorrectionForm has no a11y violations", async () => {
    const { container } = render(
      <ReturnForCorrectionForm
        fields={MISMATCH_FIELDS}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("pairs color with icon and text on the mismatch lane (NFR-2, AC-9)", () => {
    const { container } = render(
      <LaneBanner lane="mismatch" overallConfidence={0.8} />,
    );
    // The text label MUST be present in the DOM — color alone is
    // insufficient per AC-9. We assert the literal verdict word so a
    // future palette change can't silently drop the text fallback.
    expect(container.textContent).toMatch(/Mismatch/);
  });
});
