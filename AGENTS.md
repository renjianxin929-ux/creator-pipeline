# AGENTS.md

Codex is the only EXECUTOR unless the Founder explicitly assigns another executor for a bounded task.

## Law

1. `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md` remains the V3 constitution.
2. `docs/FOUNDER_ADDENDUM.md` overrides only repo location, visibility, and the original V3 batch cadence.
3. `docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md` is the Founder-frozen post-V3 decision for the Director + REN Style layer.
4. `docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md` is the current executable scope.
5. If the P9 ticket and the V3 constitution conflict, stop and ask. P9 may extend V3 after P0–P8 closure, but may not silently weaken V3 product principles, state-source rules, adapter boundaries, or human gates.

## Before code

Read, in order:

1. `README.md`
2. `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md`
3. `docs/FOUNDER_ADDENDUM.md`
4. `docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md`
5. `docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md`
6. relevant existing implementation and tests

If any required governing file is missing or a stub, stop. Do not invent a replacement contract.

## Current state

- P0–P8 engineering: CLOSED
- R3: remains CLOSED unless the Founder explicitly reopens it
- Current next batch: `P9 — Director Layer + REN Style Foundation`

P9 is a post-V3 enhancement. Do not rewrite the original V3 constitution to make it fit.

## P9 execution cadence

P9 contains exactly four tickets in `docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md`.

- Keep one theme per commit.
- Preserve current P0–P8 behavior and tests.
- Do not implement beyond P9 inside the same session.
- Do not call P9 complete until the real-video Founder gate in the P9 ticket is satisfied.

## Hard bans

- Do not rebuild topic / research / competitor systems.
- Do not rebuild OpenMontage inside this repo.
- Do not treat Grok website quota as xAI API billing.
- Do not add OpenCut as a production runtime dependency.
- Do not store cookies, tokens, or browser profiles.
- Do not make Markdown the source of project runtime state.
- Do not introduce Kafka, Temporal, Kubernetes, or a second orchestrator.
- Do not import the old social-media platform as a runtime dependency.
- Do not make Asta, GPT, Claude, Codex, HyperFrames, video-use, SmartSub, or another vendor/tool the source of style truth.
- Do not allow renderers to invent Director decisions.
- Do not silently rewrite a frozen script.
- Do not auto-promote Founder review feedback into reusable Style OS rules without explicit Founder approval.

## After the batch

Return a closure packet containing:

1. governing files read;
2. baseline HEAD and final HEAD;
3. files changed / new tree;
4. Director + Style contracts added;
5. CLI/use-case changes;
6. test results including P0–P8 regression status;
7. `git diff --stat`;
8. commit hashes by ticket;
9. real-video gate result or exact blocker;
10. risks / open questions;
11. whether Founder Edit Distance / Golden Set reporting is operational.
