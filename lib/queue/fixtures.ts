/**
 * Seed data for the agent-shell queue (P2-1).
 *
 * The mockup grounds the demo in nine sample applications — clean
 * matches, mismatches, low-confidence cases. The queue fixtures here
 * mirror that set with precomputed `VerificationResult`s so the queue
 * page doesn't need to run the verification pipeline at render time
 * (D15: routing happens at intake, the agent worklist consumes).
 *
 * Match-lane fixtures are still present in the store so the selector
 * has data to filter against — they belong on the Admin Operations
 * view's "Approve all" pile (D11; mockup.md), not in My Queue.
 *
 * No PII (NFR-4): brand and producer names are synthetic. The faces
 * point at public sample images from `public/fixtures/images/`.
 */

import type { VerificationResult } from "@/types";

import type { QueueAgent, QueueApplication } from "./types";

export const SEED_AGENTS: ReadonlyArray<QueueAgent> = [
  {
    id: "agent-marcus",
    name: "Marcus Lee",
    specializations: ["distilled_spirits"],
    availability: "available",
  },
  {
    id: "agent-priya",
    name: "Priya Shah",
    specializations: ["wine"],
    availability: "available",
  },
  {
    id: "agent-river",
    name: "River Patel",
    specializations: ["malt_beverage"],
    availability: "out_of_office",
  },
];

export const DEFAULT_CURRENT_AGENT_ID = "agent-marcus";

// Build a placeholder VerificationResult with the lane outcomes the
// mockup names. The pipeline tests already prove the matcher / triage
// land the right verdicts on the same fixtures; the queue store just
// needs a typed value to render against.

function verification(opts: {
  applicationId: string;
  lane: VerificationResult["lane"];
  overallConfidence: number;
  fields: VerificationResult["fields"];
  flags?: VerificationResult["flags"];
  extractionFailed?: boolean;
  recommendation?: VerificationResult["recommendation"];
}): VerificationResult {
  return {
    applicationId: opts.applicationId,
    lane: opts.lane,
    overallConfidence: opts.overallConfidence,
    fields: opts.fields,
    warning: {
      presence: true,
      allCaps: true,
      boldConfident: "yes",
      legibility: "good",
    },
    flags: opts.flags ?? [],
    extractionFailed: opts.extractionFailed ?? false,
    ...(opts.recommendation ? { recommendation: opts.recommendation } : {}),
  };
}

const PLACEHOLDER_FACE = {
  kind: "front" as const,
  previewUrl: "/fixtures/images/none_001.png",
};

const PLACEHOLDER_FACES = [PLACEHOLDER_FACE];

export const SEED_APPLICATIONS: ReadonlyArray<QueueApplication> = [
  // ---------------------------------------------------------------------
  // Match lane — NEVER shown in My Queue (filtered by selector).
  // ---------------------------------------------------------------------
  {
    applicationId: "old-tom-001",
    brand: "Old Tom Distillery",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "old-tom-001",
      lane: "match",
      overallConfidence: 0.97,
      fields: [
        {
          field: "brand_name",
          formValue: "OLD TOM",
          extractedValue: "OLD TOM",
          verdict: "match",
          confidence: 1,
          reason: "Brand name matches",
          sourceFace: "front",
        },
      ],
    }),
    assignedAgentId: null,
    claimedAt: null,
    receivedAt: "2026-06-15T07:55:00Z",
  },
  {
    applicationId: "silver-branch-001",
    brand: "Silver Branch Gin",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "silver-branch-001",
      lane: "match",
      overallConfidence: 0.96,
      fields: [],
    }),
    assignedAgentId: null,
    claimedAt: null,
    receivedAt: "2026-06-15T08:02:00Z",
  },

  // ---------------------------------------------------------------------
  // Mismatch lane — agent's work.
  // ---------------------------------------------------------------------
  {
    applicationId: "harbor-mist-vodka-001",
    brand: "Harbor Mist Vodka",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "harbor-mist-vodka-001",
      lane: "mismatch",
      overallConfidence: 0.8,
      fields: [
        {
          field: "brand_name",
          formValue: "HARBOR MIST",
          extractedValue: "HARBOR MIST",
          verdict: "match",
          confidence: 1,
          reason: "Brand matches",
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
      ],
      flags: ["Alcohol content: form 40% vs label 45%"],
    }),
    assignedAgentId: DEFAULT_CURRENT_AGENT_ID, // already claimed by Marcus
    claimedAt: "2026-06-15T09:10:00Z",
    receivedAt: "2026-06-15T08:15:00Z",
  },
  {
    applicationId: "cedar-ridge-reserve-001",
    brand: "Cedar Ridge Reserve",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "cedar-ridge-reserve-001",
      lane: "mismatch",
      overallConfidence: 0.78,
      fields: [
        {
          field: "government_warning",
          formValue: "GOVERNMENT WARNING:",
          extractedValue: "Government Warning:",
          verdict: "mismatch",
          confidence: 1,
          reason:
            'Warning heading must read "GOVERNMENT WARNING:" in ALL CAPS (FR-11)',
          sourceFace: "back",
        },
      ],
      flags: ["Government warning heading is not ALL CAPS"],
    }),
    assignedAgentId: null, // in the shared pool
    claimedAt: null,
    receivedAt: "2026-06-15T08:25:00Z",
  },
  {
    applicationId: "coastal-pale-ale-001",
    brand: "Coastal Pale Ale",
    beverageType: "malt_beverage",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "coastal-pale-ale-001",
      lane: "mismatch",
      overallConfidence: 0.82,
      fields: [
        {
          field: "net_contents",
          formValue: "12 FL OZ",
          extractedValue: "16 FL OZ",
          verdict: "mismatch",
          confidence: 1,
          reason: "Net contents mismatch: 12 FL OZ vs 16 FL OZ",
          sourceFace: "front",
        },
      ],
      flags: ["Net contents: form 12 fl oz vs label 16 fl oz"],
    }),
    assignedAgentId: null, // in the shared pool
    claimedAt: null,
    receivedAt: "2026-06-15T08:30:00Z",
  },

  // ---------------------------------------------------------------------
  // Review lane — uncertain or near-miss.
  // ---------------------------------------------------------------------
  {
    applicationId: "pages-1907-lager-001",
    brand: "Pages 1907 Lager",
    beverageType: "malt_beverage",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "pages-1907-lager-001",
      lane: "review",
      overallConfidence: 0,
      fields: [],
      flags: ["Back face is unreadable — please re-upload a clearer image."],
      extractionFailed: true,
      recommendation: "return_unreadable_image",
    }),
    assignedAgentId: DEFAULT_CURRENT_AGENT_ID, // claimed by Marcus
    claimedAt: "2026-06-15T09:18:00Z",
    receivedAt: "2026-06-15T08:40:00Z",
  },
  {
    applicationId: "dunmore-single-malt-001",
    brand: "Dunmore Single Malt",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "dunmore-single-malt-001",
      lane: "review",
      overallConfidence: 0.55,
      fields: [
        {
          field: "brand_name",
          formValue: "Dunmore",
          extractedValue: "Dun More",
          verdict: "match",
          confidence: 0.55,
          reason: "Brand name near-miss — 'Dunmore' vs 'Dun More'",
          sourceFace: "front",
        },
      ],
      flags: ["Brand name near-miss — please verify"],
    }),
    assignedAgentId: null, // in the shared pool
    claimedAt: null,
    receivedAt: "2026-06-15T08:50:00Z",
  },

  // ---------------------------------------------------------------------
  // Mismatch held by another agent — must NOT appear in Marcus's queue.
  // ---------------------------------------------------------------------
  {
    applicationId: "vintage-park-vintners-001",
    brand: "Vintage Park Vintners",
    beverageType: "wine",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "vintage-park-vintners-001",
      lane: "mismatch",
      overallConfidence: 0.8,
      fields: [
        {
          field: "brand_name",
          formValue: "VINTAGE PARK",
          extractedValue: "VINTAGE PEAK",
          verdict: "mismatch",
          confidence: 0.9,
          reason: "Brand: form VINTAGE PARK vs label VINTAGE PEAK",
          sourceFace: "front",
        },
      ],
      flags: ["Brand name mismatch"],
    }),
    assignedAgentId: "agent-priya",
    claimedAt: "2026-06-15T09:05:00Z",
    receivedAt: "2026-06-15T08:35:00Z",
  },
];
