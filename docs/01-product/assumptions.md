# Project Assumptions: AI-Powered Alcohol Label Verification

Status: living document
Owner: solo developer
Last updated: 2026-06-10

This file records every assumption the project rests on, so that none of them are silently treated as fact. Each entry states the assumption, why we are making it, and whether it still needs validation. Where an assumption came from outside the provided interview notes, that is called out, because the discovery interviews and external TTB documentation are not the same source and should not be conflated.

Confidence key:
- Solid: directly supported by the brief or interviews.
- Reasonable: a sensible default, low risk if wrong.
- To validate: could be wrong and would change the design if so.

## Input and Data

A1. The agent already has the application as structured form values, and the label as a separate image file.
Why: Sarah describes an agent who "pulls up an application, looks at the label artwork, and checks that what's on the label matches what's in the application." That implies typed fields on one side and an image on the other.
Confidence: Reasonable. The interviews imply digital handling but never state it outright.

A2. We do not OCR or parse the application form itself. Only the label image is read by AI.
Why: In a digital COLAs Online record the form fields are already structured text. The form half can be treated as trusted input.
Confidence: Reasonable, dependent on A1.

A3. We do not handle scanned paper applications.
Why: Paper filing still exists at TTB, but the interviews center on the digital system, and handling scanned forms would add a second OCR problem with no stated demand.
Confidence: To validate. The brief does not confirm the digital-versus-paper split; the "mostly digital" framing came from external TTB documentation, not the interviews.

A4. The form values are trusted as entered. The prototype lets the user type them (or pre-fills them) to stand in for a COLAs Online record.
Why: There is no system of record to read from, and we were told not to integrate with COLA.
Confidence: Solid for prototype scope.

A5. Superseded by grill decision D12 (systemsdesign.md). The prototype now supports multiple label images per application (front, back, neck), with a field satisfied if found on any face and the government warning checked across all faces. The original simplification (one image per verification) was dropped because a front-label-only check would systematically false-flag the warning, which usually sits on the back label.
Confidence: Solid as a corrected decision.

## Scope

A6. This is a standalone proof-of-concept with no integration to COLA or any system of record.
Why: Marcus stated this directly.
Confidence: Solid.

A7. No authentication, SSO, or user roles in the prototype.
Why: Out of scope for a POC; adds compliance surface with no demo value.
Confidence: Solid.

A8. No persistence of applicant PII. Images and form values are processed in memory and not stored.
Why: IT said nothing sensitive is stored for this exercise.
Confidence: Solid.

A9. The prototype targets the common TTB field set: brand name, class/type, alcohol content, net contents, bottler/producer name and address, country of origin for imports, and the government health warning.
Why: These are the elements named in the brief as common across beverage types.
Confidence: Solid.

A10. Beverage-type-specific rules are simplified. The prototype may demonstrate primarily on distilled spirits, using the provided Old Tom Distillery sample as the reference case.
Why: Wine, beer, and spirits each have different mandatory fields and exceptions. Full per-type rule coverage is more than a one-week prototype needs.
Confidence: Reasonable.

## AI and Technical Approach

A11. The prototype uses an external hosted vision model (multimodal LLM) to read the label.
Why: Fastest path to robust extraction that also tolerates imperfect images, within a one-week solo build.
Confidence: Solid for prototype, with a known production caveat (see A21).

A12. One model call per application (all label faces attached, per D14) is enough to extract all fields and meet the 5-second latency budget.
Why: Multi-pass pipelines risk blowing the hard 5-second requirement that sank the prior vendor.
Confidence: To validate. Needs a real latency measurement early in the build, especially since full-resolution multi-face calls carry more image tokens (D7).

A13. The vision model can read moderately imperfect images (mild angle, glare, lighting) well enough to be useful.
Why: Jenny asked for this, and modern multimodal models handle it reasonably. Severe cases still fall back to "request a better image."
Confidence: To validate.

A14. Refined by grill decision D6 (systemsdesign.md). All-caps and verbatim wording are reliably verifiable from transcribed text and are checked strictly in code. Bold is not reliably detectable from a single photo, so it is treated as a best-effort model flag: when bold is not confidently confirmed, the result is routed to the ambiguous lane for a human glance rather than auto-passing or auto-rejecting. The styling judgment never makes a regulatory decision on its own.
Confidence: Resolved. The risk is contained by routing uncertainty to a human rather than relying on the bold read.

## Matching Logic

A15. Matching rules are per field, not one global rule.
Why: Dave's "STONE'S THROW vs Stone's Throw" shows brand and type need fuzzy, judgment-style matching, while the warning must be exact.
Confidence: Solid.

A16. Brand name and class/type matching is case-insensitive and tolerant of punctuation, spacing, and capitalization differences, while still flagging genuine differences.
Why: The same product should not be flagged over cosmetic formatting.
Confidence: Solid in principle, with tuning required.

A17. The government health warning is verified exactly against a configured canonical text, including the all-caps and bold treatment of "GOVERNMENT WARNING:".
Why: Jenny's account and the statutory nature of the warning. Title case instead of all caps is a rejection.
Confidence: Solid.

A18. The canonical government warning text is loaded from configuration, sourced from the governing regulation, not hard-coded inline.
Why: It must be auditable and updatable by a compliance reviewer. The exact statutory wording still needs to be pulled and pinned.
Confidence: To validate. We have not yet inserted the verbatim regulatory text.

A19. Alcohol content is matched as stated-equals-stated for the prototype. Real TTB tolerance allowances (which vary by beverage type) are noted but not implemented.
Why: Implementing the full tolerance tables is more than the prototype needs, but pretending tolerances do not exist would be wrong, so the limitation is documented.
Confidence: Reasonable, with a known simplification.

A20. Match tolerances and rules are configurable rather than buried in code.
Why: Maintainability and compliance review, consistent with the constraints doc.
Confidence: Solid.

## Compliance and Production Path

A21. A production deployment likely cannot call a public vision API, because the agency firewall blocks outbound traffic to external ML endpoints, which is what broke the prior vendor pilot. Production would need an in-boundary model on Azure within the FedRAMP boundary.
Why: Marcus described the firewall and the failed pilot directly.
Confidence: Solid as a risk; the exact production solution is out of scope.

A22. The tool performs the verification and triages applications by confidence so that agents review exceptions rather than every application. The human remains accountable for the final approval, but their effort shifts from verifying every match by eye to resolving flagged and low-confidence cases. Whether high-confidence matches auto-clear without a human glance, or require a lightweight bulk confirmation, is an agency policy decision the tool is designed to support either way.
Why: The value is in removing the verification grind, not the approval act. Sarah's team is "drowning in routine stuff," so the tool clears the obvious matches and concentrates agent attention on real problems. A human stays accountable because the agency carries legal liability for approvals, and because Dave's "STONE'S THROW vs Stone's Throw" judgment cases are exactly where a person outperforms a threshold. See the Review Model principle in constraints.md.
Confidence: Solid on the triage value; the auto-clear-versus-bulk-confirm setting is an agency policy dial, not a fixed assumption.

A23. The prototype runs outside the agency network, so its own use of an external API is acceptable for the demo even though production could not.
Why: It is a standalone POC on independent hosting.
Confidence: Solid.

## Test Data

A24. Positive (should-pass) test cases come from the Public COLA Registry, since every approved application already has a matching form and label.
Why: Approved equals matching, by definition.
Confidence: Solid.

A25. Negative (should-flag) test cases are synthesized, either by perturbing form values against a real label, or by generating labels with planted defects such as a wrong ABV, a title-case warning, or a missing warning.
Why: The registry contains no failures, so failure cases must be manufactured with known correct answers.
Confidence: Solid.

A26. AI-generated label images are acceptable as test inputs.
Why: The brief explicitly encourages creating test labels with AI image tools.
Confidence: Solid.

## Requirements Interpretation

A27. The roughly 5-second per-application response time is a hard acceptance criterion, not a nice-to-have.
Why: Sarah was emphatic, and the prior 30-to-40-second vendor was abandoned for exactly this.
Confidence: Solid.

A28. The primary users have low technology comfort, so accessibility and obviousness are first-class requirements, not polish.
Why: Half the team is over 50, Dave prints his emails, the stated benchmark is a 73-year-old first-time video caller.
Confidence: Solid.

A29. Batch upload is the highest-value stretch feature.
Why: Raised independently by Sarah and by Janet in Seattle, tied to 200-to-300-label peak-season dumps.
Confidence: Solid.

## Business and Scale

A30. Production load is low sustained throughput with bursty peaks, not high QPS. Under one request per second sustained even with all 47 agents, with batch dumps as the real stress event.
Why: Derived from 150,000 applications per year across 47 agents.
Confidence: Reasonable, arithmetic from stated figures.

A31. The monthly budget ceiling is approximately $25 for the prototype.
Why: The stakeholder did not give a number; this is a placeholder chosen to keep spend near zero.
Confidence: To validate. Explicitly an unconfirmed assumption.
