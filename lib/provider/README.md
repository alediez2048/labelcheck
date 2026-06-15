# `lib/provider/`

The single seam between LabelCheck and any vision model.

## Contract

One method, one shape:

```ts
type VisionProvider = {
  readonly name: string;
  extract(input: ExtractionRequest): Promise<ExtractionResponse>;
};
```

- **Input**: all faces of one Application + the field schema for that beverage type. One call per Application (D14).
- **Output**: per-face transcribed text + the structural flags on the government warning. **No verdicts, no overall confidence number.** The matching engine (P1-3) and the triage classifier (P1-5) decide; the provider transcribes (D4, D5).

The mock and every live provider must return the **same** `ExtractionResponse` shape. Sloppy optional fields in the mock will silently diverge from the live adapter in P1-2 and the in-boundary adapter in P6-1 — keep them tight.

## Selection

`getProvider()` reads `PROVIDER` from the environment.

| `PROVIDER` | Behavior | Lands in |
|---|---|---|
| unset or `mock` | `MockVisionProvider` with canned fixtures | P0-3 (this ticket) |
| `anthropic` | Claude Sonnet 4.6 (D8 default) | P1-2 |
| `azure-openai` | Azure OpenAI in Azure Government (FedRAMP High) | P6-1 |
| `olmocr` | Self-hosted olmOCR (Allen Institute, Apache 2.0, US-origin) | P6-1 |
| anything else | Throws with the list of known values | n/a |

## Why this matters

The whole production-migration story (techstack.md: Model Selection and the In-Boundary Production Path) is "swap the adapter, leave the rest." That only works if this contract stays narrow. If the matching engine grows a coupling to a specific provider's quirks, the P6-1 swap stops being a one-file change.
