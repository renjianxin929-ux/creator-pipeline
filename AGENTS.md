# AGENTS.md

Codex is the only EXECUTOR.
PM writes tickets. Founder owns gates. Codex does not change product principles.

## Before any code

1. Read `README.md`
2. Read `docs/ROADMAP.md`
3. Read `docs/ARCHITECTURE.md`
4. Read `docs/PM_PROTOCOL.md`
5. Read only the current file in `docs/tickets/`
6. Implement that ticket only

## Ticket quality bar

A ticket is valid only if all four are true:

1. One theme
2. One independently reviewable commit
3. Runnable acceptance
4. Failure does not force a full restart

## Hard bans

- Do not implement a later batch because the roadmap mentions it
- Do not rebuild a topic / research / calendar / competitor system
- Do not call live Grok / MiniMax / Omni / platform publish APIs in P0
- Do not add OpenCut as a runtime dependency
- Do not store cookies, tokens, or browser profiles
- Do not make Markdown the source of project state
- Do not introduce Kafka, Temporal, Kubernetes, or a second orchestrator
- Do not couple Brand Kit, Provider, Editor, or Publisher into one module

## Architecture rule

Depend on contracts, not vendors.

```
content-package → asset-plan → edit-plan → brand-kit → renderer-adapter → publisher-adapter
```

If a vendor dies, only its adapter changes.

## After a ticket

Return:

1. Files read
2. Files added or changed
3. Tests run and result
4. `git diff --stat`
5. Commit hash
6. What is still blocked
7. What you deliberately did not do
