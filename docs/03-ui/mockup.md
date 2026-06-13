# UI Mockup and Design Reference

Status: draft for review
Owner: solo developer
Last updated: 2026-06-10
Companion file: mockup.html (open in a browser; clickable)

This is the visual reference for how the application should look and behave. The guiding principle, after a UX regroup, is that the app has one obvious path and always shows the single next thing to do. It is a worklist, not a dashboard of separate tools.

## The Core Idea: One Queue

The whole app is the agent's worklist, like a smart inbox. There is no separate "verify" feature and no separate "batch" feature, because those framings were the source of the confusion. Instead:

Verification happens automatically at intake. When an application arrives (from COLAs Online in production; simulated here), the system reads its label faces and compares them to the form before the agent ever sees it. So every item in the queue is already tagged match, mismatch, or review.

The agent works one pre-sorted queue. They land directly in their work, with a plain-language status sentence at the top: "18 applications today, 13 clean and ready, 5 need your review." That sentence is the whole status and tells them exactly what to do.

There are only two moves. Approve the clean ones together in one click, and step through the flagged ones one at a time. When the flagged ones are done, "you're all caught up."

This is the answer to "what am I supposed to do with this app": work your queue, top to bottom, the easy ones in bulk and the hard ones one by one.

## Screens

The app presents two role-based shells, toggled by a role switcher in the sidebar (which simulates identity-driven access; see systemsdesign D16). The Admin shell (a division supervisor) sees the global views and controls; the Agent shell sees only their own work and account. The screens below are grouped accordingly.

Admin shell: Operations, All Applications, Analytics, Team, Knowledge Base.
Agent shell: My Queue, My Stats, Profile.

Operations (the Admin home and default). The view that makes routing visible. A funnel strip across the top shows the day's flow: received (600) → auto-verified (600, avg 3.4s) → ready to approve (420 clean matches) → needs review (180, split into mismatch and review). Below, two panels. The shared approval pool holds the clean matches with one "Approve all 420" action — these are shared for final approval, not assigned to anyone. The review distribution board shows the 180 exceptions spread across the agents, each with a load bar, count, and their beverage specialization, topped by a highlighted shared-pool row ("24 waiting to be pulled", split by type as wine / spirits / malt) and a Distribute action, so each exception routes to a matching specialist. A live-intake feed lists the most recent applications with their lane and destination ("Auto-cleared → approval pool", "→ review pool", "→ Marcus Lee"). This is where a supervisor sees applications come in, get auto-analyzed, and get routed: matches to the shared pool, exceptions distributed.

My Queue (the agent's claimed work). The exceptions this agent has pulled from the shared review pool, problems first, each row showing the brand, the one issue in plain language ("Alcohol content: form 40% vs label 45%"), and a color-plus-icon-plus-text status pill. A claim bar at the top states how many are claimed and how many remain in the pool, with a "Get next from pool" action embodying the pull model. Clicking any row opens the review detail. The clean matches are not here; they live in the shared approval pool on Operations.

Review detail (the one screen that matters). Reached by clicking a queue item. It shows the application as submitted on the left (the label faces and the form record) and the application-versus-label comparison on the right (field by field, with the differing field highlighted and the warning's structural checks spelled out). A lane banner states the outcome in plain language. The decision buttons are the same two for either case: Return for correction (sends it back with a 30-day window) or Approve (used when the AI flagged something that is actually fine, or once the issue is resolved). There is no manual reject; a returned application that is not corrected within 30 days is auto-rejected. After a decision the view auto-advances to the next flagged application ("Reviewing 2 of 5"), so the agent moves through the queue like an inbox without returning to the list each time. Finishing shows the caught-up state.

All Applications (the full record). A searchable, filterable table of every application, not just today's queue. Filters for free-text search (brand or TTB ID), status (approved, needs correction, rejected, in queue), date range (today, this week, this month, all time), and assigned agent. This is where an agent or supervisor answers "what happened to application X," reviews approved history, or pulls everything a given agent handled this month. Columns: application and TTB ID, beverage type, applicant, assigned agent, status, and received date.

Analytics (the division dashboard). A week/month toggle drives the whole view. KPI cards (applications processed, match rate, combined mismatch-and-review rate, average handling time with estimated hours saved). A volume trend (processed applications over the last eight weeks). A triage-breakdown donut showing the AI lanes (match, mismatch, review), which are the automatic verdicts, kept distinct from the agent's final dispositions (approve, return for correction, reject; see flowchart.md and schema.md). A top-mismatch-reasons chart (share of flagged applications by failing field: alcohol content, government warning, net contents, brand, producer, origin). And throughput by agent. This is the supervisor's view of whether the division is keeping up and where the problems cluster, and it is where the business case (time saved) becomes visible day to day.

My Stats (the agent's own dashboard). The per-agent slice of the analytics, scoped to the logged-in agent: KPI cards (completed this week and this month, their match rate, average handling time), their own outcome split as a rate bar against the division average, and a list of their recent decisions. It reuses the same metric rollups as the Team view, just filtered to one person.

Profile (the agent's account). Their identity, team, and specialization, plus an availability control. Setting out of office pauses the pull router from sending them new exceptions and allows their claimed items to be reassigned, which is the concrete link between Profile and the routing model (systemsdesign D15).

Assistant (global, all screens). A floating button at the bottom right opens a read-only chat helper. It greets the user by name, offers quick-reply chips, and answers in three areas: a role-scoped summary of their numbers (an agent gets their week, an admin gets the division), plain explanations of how verification, triage, and dispositions work, and best practices for tricky checks like the government warning. A line under the input states plainly that it only explains and summarizes and never approves or changes records. Its answers are role-aware (driven by the same role switch), which doubles as the visible reminder that the assistant respects access scope. The mockup uses canned responses; the real assistant is grounded in help content and the user's data and is evaluated per observability.md.

Team (per-member performance, Admin shell). A table of each team member with applications completed this week and this month, their match/mismatch/review split shown as a rate bar, and average handling time. A Specialization column shows each agent's beverage type (wine, distilled spirits, malt beverage) with an Edit control; this is where an admin assigns specialists so specialized teams handle only their label types (the routing key behind systemsdesign D15). This answers "who is doing what and how" and surfaces, for example, an agent with an unusually high mismatch rate worth a conversation. In production the tool routes only the exception lanes through a shared work pool that agents pull from (systemsdesign D15); the match lane is bulk-confirmed and not individually assigned. The mockup is single-agent, so "My Queue" stands in for both the shared pool and the agent's claimed items.

Knowledge Base (Admin shell). Where an admin manages what the assistant can say. An upload dropzone (PDF, DOCX, Markdown, TXT) sits above a table of indexed documents, each with its topic, chunk count, an indexing status (Indexed or Processing), and the last-updated time. Uploading a file adds it as Processing, then flips to Indexed once chunked and embedded. The page states plainly that the assistant answers only from these sources, so this tab is the lever that controls what it cites, and the content is versioned and auditable (schema.md knowledge_base). This is a retrieval-grounded knowledge base (RAG), not a literal knowledge graph.

## Where Batch Went

Batch is no longer a place you visit, which fixes the disconnection. A peak-season dump of 200 to 300 applications is just a larger intake event: the system verifies all of them automatically, and they appear in the queue already triaged. "Batch" then simply means the Ready list is longer and the one-click bulk approval clears more at once. The batch capabilities from requirements (accept many, process them, group by lane, bulk-confirm; FR-17 through FR-20) are all still present, just realized inside the one queue rather than as a separate screen.

## Sample Application Set (Reference Data)

The mockup is grounded in a concrete set of nine sample applications, which double as test fixtures. They deliberately cover every outcome:

Clean matches: Old Tom Distillery (bourbon), Silver Branch Gin, Maple Hollow Cream (liqueur), Juniper Coast Gin. These represent the 13 in the Ready lane.

Mismatches: Harbor Mist Vodka (alcohol content, form 40% vs label 45%), Cedar Ridge Reserve (government warning heading in title case, not all caps), Coastal Pale Ale (net contents, form 12 fl oz vs label 16 fl oz).

Low confidence or ambiguous: Pages 1907 Lager (image too blurry to read the warning, request a resubmit), Dunmore Single Malt (brand near-miss, "Dunmore" versus "Dun More", a judgment call).

This set maps directly onto the acceptance criteria (AC-1 through AC-6): a clean pass, an ABV mismatch, a title-case warning, a net-contents mismatch, an unreadable image, and a fuzzy near-miss.

## The Lane Visual Language

The three lanes are shown three ways at once, always: a color, an icon, and a text label. Green check "Match," red cross "Mismatch," amber question mark "Review." Status never depends on color alone, which satisfies NFR-2 and AC-9 and respects color-blind and older users. Mismatched rows are additionally tinted and the differing value bolded so the eye goes straight to the problem (FR-15).

## Visual System

A modern but restrained SaaS look. A blue brand accent for primary actions; green, red, and amber for the lanes, each with a soft tint and matching border. A slim two-item sidebar (My Queue, Team View) so navigation is nearly invisible and the agent stays in their work. Large targets (buttons and rows around 46 to 54px tall) and a comfortable 16px base type, addressing the "no hunting for buttons" feedback and the low-tech-comfort user base. Generous spacing and low information density on purpose.

## How It Maps to Requirements

One obvious path and the single next action: the status sentence, the one-click approve-all, and the auto-advancing review (FR-21, Review Model).
Three lanes obvious at a glance: the status pills and the lane banner (FR-13, FR-22).
Per-field breakdown to resolve flags: the application-versus-label table in the review detail (FR-14, FR-24).
Multi-face applications with the warning checked across faces: the face thumbnails and the warning row (D12).
Bulk-confirm of the match lane: the "Approve all" banner and top action (FR-20, FR-23).
Unreadable image as a normal outcome: the low-confidence lane with a request-a-better-image action (FR-16).
Auto-verify on intake and the pre-triaged queue: the whole model (Review Model; D11 conservative default, nothing auto-approves unseen).
Supervisor visibility and assignment: the Team View (assignment simulated, real in COLAs Online).
Accessibility: color never alone, large targets, readable type (NFR-2, AC-9).

## Deliberate Notes and Limitations

This is a static mockup. Verification is pre-computed in the sample data rather than a real model call; there is no real upload, no persistence, and assignment is faked. The nine sample applications stand in for a day's queue. Exact colors, spacing, and icons are a starting point for design; the binding parts are the one-queue model, the lane language, the auto-advancing review, and the accessibility rules.

The mockup's in-memory data is a denormalized read model of the production tables in schema.md: each sample application corresponds to an application row joined with its current verification, its field results, and its latest disposition; the history, team, and analytics figures correspond to those tables and the metric rollups. The prototype itself persists nothing (NFR-4; constraints: Compliance); schema.md is what a real deployment would add behind the same module seams.
