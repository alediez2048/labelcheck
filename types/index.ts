/**
 * Public barrel for the domain types.
 *
 * Importers write `import { VerificationResult } from "@/types";` — keeping
 * the import surface narrow and stable even if `types/domain.ts` later
 * splits into per-concept files (`types/application.ts`,
 * `types/verification.ts`, `types/disposition.ts`).
 */

export type {
  Application,
  BeverageType,
  Disposition,
  DispositionRecord,
  FaceKind,
  FieldName,
  FieldResult,
  FormFields,
  LabelFace,
  Lane,
  ReturnReasonSummary,
  Role,
  Verdict,
  VerificationResult,
  WarningFlags,
} from "./domain";
