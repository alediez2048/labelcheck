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

import type { AuditEvent, QueueAgent, QueueApplication } from "./types";

export const SEED_AGENTS: ReadonlyArray<QueueAgent> = [
  {
    id: "agent-marcus",
    name: "Marcus Lee",
    role: "agent",
    specializations: ["distilled_spirits"],
    availability: "available",
  },
  {
    id: "agent-priya",
    name: "Priya Shah",
    role: "agent",
    specializations: ["wine"],
    availability: "available",
  },
  {
    id: "agent-river",
    name: "River Patel",
    role: "agent",
    specializations: ["malt_beverage"],
    availability: "out_of_office",
  },
  {
    id: "agent-jordan",
    name: "Jordan Park",
    role: "agent",
    // Generalist (P2-4 demo): empty specializations means the routing
    // strategy goes straight to overflow for them, so any beverage
    // type can land on Jordan when no specialist is free. Keeps the
    // pool draining when a thin specialty (e.g., the only malt
    // specialist OOO) would otherwise stall.
    specializations: [],
    availability: "available",
  },
  {
    id: "admin-sasha",
    name: "Sasha Okafor",
    role: "admin",
    specializations: ["wine", "distilled_spirits", "malt_beverage"],
    availability: "available",
  },
];

export const DEFAULT_CURRENT_AGENT_ID = "agent-marcus";
export const DEFAULT_SUPERVISOR_ID = "admin-sasha";
/**
 * Rolling baseline match rate — placeholder for the `metric_rollup`
 * read in P6-2. The Operations view's delta pill is computed against
 * this. 0.70 means "historically 70% of intake clears as match"; the
 * day's match rate vs this number is the supervisor's "are we
 * keeping up" pulse signal.
 */
export const BASELINE_MATCH_RATE = 0.7;

/**
 * Seed audit log — empty for the demo. The router (P2-3) appends
 * entries here on claim, hand-assign, and reassign so the operations
 * surface can show the recent-activity strip without persistence.
 */
export const SEED_AUDIT_EVENTS: ReadonlyArray<AuditEvent> = [];

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
  // The Operations view's match-lane panel groups all four below.
  // Confidence is varied so the bottom-quartile cut is meaningful
  // (FR-23: the supervisor's spot-check signal).
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
    verifiedDurationMs: 3100,
  },
  {
    applicationId: "silver-branch-001",
    brand: "Silver Branch Gin",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "silver-branch-001",
      lane: "match",
      overallConfidence: 0.95,
      fields: [
        {
          field: "brand_name",
          formValue: "SILVER BRANCH",
          extractedValue: "SILVER BRANCH",
          verdict: "match",
          confidence: 0.95,
          reason: "Brand name matches",
          sourceFace: "front",
        },
      ],
    }),
    assignedAgentId: null,
    claimedAt: null,
    receivedAt: "2026-06-15T08:02:00Z",
    verifiedDurationMs: 3600,
  },
  {
    applicationId: "maple-hollow-cream-001",
    brand: "Maple Hollow Cream",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "maple-hollow-cream-001",
      // Cleared as match but the brand confidence is the lowest of
      // any match in the day — the bottom-quartile candidate the
      // supervisor will spot-check (FR-23). Lane stayed match
      // because nothing failed; confidence just dragged.
      lane: "match",
      overallConfidence: 0.72,
      fields: [
        {
          field: "brand_name",
          formValue: "MAPLE HOLLOW",
          extractedValue: "MAPLE HOLLOW",
          verdict: "match",
          confidence: 0.72,
          reason: "Brand name matches (lower legibility)",
          sourceFace: "front",
        },
      ],
    }),
    assignedAgentId: null,
    claimedAt: null,
    receivedAt: "2026-06-15T08:08:00Z",
    verifiedDurationMs: 4100,
  },
  {
    applicationId: "juniper-coast-001",
    brand: "Juniper Coast Gin",
    beverageType: "distilled_spirits",
    faces: PLACEHOLDER_FACES,
    verification: verification({
      applicationId: "juniper-coast-001",
      // Lane is `match` overall, but one field carries a `not_found`
      // verdict — the "soft flag in an otherwise-match application"
      // case the supervisor should glance at before bulk-confirm
      // (FR-23). Triage cleared it because the missing field is
      // optional for this beverage type; the row still surfaces in
      // the aggregate review surface as a courtesy.
      lane: "match",
      overallConfidence: 0.88,
      fields: [
        {
          field: "brand_name",
          formValue: "JUNIPER COAST",
          extractedValue: "JUNIPER COAST",
          verdict: "match",
          confidence: 0.95,
          reason: "Brand name matches",
          sourceFace: "front",
        },
        {
          field: "country_of_origin",
          formValue: "USA",
          extractedValue: null,
          verdict: "not_found",
          confidence: 0.5,
          reason: "Country of origin not found on the label (optional for domestic spirits)",
          sourceFace: null,
        },
      ],
    }),
    assignedAgentId: null,
    claimedAt: null,
    receivedAt: "2026-06-15T08:11:00Z",
    verifiedDurationMs: 2900,
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
    verifiedDurationMs: 3400,
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
    verifiedDurationMs: 3700,
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
    verifiedDurationMs: 3200,
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
    verifiedDurationMs: 4500,
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
    verifiedDurationMs: 3800,
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
    verifiedDurationMs: 3300,
  },
];
