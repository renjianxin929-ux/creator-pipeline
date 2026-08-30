# Creator Pipeline

Post-production pipeline for talking-head + screen-demo videos.

**Constitution:** [docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md](docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md)

That original contract is the source of truth.
Tickets and roadmap only sequence work. They cannot weaken the contract.

This repo is **not** a content-strategy platform.
Topic, research, and public opinion stay outside.
The pipeline starts after a `content-package` and raw media exist.

## One-sentence job

Receive Cap recordings, talking-head audio/video, screenshots, existing assets, and optional generated shots → understand → plan → cut → brand → preview → founder gate → export → publish-prepare.

## Read order

1. [docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md](docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md) — constitution
2. [docs/FOUNDER_ADDENDUM.md](docs/FOUNDER_ADDENDUM.md) — later Founder overrides
3. [docs/ROADMAP.md](docs/ROADMAP.md) — book TOC
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — seams
5. [docs/tickets/BATCH_P0.md](docs/tickets/BATCH_P0.md) — current executable batch
6. [AGENTS.md](AGENTS.md) — Codex rules

## Current batch

P0 — four tickets, one session allowed, four commits, then stop for R1.

## Roles

| Role | Who | Job |
|---|---|---|
| Founder | Ren | Freeze principles, review preview, approve publish |
| PM | Grok | Split each contract slice into four tickets |
| Executor | Codex | Implement the current batch only |

## P0 CLI

Install dependencies and build the local CLI:

```bash
npm install
npm run build
npm link
```

The linked `creator` command supports only the P0 host commands:

```bash
creator doctor
creator init demo
creator status demo
```

`creator init` writes structured project state under `./workspace/projects/<slug>/`.
To use a different workspace, create a local `creator.config.json` with a
non-secret `workspace` value, for example `{ "workspace": "../creator-workspace" }`.
