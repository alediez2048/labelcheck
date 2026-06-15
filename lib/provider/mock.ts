/**
 * Mock vision provider — returns canned, deterministic extractions for
 * the sample application IDs.
 *
 * Lets every later ticket (matching, triage, result API, review UI) be
 * built and tested without an API key, without network, and without
 * non-determinism. The same response shape any real provider must return.
 *
 * Fixtures cover at least three signal cases the matching engine (P1-3)
 * and the triage classifier (P1-5) need to exercise:
 *   - sample-green-001              — every field matches; clean control
 *   - sample-abv-mismatch-001       — front face reads 45% ALC/VOL
 *   - sample-warning-titlecase-001  — warning present, allCaps: false
 *
 * For an unknown applicationId, returns a neutral front-face-only result
 * with no warning visible, so the triage path can still be exercised.
 */

import type { FaceKind, FieldName, WarningFlags } from "@/types";
import type {
  ExtractionRequest,
  ExtractionResponse,
  FaceExtraction,
  VisionProvider,
} from "./types";

/**
 * Canonical 27 CFR 16.21 warning. Lives in `config/` once P0-4 lands;
 * inlined here for the mock fixtures so this file is self-contained.
 */
const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

const WARNING_OK: WarningFlags = {
  presence: true,
  allCaps: true,
  boldConfident: "yes",
  legibility: "good",
};

const WARNING_TITLECASE: WarningFlags = {
  presence: true,
  allCaps: false,
  boldConfident: "uncertain",
  legibility: "good",
};

const WARNING_ABSENT: WarningFlags = {
  presence: false,
  allCaps: false,
  boldConfident: "no",
  legibility: "good",
};

/**
 * Helper — strip the warning case for the title-case fixture so the
 * extracted text reflects what would actually be on the label.
 */
const TITLECASED_WARNING = CANONICAL_WARNING.replace(
  "GOVERNMENT WARNING:",
  "Government Warning:",
);

const FIXTURES: Record<string, ExtractionResponse> = {
  // -------------------------------------------------------------------------
  // sample-green-001 — clean wine; every field matches; warning correct
  // -------------------------------------------------------------------------
  "sample-green-001": {
    faces: [
      face("front", {
        brand_name: "HARBOR MIST",
        fanciful_name: "Coastal White",
        class_type: "TABLE WINE",
        alcohol_content: "12.5% ALC/VOL",
        net_contents: "750 ML",
        country_of_origin: "USA",
      }),
      face(
        "back",
        {
          brand_name: "HARBOR MIST",
          producer_name: "HARBOR MIST CELLARS",
          producer_address: "123 VINE ST, NAPA CA",
          government_warning: CANONICAL_WARNING,
        },
        WARNING_OK,
      ),
    ],
  },

  // -------------------------------------------------------------------------
  // sample-abv-mismatch-001 — bourbon; front face reads 45% ABV
  // (the form will say 40%; matching engine catches it, not the mock)
  // -------------------------------------------------------------------------
  "sample-abv-mismatch-001": {
    faces: [
      face("front", {
        brand_name: "OLD CEDAR",
        class_type: "KENTUCKY STRAIGHT BOURBON",
        alcohol_content: "45% ALC/VOL",
        net_contents: "750 ML",
      }),
      face(
        "back",
        {
          brand_name: "OLD CEDAR",
          producer_name: "OLD CEDAR DISTILLERY",
          producer_address: "456 BARREL LN, LOUISVILLE KY",
          government_warning: CANONICAL_WARNING,
        },
        WARNING_OK,
      ),
    ],
  },

  // -------------------------------------------------------------------------
  // sample-warning-titlecase-001 — pale ale; warning heading in title case
  // -------------------------------------------------------------------------
  "sample-warning-titlecase-001": {
    faces: [
      face("front", {
        brand_name: "CEDAR RIDGE",
        fanciful_name: "Pale Ale",
        class_type: "MALT BEVERAGE",
        alcohol_content: "5.6% ALC/VOL",
        net_contents: "12 FL OZ",
      }),
      face(
        "back",
        {
          brand_name: "CEDAR RIDGE",
          producer_name: "CEDAR RIDGE BREWING CO",
          producer_address: "789 HOP LN, PORTLAND OR",
          government_warning: TITLECASED_WARNING,
        },
        WARNING_TITLECASE,
      ),
    ],
  },

  // -------------------------------------------------------------------------
  // sample-warning-missing-001 — bourbon; warning ABSENT on every face
  // (drives AC-4 — a missing warning is a real mismatch)
  // -------------------------------------------------------------------------
  "sample-warning-missing-001": {
    faces: [
      face("front", {
        brand_name: "OLD CEDAR",
        class_type: "KENTUCKY STRAIGHT BOURBON",
        alcohol_content: "40% ALC/VOL",
        net_contents: "750 ML",
      }),
      face("back", {
        brand_name: "OLD CEDAR",
        producer_name: "OLD CEDAR DISTILLERY",
        producer_address: "456 BARREL LN, LOUISVILLE KY",
      }),
    ],
  },

  // -------------------------------------------------------------------------
  // sample-fuzzy-brand-001 — wine; STONE'S THROW on the label vs Stone's
  // Throw on the form (drives AC-5 — apostrophe + case + whitespace
  // variants must still match within the fuzzy tolerance)
  // -------------------------------------------------------------------------
  "sample-fuzzy-brand-001": {
    faces: [
      face("front", {
        brand_name: "STONE'S THROW",
        class_type: "TABLE WINE",
        alcohol_content: "13% ALC/VOL",
        net_contents: "750 ML",
        country_of_origin: "USA",
      }),
      face(
        "back",
        {
          brand_name: "STONE'S THROW",
          producer_name: "STONE'S THROW VINEYARDS",
          producer_address: "9 ORCHARD WAY, PASO ROBLES CA",
          government_warning: CANONICAL_WARNING,
        },
        WARNING_OK,
      ),
    ],
  },

  // -------------------------------------------------------------------------
  // sample-unreadable-001 — front face with no usable text, low legibility
  // (drives AC-6 — the route handler short-circuits to lane=review with
  // recommendation=return_unreadable_image)
  // -------------------------------------------------------------------------
  "sample-unreadable-001": {
    faces: [
      {
        kind: "front",
        fields: {},
        warning: {
          presence: false,
          allCaps: false,
          boldConfident: "no",
          legibility: "low",
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // False-negative probes (observability.md: false-negative rate is the
  // headline safety metric). Each probe LOOKS clean on the surface but
  // carries a real defect; the pipeline MUST NOT clear it into the
  // match lane.
  // -------------------------------------------------------------------------

  // FN probe 1 — every form field aligns with the label EXCEPT the warning,
  // which is title-cased instead of ALL CAPS. The bold flag is "yes" so
  // the only signal is the case violation — easy to overlook.
  "sample-fn-probe-warning-case-001": {
    faces: [
      face("front", {
        brand_name: "RIVER BEND",
        fanciful_name: "Cabernet",
        class_type: "TABLE WINE",
        alcohol_content: "14% ALC/VOL",
        net_contents: "750 ML",
        country_of_origin: "USA",
      }),
      face(
        "back",
        {
          brand_name: "RIVER BEND",
          producer_name: "RIVER BEND WINERY",
          producer_address: "12 RIVER RD, SONOMA CA",
          government_warning: TITLECASED_WARNING,
        },
        // Same as WARNING_TITLECASE but boldConfident: "yes" so the only
        // surface defect is the title-case heading.
        {
          presence: true,
          allCaps: false,
          boldConfident: "yes",
          legibility: "good",
        },
      ),
    ],
  },

  // FN probe 2 — ABV mismatch by 0.5% (close enough to look fine on a
  // skim; the matcher requires stated-equals-stated per FR-9).
  "sample-fn-probe-abv-half-001": {
    faces: [
      face("front", {
        brand_name: "BLACK FOREST",
        class_type: "KENTUCKY STRAIGHT BOURBON",
        alcohol_content: "40.5% ALC/VOL", // form will say 40%
        net_contents: "750 ML",
      }),
      face(
        "back",
        {
          brand_name: "BLACK FOREST",
          producer_name: "BLACK FOREST DISTILLERY",
          producer_address: "33 OAK LN, LEXINGTON KY",
          government_warning: CANONICAL_WARNING,
        },
        WARNING_OK,
      ),
    ],
  },

  // FN probe 3 — single-character brand drift. Hard to spot at a glance.
  "sample-fn-probe-brand-drift-001": {
    faces: [
      face("front", {
        brand_name: "VINTAGE PEAK", // form will say VINTAGE PARK
        class_type: "TABLE WINE",
        alcohol_content: "13.5% ALC/VOL",
        net_contents: "750 ML",
        country_of_origin: "USA",
      }),
      face(
        "back",
        {
          brand_name: "VINTAGE PEAK",
          producer_name: "VINTAGE PEAK CELLARS",
          producer_address: "21 RIDGE LN, NAPA CA",
          government_warning: CANONICAL_WARNING,
        },
        WARNING_OK,
      ),
    ],
  },
};

/**
 * Build a FaceExtraction with optional warning override.
 * Defaults to WARNING_ABSENT — most labels carry the warning on the back
 * face only, so the front face reports presence:false.
 */
function face(
  kind: FaceKind,
  fields: Partial<Record<FieldName, string>>,
  warning: WarningFlags = WARNING_ABSENT,
): FaceExtraction {
  return { kind, fields, warning };
}

/**
 * Neutral fallback for unknown application IDs — a single front face with
 * the brand transcribed from the request's `applicationId` so the rest of
 * the pipeline gets a non-empty extraction to chew on.
 */
function unknownIdFallback(applicationId: string): ExtractionResponse {
  return {
    faces: [
      face("front", {
        brand_name: applicationId.toUpperCase().replace(/[-_]/g, " "),
      }),
    ],
  };
}

export class MockVisionProvider implements VisionProvider {
  readonly name = "mock";

  extract(input: ExtractionRequest): Promise<ExtractionResponse> {
    const canned = FIXTURES[input.applicationId];
    if (canned) {
      return Promise.resolve(canned);
    }
    return Promise.resolve(unknownIdFallback(input.applicationId));
  }
}
