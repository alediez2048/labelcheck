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

import type { BeverageType, FieldResult, VerificationResult } from "@/types";

import type {
  AuditEvent,
  DispositionedApplication,
  QueueAgent,
  QueueApplication,
} from "./types";

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
 * Auditable constant for the hours-saved KPI on the Analytics dashboard.
 *
 * A pre-LabelCheck reviewer spent roughly four minutes — 240 seconds —
 * per application: download the artwork, eyeball the form, transcribe
 * values into the checklist, write the disposition. The dashboard's
 * "hours saved" calc multiplies the gap between this baseline and the
 * measured `avg_handling_seconds` by `processed`, dividing by 3600 to
 * get hours. Hardcoded as a single named number so the math is
 * auditable (you can find every consumer with one grep).
 */
export const AVG_MANUAL_HANDLING_SECONDS = 240;

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

// ---------------------------------------------------------------------------
// Historical dispositioned applications (P2-6) — eight weeks of synthetic
// history so the Analytics dashboard's volume trend, KPI cards, throughput
// chart, and top-mismatch-reasons chart have enough data to look populated.
//
// Lane mix across the 25 rows: 15 match (60%), 6 mismatch (24%), 4 review
// (16%). Disposition mix: ~17 approved (68%), ~6 needs_correction (24%),
// 2 rejected (8%). Throughput is varied across agent-marcus / agent-priya
// / agent-jordan with the supervisor approving the match-lane rows.
//
// In production this list is replaced by reads from `application` joined
// to `disposition` (plus the `metric_rollup` materialization for the
// dashboard hot paths). The shape here mirrors that join.
// ---------------------------------------------------------------------------

const HISTORICAL_FACES = PLACEHOLDER_FACES;

type HistoricalSeed = {
  applicationId: string;
  brand: string;
  beverageType: BeverageType;
  lane: VerificationResult["lane"];
  /** Which agent decided this row. Supervisor approves match lane. */
  decidedBy: string;
  /** Wall-clock day the row was received + dispositioned. */
  day: string; // YYYY-MM-DD
  receivedHHmm: string; // HH:MM (UTC)
  /** Disposition outcome. Drives `status`. */
  disposition: "approve" | "return_for_correction" | "auto_reject";
  /** For mismatch / review rows: which fields failed (drives top reasons). */
  mismatchFields?: ReadonlyArray<{
    field: FieldResult["field"];
    formValue: string;
    extractedValue: string;
    reason: string;
  }>;
  /** Seconds between receivedAt and decidedAt. Drives avg handling time. */
  handlingSeconds: number;
  verifiedDurationMs: number;
};

const HISTORICAL_SEEDS: ReadonlyArray<HistoricalSeed> = [
  // ---------- Week 1 (current week, ending 2026-06-15) ----------
  {
    applicationId: "hist-stonebridge-merlot-001",
    brand: "Stonebridge Vintners",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-06-12",
    receivedHHmm: "09:10",
    disposition: "approve",
    handlingSeconds: 90,
    verifiedDurationMs: 3100,
  },
  {
    applicationId: "hist-bluepeak-bourbon-001",
    brand: "Blue Peak Bourbon",
    beverageType: "distilled_spirits",
    lane: "mismatch",
    decidedBy: "agent-marcus",
    day: "2026-06-13",
    receivedHHmm: "11:22",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "alcohol_content",
        formValue: "40%",
        extractedValue: "43% ALC/VOL",
        reason: "Alcohol content mismatch",
      },
    ],
    handlingSeconds: 175,
    verifiedDurationMs: 3500,
  },
  {
    applicationId: "hist-tidewater-ipa-001",
    brand: "Tidewater IPA",
    beverageType: "malt_beverage",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-06-11",
    receivedHHmm: "08:42",
    disposition: "approve",
    handlingSeconds: 85,
    verifiedDurationMs: 3000,
  },
  // ---------- Week 2 (ending 2026-06-08) ----------
  {
    applicationId: "hist-glenmoor-scotch-001",
    brand: "Glenmoor Highland Scotch",
    beverageType: "distilled_spirits",
    lane: "review",
    decidedBy: "agent-marcus",
    day: "2026-06-05",
    receivedHHmm: "10:15",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "country_of_origin",
        formValue: "USA",
        extractedValue: "SCOTLAND",
        reason: "Country of origin mismatch — likely import",
      },
    ],
    handlingSeconds: 210,
    verifiedDurationMs: 4200,
  },
  {
    applicationId: "hist-riverbend-rose-001",
    brand: "Riverbend Rosé",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-06-06",
    receivedHHmm: "09:35",
    disposition: "approve",
    handlingSeconds: 95,
    verifiedDurationMs: 3300,
  },
  {
    applicationId: "hist-northwind-lager-001",
    brand: "Northwind Lager",
    beverageType: "malt_beverage",
    lane: "mismatch",
    decidedBy: "agent-jordan",
    day: "2026-06-04",
    receivedHHmm: "14:05",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "government_warning",
        formValue: "GOVERNMENT WARNING:",
        extractedValue: "Government Warning:",
        reason: "Warning heading must be ALL CAPS",
      },
    ],
    handlingSeconds: 165,
    verifiedDurationMs: 3700,
  },
  {
    applicationId: "hist-meadowlark-zin-001",
    brand: "Meadowlark Zinfandel",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-06-07",
    receivedHHmm: "11:10",
    disposition: "approve",
    handlingSeconds: 80,
    verifiedDurationMs: 2900,
  },
  // ---------- Week 3 (ending 2026-06-01) ----------
  {
    applicationId: "hist-fjordlight-aquavit-001",
    brand: "Fjordlight Aquavit",
    beverageType: "distilled_spirits",
    lane: "review",
    decidedBy: "agent-marcus",
    day: "2026-05-29",
    receivedHHmm: "12:20",
    disposition: "auto_reject",
    mismatchFields: [
      {
        field: "producer_name",
        formValue: "Fjordlight Distillers",
        extractedValue: "Fjord Light Distillers",
        reason: "Producer name near-miss — could not verify",
      },
    ],
    handlingSeconds: 240,
    verifiedDurationMs: 4500,
  },
  {
    applicationId: "hist-summit-cab-001",
    brand: "Summit Cabernet",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-30",
    receivedHHmm: "10:00",
    disposition: "approve",
    handlingSeconds: 100,
    verifiedDurationMs: 3200,
  },
  {
    applicationId: "hist-amberhill-ale-001",
    brand: "Amber Hill Ale",
    beverageType: "malt_beverage",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-28",
    receivedHHmm: "08:55",
    disposition: "approve",
    handlingSeconds: 90,
    verifiedDurationMs: 3100,
  },
  {
    applicationId: "hist-westgate-rye-001",
    brand: "Westgate Rye",
    beverageType: "distilled_spirits",
    lane: "mismatch",
    decidedBy: "agent-marcus",
    day: "2026-05-31",
    receivedHHmm: "13:40",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "net_contents",
        formValue: "750 mL",
        extractedValue: "700 mL",
        reason: "Net contents mismatch",
      },
    ],
    handlingSeconds: 180,
    verifiedDurationMs: 3600,
  },
  // ---------- Week 4 (ending 2026-05-25) ----------
  {
    applicationId: "hist-cobalt-pinot-001",
    brand: "Cobalt Pinot Noir",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-21",
    receivedHHmm: "09:20",
    disposition: "approve",
    handlingSeconds: 85,
    verifiedDurationMs: 3000,
  },
  {
    applicationId: "hist-blackpine-stout-001",
    brand: "Blackpine Stout",
    beverageType: "malt_beverage",
    lane: "mismatch",
    decidedBy: "agent-jordan",
    day: "2026-05-22",
    receivedHHmm: "11:05",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "alcohol_content",
        formValue: "5.5%",
        extractedValue: "6.2% ALC/VOL",
        reason: "Alcohol content mismatch",
      },
    ],
    handlingSeconds: 160,
    verifiedDurationMs: 3500,
  },
  {
    applicationId: "hist-orchardline-cider-001",
    brand: "Orchardline Cider",
    beverageType: "malt_beverage",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-23",
    receivedHHmm: "10:40",
    disposition: "approve",
    handlingSeconds: 95,
    verifiedDurationMs: 3300,
  },
  // ---------- Week 5 (ending 2026-05-18) ----------
  {
    applicationId: "hist-driftwood-rum-001",
    brand: "Driftwood Rum",
    beverageType: "distilled_spirits",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-14",
    receivedHHmm: "09:00",
    disposition: "approve",
    handlingSeconds: 90,
    verifiedDurationMs: 3100,
  },
  {
    applicationId: "hist-bluegrass-chard-001",
    brand: "Bluegrass Chardonnay",
    beverageType: "wine",
    lane: "review",
    decidedBy: "agent-marcus",
    day: "2026-05-15",
    receivedHHmm: "13:30",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "brand_name",
        formValue: "Bluegrass",
        extractedValue: "Blue Grass",
        reason: "Brand name near-miss",
      },
    ],
    handlingSeconds: 220,
    verifiedDurationMs: 4400,
  },
  {
    applicationId: "hist-hightide-pilsner-001",
    brand: "High Tide Pilsner",
    beverageType: "malt_beverage",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-16",
    receivedHHmm: "10:25",
    disposition: "approve",
    handlingSeconds: 85,
    verifiedDurationMs: 3000,
  },
  // ---------- Week 6 (ending 2026-05-11) ----------
  {
    applicationId: "hist-ridgepoint-syrah-001",
    brand: "Ridgepoint Syrah",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-07",
    receivedHHmm: "10:00",
    disposition: "approve",
    handlingSeconds: 90,
    verifiedDurationMs: 3100,
  },
  {
    applicationId: "hist-coppervein-gin-001",
    brand: "Coppervein Gin",
    beverageType: "distilled_spirits",
    lane: "mismatch",
    decidedBy: "agent-marcus",
    day: "2026-05-08",
    receivedHHmm: "11:50",
    disposition: "return_for_correction",
    mismatchFields: [
      {
        field: "government_warning",
        formValue: "GOVERNMENT WARNING:",
        extractedValue: "GOVT WARNING:",
        reason: "Warning heading abbreviated",
      },
    ],
    handlingSeconds: 175,
    verifiedDurationMs: 3700,
  },
  {
    applicationId: "hist-foxglen-porter-001",
    brand: "Foxglen Porter",
    beverageType: "malt_beverage",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-09",
    receivedHHmm: "09:10",
    disposition: "approve",
    handlingSeconds: 80,
    verifiedDurationMs: 2950,
  },
  // ---------- Week 7 (ending 2026-05-04) ----------
  {
    applicationId: "hist-saltmarsh-vodka-001",
    brand: "Saltmarsh Vodka",
    beverageType: "distilled_spirits",
    lane: "review",
    decidedBy: "agent-marcus",
    day: "2026-04-30",
    receivedHHmm: "14:20",
    disposition: "auto_reject",
    mismatchFields: [
      {
        field: "producer_address",
        formValue: "123 Main St, Atlanta GA",
        extractedValue: null as unknown as string, // not_found surfaced
        reason: "Producer address not visible on label",
      },
    ],
    handlingSeconds: 240,
    verifiedDurationMs: 4500,
  },
  {
    applicationId: "hist-willowfield-shiraz-001",
    brand: "Willowfield Shiraz",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-05-01",
    receivedHHmm: "10:00",
    disposition: "approve",
    handlingSeconds: 90,
    verifiedDurationMs: 3100,
  },
  // ---------- Week 8 (ending 2026-04-27) ----------
  {
    applicationId: "hist-deepcove-tequila-001",
    brand: "Deepcove Tequila",
    beverageType: "distilled_spirits",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-04-23",
    receivedHHmm: "09:30",
    disposition: "approve",
    handlingSeconds: 85,
    verifiedDurationMs: 3000,
  },
  {
    applicationId: "hist-sundown-lager-001",
    brand: "Sundown Lager",
    beverageType: "malt_beverage",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-04-24",
    receivedHHmm: "11:00",
    disposition: "approve",
    handlingSeconds: 90,
    verifiedDurationMs: 3200,
  },
  {
    applicationId: "hist-pearlridge-prosecco-001",
    brand: "Pearlridge Prosecco",
    beverageType: "wine",
    lane: "match",
    decidedBy: DEFAULT_SUPERVISOR_ID,
    day: "2026-04-25",
    receivedHHmm: "10:15",
    disposition: "approve",
    handlingSeconds: 95,
    verifiedDurationMs: 3300,
  },
];

function buildHistoricalApplication(
  seed: HistoricalSeed,
): DispositionedApplication {
  const receivedAt = `${seed.day}T${seed.receivedHHmm}:00Z`;
  const receivedMs = Date.parse(receivedAt);
  const decidedAt = new Date(
    receivedMs + seed.handlingSeconds * 1000,
  ).toISOString();
  // Claimed a minute or so before disposition for exception lanes.
  const claimedAt =
    seed.lane === "match"
      ? null
      : new Date(receivedMs + (seed.handlingSeconds - 60) * 1000).toISOString();
  const assignedAgentId =
    seed.lane === "match" ? null : seed.decidedBy;

  const fields: FieldResult[] = (seed.mismatchFields ?? []).map((mf) => ({
    field: mf.field,
    formValue: mf.formValue,
    extractedValue: mf.extractedValue,
    verdict:
      mf.extractedValue === null
        ? "not_found"
        : seed.lane === "review"
          ? "low_confidence"
          : "mismatch",
    confidence:
      seed.lane === "review"
        ? 0.55
        : mf.extractedValue === null
          ? 0.5
          : 1,
    reason: mf.reason,
    sourceFace: "front",
  }));

  const overallConfidence =
    seed.lane === "match" ? 0.95 : seed.lane === "mismatch" ? 0.8 : 0.55;

  const status: DispositionedApplication["status"] =
    seed.disposition === "approve"
      ? "approved"
      : seed.disposition === "return_for_correction"
        ? "needs_correction"
        : "rejected";

  // For auto-reject scenarios there is no Disposition (rejections are
  // system-generated when the correction window lapses). We still need a
  // DispositionRecord on the row so the historical join is uniform —
  // model it as a `return_for_correction` decision (the original disp)
  // that later auto-rejected. The `status` field carries the terminal
  // truth; consumers should read `status`, not derive from disposition.
  const dispositionAction =
    seed.disposition === "auto_reject"
      ? "return_for_correction"
      : seed.disposition;

  return {
    applicationId: seed.applicationId,
    brand: seed.brand,
    beverageType: seed.beverageType,
    faces: HISTORICAL_FACES,
    verification: verification({
      applicationId: seed.applicationId,
      lane: seed.lane,
      overallConfidence,
      fields,
      flags: seed.mismatchFields?.map((m) => m.reason) ?? [],
    }),
    assignedAgentId,
    claimedAt,
    receivedAt,
    verifiedDurationMs: seed.verifiedDurationMs,
    disposition: {
      applicationId: seed.applicationId,
      disposition: dispositionAction,
      decidedAt,
      decidedBy: seed.decidedBy,
    },
    status,
  };
}

export const SEED_DISPOSITIONED_APPLICATIONS: ReadonlyArray<DispositionedApplication> =
  HISTORICAL_SEEDS.map(buildHistoricalApplication);
