# Alcohol Label Verification

The shared language for this project: an AI tool that helps a TTB compliance agent verify that a label's artwork matches the claims in its application. This file is a glossary only. It holds no implementation details, decisions, or specs. Those live in the other docs.

## Language

### Domain entities

**Application**:
A single submission to TTB for label approval, made of one Form plus one or more Label faces. This is the unit of Verification. TTB reviews about 150,000 of these a year.
_Avoid_: label (when you mean the whole submission), COLA (that is the approved certificate, not the submission), filing.

**Form**:
The structured, typed claims in an application: brand name, class/type, alcohol content, net contents, bottler/producer name and address, country of origin. The applicant's assertions, to be checked against the artwork.
_Avoid_: application (the form is only one part of it), metadata.

**Label face**:
One physical face of the product label, for example the front, back, or neck. An application carries one or more. The Government Warning usually lives on the back face.
_Avoid_: label (ambiguous), side, panel.

**Label**:
Loose shorthand for the artwork across all of an application's label faces. Use "label face" whenever precision matters.
_Avoid_: using "label" to mean the whole Application.

**COLA**:
Certificate of Label Approval, the approved result. An Application becomes a COLA once TTB approves it. The Public COLA Registry holds approved COLAs.
_Avoid_: using COLA to mean the Application under review or the Form.

**Field**:
One verifiable data point present on both the Form and the Label, such as brand name or alcohol content.
_Avoid_: attribute, property.

**Government Warning**:
The mandatory health warning statement that must appear on the label, verified verbatim against canonical text, with "GOVERNMENT WARNING:" in all capitals and bold. The highest-stakes Field.
_Avoid_: disclaimer, surgeon general's warning (it is the government warning), notice.

### Process and decisions

**Verification**:
The act of comparing an Application's label faces against its Form, producing a Verdict per Field and assigning one Lane. The model reads; the code decides.
_Avoid_: scan, check, OCR (those name parts, not the whole act).

**Verdict**:
The per-Field outcome of Verification: match, mismatch, not found, or low confidence.
_Avoid_: result (too broad), score.

**Lane**:
The triage outcome assigned to a whole Application, one of three: high-confidence match, clear mismatch, or low-confidence or ambiguous. The agent reviews the mismatch and ambiguous lanes and skims the match lane.
_Avoid_: status, bucket, category, tier.

**Bulk confirm**:
The single action by which a supervisor approves the entire high-confidence-match Lane at once. The default way matches are cleared. The action is preceded by an aggregate review surface (count, bottom-quartile-confidence matches surfaced inline and tap-expandable, any field flagged within a match, deltas vs. baseline match rate). The supervisor's "glance" is at the aggregate, not per-application; this is what distinguishes Bulk confirm from Auto-clear.
_Avoid_: approve all (loosely), batch approve.

**Auto-clear**:
An optional agency policy, off by default, in which high-confidence matches are approved without a human glance. A configuration dial, distinct from Bulk confirm (which still has a human in the loop).
_Avoid_: auto-approve (acceptable, but prefer auto-clear for the configurable dial).

**Work pool**:
The single prioritized queue of exception applications (mismatch and review lanes) waiting for an agent. The match lane does not enter the pool; it is bulk-confirmed. Routing covers only the pool.
_Avoid_: backlog, inbox (an agent's claimed items are their queue, distinct from the shared pool).

**Claim**:
The act of an agent pulling the next item from the Work pool, which assigns it to them (sets assigned_agent_id and claimed_at). A supervisor can also hand-assign.
_Avoid_: assign (reserve for the supervisor override), grab, take.

**Availability**:
An agent's routing eligibility, available or out of office, set from their Profile. An out-of-office agent is not sent new exceptions from the Work pool and their claimed items may be reassigned. Distinct from account active/inactive.
_Avoid_: status (that names an application's state), online.

**Specialization**:
The beverage type or types an agent handles (wine, distilled spirits, malt beverage), assigned by an admin in the Team view. The router matches an application's beverage type to a specialist, so specialized teams work only their label types, with overflow to any available agent to prevent backlog.
_Avoid_: skill, category, team (a team is the organizational grouping; specialization is the routing key).

**Admin**:
The role (a division supervisor) that sees the global shell (Operations, All Applications, Analytics, Team) and the admin-only actions (bulk-confirm the match lane, distribute, reassign). The Agent role sees only their own shell (My Queue, My Stats, Profile). Two effective roles for now.
_Avoid_: manager, owner.

**Assistant**:
The read-only chat helper at the bottom right. It answers questions, onboards, and summarizes the user's own role-scoped numbers, grounded in help content and data. It never decides, disposes, or changes records, and it is a distinct AI component from Verification (see observability.md).
_Avoid_: bot, agent (Agent is the human role), copilot.

**Knowledge base**:
The curated, versioned set of documents the Assistant retrieves from, populated by admins uploading files in the Knowledge Base tab. The assistant can cite only what is in it. Distinct from the Configuration store (which holds the verification rules and warning text).
_Avoid_: knowledge graph (it is a retrieval corpus, not a graph), docs, corpus.

**Disposition**:
The human decision on an Application: Approve or Return for correction. Whole-application only — never per-face, never per-field. The decision applies to all faces and the form as a unit. Rejection is not a manual decision; it happens automatically when a returned application's 30-day window lapses. Distinct from a Lane (the AI's automatic triage call). The clean match lane is approved by a supervisor in bulk; specialist agents decide only on the exception lanes routed to them.
_Avoid_: outcome (too vague), status (a status is the result of a disposition, not the decision), reject (it is not a manual disposition), partial approval.

**Resubmission**:
A new Application linked to a returned-for-correction parent via parent_application_id. Verification re-runs end to end on all faces and the form; the prior verification is not reused. The resubmission inherits queue priority from its parent's correction_cycle (schema.md).
_Avoid_: revision, retry, update (the prior application is closed; the resubmission is a new record).

**Needs Correction**:
The status of an application the agent returned to the applicant for fixes, with a 30-day window. A corrected resubmission gets queue priority; if not fixed in 30 days it auto-rejects. This is the usual response to a genuine mismatch, not an outright Reject.
_Avoid_: resubmission, rework, soft reject.

**Agent**:
The TTB compliance reviewer who uses the tool and owns the final disposition.
_Avoid_: user, reviewer, examiner, operator.

## Flagged ambiguities

- **Label vs Application** (resolved): the Application is the unit of Verification; a Label face is a single face. The 150,000/year figure counts Applications, not faces. Cost is reckoned per image, so an Application's cost is its number of label faces times the per-image cost.
- **COLA vs Application** (resolved): an Application is the submission under review; a COLA is the approved certificate it becomes. They are different stages of the same thing.
- **Lane vs Disposition** (resolved): a Lane is the AI's automatic triage call (match, mismatch, review); a Disposition is the human decision (approve or return for correction). The tool assigns the lane; the human owns the disposition. Neither is a Verdict, which is reserved for the per-field comparison result.

## Example dialogue

Agent: "This application came back in the clear-mismatch lane."
Tool designer: "Which field?"
Agent: "Alcohol content. The form says 40 percent, the front label face says 45."
Tool designer: "And the government warning?"
Agent: "Found on the back face, verbatim, caps confirmed. That field matched. It's only the ABV that flagged, so the whole application is in the mismatch lane until I resolve it."
Tool designer: "Right. Once you do, it's approved and becomes a COLA. The clean ones never get here, you bulk-confirm the match lane in one go."
