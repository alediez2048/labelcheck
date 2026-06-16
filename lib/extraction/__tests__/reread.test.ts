/**
 * Extraction service re-read tests (P3-2).
 *
 * Job-critical assertions:
 *
 *   1. A low-legibility warning on a face with `presence: true` triggers
 *      exactly ONE call to `provider.rereadWarning`.
 *   2. A first-pass response with acceptable legibility everywhere does
 *      NOT trigger a re-read.
 *   3. A re-read that returns `legibility: "good"` + non-empty text
 *      replaces the target face's `government_warning` and the
 *      face's `warning.legibility` flips to `"good"`.
 *   4. A re-read that comes back low-legibility leaves the first-pass
 *      result alone — the merge is gated on a successful second pass.
 *   5. Even when multiple faces qualify, the re-read fires at most ONCE
 *      per application (D14).
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extract, type ExtractableApplication } from "../service";
import type {
  ExtractionRequest,
  ExtractionResponse,
  VisionProvider,
  WarningRereadInput,
  WarningRereadResponse,
} from "@/lib/provider";
import * as providerModule from "@/lib/provider";

const CANONICAL =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should " +
  "not drink alcoholic beverages during pregnancy because of the risk of " +
  "birth defects. (2) Consumption of alcoholic beverages impairs your " +
  "ability to drive a car or operate machinery, and may cause health problems.";

async function jpeg(width = 600, height = 400): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Build a configurable spy provider whose `extract` returns the given
 * response and whose `rereadWarning` returns the configured reread
 * response (or omits the method entirely when omitReread is true).
 */
function buildSpyProvider(opts: {
  extractResponse: ExtractionResponse;
  rereadResponse?: WarningRereadResponse;
  omitReread?: boolean;
}): {
  provider: VisionProvider;
  extractSpy: ReturnType<typeof vi.fn>;
  rereadSpy: ReturnType<typeof vi.fn>;
} {
  const extractSpy = vi.fn(
    async (_req: ExtractionRequest): Promise<ExtractionResponse> =>
      opts.extractResponse,
  );
  const rereadSpy = vi.fn(
    async (_input: WarningRereadInput): Promise<WarningRereadResponse> =>
      opts.rereadResponse ?? {
        warningText: CANONICAL,
        legibility: "good",
        allCaps: true,
        boldConfident: "yes",
      },
  );
  const provider: VisionProvider = opts.omitReread
    ? { name: "spy-no-reread", extract: extractSpy }
    : { name: "spy-with-reread", extract: extractSpy, rereadWarning: rereadSpy };
  return { provider, extractSpy, rereadSpy };
}

describe("extraction service — targeted warning re-read (P3-2)", () => {
  const originalProvider = process.env.PROVIDER;

  beforeEach(() => {
    process.env.PROVIDER = "mock";
  });

  afterEach(() => {
    process.env.PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  it("triggers exactly one re-read when the back face warning is low-legibility", async () => {
    const { provider, rereadSpy } = buildSpyProvider({
      extractResponse: {
        faces: [
          {
            kind: "front",
            fields: { brand_name: "RIVER BEND" },
            warning: {
              presence: false,
              allCaps: false,
              boldConfident: "no",
              legibility: "good",
            },
          },
          {
            kind: "back",
            fields: { government_warning: "" },
            warning: {
              presence: true,
              allCaps: false,
              boldConfident: "uncertain",
              legibility: "low",
            },
          },
        ],
      },
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    const app: ExtractableApplication = {
      id: "reread-trigger-001",
      beverageType: "wine",
      faces: [
        { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
      ],
    };

    await extract(app);

    expect(rereadSpy).toHaveBeenCalledTimes(1);
    const callArgs = rereadSpy.mock.calls[0]?.[0] as WarningRereadInput;
    expect(callArgs.sourceFace).toBe("back");
    expect(callArgs.applicationId).toBe("reread-trigger-001");
  });

  it("does NOT trigger a re-read when every face reports good legibility", async () => {
    const { provider, rereadSpy } = buildSpyProvider({
      extractResponse: {
        faces: [
          {
            kind: "front",
            fields: { brand_name: "HARBOR MIST" },
            warning: {
              presence: false,
              allCaps: false,
              boldConfident: "no",
              legibility: "good",
            },
          },
          {
            kind: "back",
            fields: { government_warning: CANONICAL },
            warning: {
              presence: true,
              allCaps: true,
              boldConfident: "yes",
              legibility: "good",
            },
          },
        ],
      },
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    const app: ExtractableApplication = {
      id: "no-reread-001",
      beverageType: "wine",
      faces: [
        { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
      ],
    };

    await extract(app);

    expect(rereadSpy).not.toHaveBeenCalled();
  });

  it("merges the re-read transcription onto the source face when it succeeds", async () => {
    const { provider } = buildSpyProvider({
      extractResponse: {
        faces: [
          {
            kind: "back",
            fields: { government_warning: "" },
            warning: {
              presence: true,
              allCaps: false,
              boldConfident: "uncertain",
              legibility: "low",
            },
          },
        ],
      },
      rereadResponse: {
        warningText: CANONICAL,
        legibility: "good",
        allCaps: true,
        boldConfident: "yes",
      },
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    const result = await extract({
      id: "merge-001",
      beverageType: "wine",
      faces: [{ kind: "back", bytes: await jpeg(), mime: "image/jpeg" }],
    });

    const back = result.faces.find((f) => f.kind === "back");
    expect(back?.fields.government_warning).toBe(CANONICAL);
    expect(back?.warning.legibility).toBe("good");
    expect(back?.warning.allCaps).toBe(true);
    expect(back?.warning.boldConfident).toBe("yes");
  });

  it("keeps the first-pass result when the re-read also returns low legibility", async () => {
    const { provider } = buildSpyProvider({
      extractResponse: {
        faces: [
          {
            kind: "back",
            fields: { government_warning: "" },
            warning: {
              presence: true,
              allCaps: false,
              boldConfident: "uncertain",
              legibility: "low",
            },
          },
        ],
      },
      rereadResponse: {
        warningText: "",
        legibility: "low",
        allCaps: false,
        boldConfident: "no",
      },
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    const result = await extract({
      id: "merge-fails-001",
      beverageType: "wine",
      faces: [{ kind: "back", bytes: await jpeg(), mime: "image/jpeg" }],
    });

    const back = result.faces.find((f) => f.kind === "back");
    expect(back?.fields.government_warning).toBe("");
    expect(back?.warning.legibility).toBe("low");
  });

  it("fires at most one re-read even when multiple faces are low-legibility (D14)", async () => {
    const { provider, rereadSpy } = buildSpyProvider({
      extractResponse: {
        faces: [
          {
            kind: "front",
            fields: { government_warning: "" },
            warning: {
              presence: true,
              allCaps: false,
              boldConfident: "uncertain",
              legibility: "low",
            },
          },
          {
            kind: "back",
            fields: { government_warning: "" },
            warning: {
              presence: true,
              allCaps: false,
              boldConfident: "uncertain",
              legibility: "low",
            },
          },
        ],
      },
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    await extract({
      id: "one-reread-only-001",
      beverageType: "wine",
      faces: [
        { kind: "front", bytes: await jpeg(), mime: "image/jpeg" },
        { kind: "back", bytes: await jpeg(), mime: "image/jpeg" },
      ],
    });

    expect(rereadSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger a re-read when warning.presence is false even if legibility is low", async () => {
    // A face with presence:false + legibility:low is the unreadable signal,
    // NOT a warning re-read candidate. The route handler short-circuits
    // to FR-26b via `isFaceUnreadable`; the extraction service must not
    // burn a second model call on it.
    const { provider, rereadSpy } = buildSpyProvider({
      extractResponse: {
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
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    await extract({
      id: "unreadable-not-reread-001",
      beverageType: "wine",
      faces: [{ kind: "front", bytes: await jpeg(), mime: "image/jpeg" }],
    });

    expect(rereadSpy).not.toHaveBeenCalled();
  });

  it("gracefully no-ops when the provider doesn't implement rereadWarning", async () => {
    const { provider } = buildSpyProvider({
      extractResponse: {
        faces: [
          {
            kind: "back",
            fields: { government_warning: "" },
            warning: {
              presence: true,
              allCaps: false,
              boldConfident: "uncertain",
              legibility: "low",
            },
          },
        ],
      },
      omitReread: true,
    });
    vi.spyOn(providerModule, "getProvider").mockReturnValue(provider);

    const result = await extract({
      id: "no-method-001",
      beverageType: "wine",
      faces: [{ kind: "back", bytes: await jpeg(), mime: "image/jpeg" }],
    });

    // First-pass kept; service did not throw despite the missing method.
    const back = result.faces.find((f) => f.kind === "back");
    expect(back?.warning.legibility).toBe("low");
  });
});
