# Handling Government Warning Findings

This guidance explains how the LabelCheck assistant should help agents reason about findings on the government warning panel. It is reference material for agents, not the regulatory text itself. The verbatim warning required by 27 CFR § 16.21 lives in the configuration store, not in the knowledge base — only the configuration store is consulted when comparing a label against the rule.

## When the warning is missing

A label that does not carry the warning text on any face is a real failure, not a transcription gap. Agents should not request a re-read; they should return the application with a "missing government warning" reason. The pipeline routes these uploads to the review lane with a recommendation to return for correction.

## Title-case vs all-caps headings

The regulation requires the literal heading "GOVERNMENT WARNING:" in upper case. A title-case rendering ("Government Warning:") is a finding even when the rest of the warning text matches. This is a common defect on craft labels and the pipeline flags it as a case mismatch rather than as a missing warning.

## Low-confidence bold detection

The vision pass returns a `boldConfident` flag with values `yes`, `no`, or `uncertain`. An `uncertain` value should NOT be treated as a finding on its own; it is a request for a human eye. Agents reviewing these uploads are expected to inspect the image directly and either confirm bold or escalate the upload to a senior reviewer.

## Low-legibility first passes

When the first pass returns low legibility on the warning panel, the extraction service automatically issues a targeted high-resolution re-read of that panel only. The merged response keeps the rescued text when the re-read succeeds; if the re-read also returns low legibility, the application is routed to a "needs a better image" lane rather than failed outright.

## What the assistant must not do

The assistant must never paraphrase, rephrase, or shorten the warning text in its replies. If an agent asks "what does the warning have to say about driving?" the right answer cites the configuration store entry verbatim and quotes the relevant clause. The knowledge base contains guidance about the warning; it does not contain the warning.

## Citing the knowledge base

Every assistant reply that draws on this guidance must cite the source filename and version. Traces in observability are keyed by `(source_filename, version)` so a reviewer can reconstruct exactly which version of the guidance the assistant relied on at the time of an answer.

## Updating this guidance

Re-uploading a newer version of this file bumps the version and supersedes the prior one. The prior version is not deleted; its `effective_to` timestamp is set so audits can replay the older guidance. Agents should expect occasional updates after policy reviews and after new defect patterns surface in the false-negative probe set.
