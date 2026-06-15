/**
 * /verify — the application input page (P1-1).
 *
 * Server component: loads the per-beverage-type required-field lists from
 * `config/fields-by-type.json` once at render and passes them to the
 * client `InputForm` so the form rendering is driven by config (FR-25)
 * rather than hardcoded.
 */

import { getRequiredFields, type ConfigFieldKey } from "@/lib/config";
import type { BeverageType } from "@/types";

import { SAMPLES } from "@/fixtures/samples";

import { InputForm } from "./InputForm";

export const dynamic = "force-dynamic";

export default function VerifyPage(): React.ReactElement {
  const fieldsByType: Record<BeverageType, readonly ConfigFieldKey[]> = {
    wine: getRequiredFields("wine"),
    distilled_spirits: getRequiredFields("distilled_spirits"),
    malt_beverage: getRequiredFields("malt_beverage"),
  };
  return <InputForm fieldsByType={fieldsByType} samples={SAMPLES} />;
}
