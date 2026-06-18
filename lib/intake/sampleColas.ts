/**
 * Curated sample TTB COLA catalog for the "Try with sample TTB
 * applications" button on Operations.
 *
 * Each entry maps a publicly-fetchable PDF (served from `public/sample-colas/`)
 * to its brand + class so the menu reads as a list of real applications.
 *
 * Files were copied from `data/sample-colas/` (real TTB Public COLA
 * Registry exports). Selection criteria: maximum demo diversity —
 * three diacritic cases, a Tennessee whisky variant, a multi-image
 * label page, two whiskies, a rum, a wine, a tequila, a gin, a sake,
 * and an ale. Each one exercises a documented matcher path (see
 * docs/00-build/LABEL-MATCHING-TRAPS.md).
 */

export type SampleColaEntry = {
  id: string;
  fileName: string;
  brand: string;
  classType: string;
  /** One-line hook for the menu — what this sample exercises. */
  showcase: string;
};

export const SAMPLE_COLAS: ReadonlyArray<SampleColaEntry> = [
  {
    id: "13231001000240",
    fileName: "13231001000240.pdf",
    brand: "COTTON HOLLOW",
    classType: "BOURBON WHISKY",
    showcase: "Tennessee Bourbon Whiskey variant",
  },
  {
    id: "11322001000260",
    fileName: "11322001000260.pdf",
    brand: "HOWLING MOON",
    classType: "OTHER SPECIALTIES & PROPRIETARIES",
    showcase: "Multi-page label, image-area picker",
  },
  {
    id: "12243001000461",
    fileName: "12243001000461.pdf",
    brand: "BARENJAGER",
    classType: "OTHER SPECIALTIES & PROPRIETARIES",
    showcase: "Diacritics: Bärenjäger ↔ BARENJAGER",
  },
  {
    id: "13221001000316",
    fileName: "13221001000316.pdf",
    brand: "SAO PAULO",
    classType: "OTHER RUM",
    showcase: "Diacritics: São Paulo ↔ SAO PAULO",
  },
  {
    id: "14023001000889",
    fileName: "14023001000889.pdf",
    brand: "SORTILEGE",
    classType: "OTHER SPECIALTIES",
    showcase: "Diacritics: Sortilège ↔ SORTILEGE",
  },
  {
    id: "10363001000317",
    fileName: "10363001000317.pdf",
    brand: "LENZ MOSER",
    classType: "TABLE WHITE WINE",
    showcase: "Austrian table wine",
  },
  {
    id: "14049001000131",
    fileName: "14049001000131.pdf",
    brand: "CASAMIGOS",
    classType: "TEQUILA",
    showcase: "Tequila",
  },
  {
    id: "14051001000202",
    fileName: "14051001000202.pdf",
    brand: "MONKEY 47",
    classType: "OTHER GIN",
    showcase: "Premium gin",
  },
  {
    id: "13004001000035",
    fileName: "13004001000035.pdf",
    brand: "GEKKEIKAN",
    classType: "TABLE FLAVORED WINE",
    showcase: "Sake (table flavored wine class)",
  },
  {
    id: "13301001000314",
    fileName: "13301001000314.pdf",
    brand: "THE SUBSTANCE",
    classType: "ALE",
    showcase: "Ale (malt beverage class)",
  },
];
