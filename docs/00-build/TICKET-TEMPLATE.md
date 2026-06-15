# TICKET-{NN} Kickstart Primer

Use this to start TICKET-{NN} in a fresh agent session (Claude Code / Cursor).

Fill the placeholders before pasting. Fields marked "(at start)" capture the real state when you begin the ticket (the previous ticket's actual output), so they are completed as you go, not in advance.

---

## Copy-Paste This Into New Agent

```
Read @PRD.md, @CONTEXT.md, @systemsdesign.md, @techstack.md, @requirements.md, and @TICKETS.md.

I'm working on TICKET-{NN}: {Ticket title}.

Current state: (at start)
- [list what is DONE so far, with ✅, including the previous ticket's real files, infra, and any deployed URL]

What's NOT done yet:
- [list with ❌ what this ticket and later ones still need]

TICKET-{NN} Goal:
{One-paragraph goal: what this ticket delivers and why.}

Check {primary file(s)} before starting. Don't overwrite existing code.
Follow the architecture and decisions in @systemsdesign.md (decisions D{...}) and the rules in @CONTEXT.md.

After completion, follow the testing checklist below and the acceptance criteria in @requirements.md.
```

---

## Context Summary for Agent

### What the previous ticket delivered (at start)

Files created: [paths]
Infrastructure: [services, env, repo, deploy target]
Current branch: [branch] (state)

### TICKET-{NN} Scope

- Phase: {phase number and name}
- Time budget: {estimate}
- Dependencies: {ticket IDs}
- Branch: {feat/...}

Acceptance criteria:
- [ ] {criterion} (ref FR/NFR/AC or systemsdesign decision)
- [ ] ...

Implementation details:
- {step}
- {step}

### Key constraints (from CONTEXT.md, constraints.md, systemsdesign.md)

1. {constraint, e.g. model reads, code decides — D4}
2. {constraint, e.g. p95 under 5s — NFR-1}
3. TypeScript strict mode, no any.
4. {area-specific constraint}

### Files to modify

Primary: {path}
Current contents: (at start) {snippet}
Action: {what to change}

### Files to create

1. {path} — {purpose}
2. {path} — {purpose}

### Config / schema / store updates

{config files, schema tables, or state stores this ticket touches}

### Testing requirements

Automated:
```
pnpm lint
pnpm build
pnpm test
```
Manual:
- [ ] {manual check}
Eval (where relevant): run the golden-set harness; assert the relevant AC.
Update docs: mark TICKET-{NN} done in TICKETS.md; add a DEV-LOG entry.

### Reference

- Relevant design doc sections: {links}
- Library/API docs: {links}

### Common gotchas

1. {gotcha}
2. {gotcha}

### Definition of Done

Code complete when:
- [ ] {behaviour} works
- [ ] {behaviour} works
- [ ] No console/test errors
- [ ] Meets the cross-cutting requirements (latency, accessibility) where applicable

Ticket complete when:
- [ ] All code-complete criteria met
- [ ] Tests pass (lint, build, test, manual)
- [ ] TICKETS.md and DEV-LOG updated
- [ ] Committed to {branch}, pushed, merged to main

### Expected output

{What the app/system does after this ticket, in a few lines.}

### Dependencies to install

```
{pnpm add ...}
```

### Why (fill at completion)

_A one-paragraph rationale for the choices made in this ticket — written when the work lands, not in advance._

Explain: why this scope and not more or less; why these specific technical choices (libraries, file layout, defaults); what trade-offs were accepted; what would have been wrong to do differently. Aim for the why a future reader (or future-you) couldn't reconstruct from the diff alone.

The same paragraph should be mirrored verbatim into the DEV-LOG entry for this ticket so the rationale travels with the historical log, not just the per-ticket file.
