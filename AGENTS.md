# AGENTS.md

Codex is the only EXECUTOR.

## Law

1. `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md` is the constitution.
2. `docs/FOUNDER_ADDENDUM.md` overrides only repo location, visibility, and batch cadence.
3. `docs/tickets/BATCH_*.md` is the only executable scope.
4. If a ticket and the contract fight, stop and ask. Do not silently pick the ticket.

## Before code

Read, in order: README, constitution, addendum, current batch ticket file.

If the constitution file is missing or is a stub, stop. Do not invent a replacement contract.

## Current cadence

You may finish all four P0 tickets in one session.
You must still make four commits, one theme each.
You must not start P1.

## Hard bans (from constitution)

- Do not rebuild topic / research / competitor systems
- Do not treat Grok website quota as xAI API billing
- Do not call live Grok / MiniMax / Omni / publish APIs in P0
- Do not add OpenCut as a runtime dependency
- Do not store cookies, tokens, or browser profiles
- Do not make Markdown the source of project state
- Do not introduce Kafka, Temporal, Kubernetes, or a second orchestrator
- Do not import the old social-media platform as a runtime dependency

## After the batch

Return the constitution §44 packet:

1. Files read
2. What was treated as legacy / out of scope
3. New tree
4. State schema
5. CLI commands
6. Test result
7. `git diff --stat`
8. Commit hashes (four)
9. Risks / open questions
