# Creator Pipeline

Post-production pipeline for talking-head + screen-demo videos.

This repo is **not** a content-strategy platform.
Topic, research, and public opinion stay outside.
The pipeline starts after a `content-package` and raw media exist.

## One-sentence job

Receive Cap recordings, talking-head audio/video, screenshots, existing assets, and optional generated shots → understand → plan → cut → brand → preview → founder gate → export → publish-prepare.

## How this repo is read

Treat `docs/` as the book.

1. [docs/ROADMAP.md](docs/ROADMAP.md) — table of contents
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — decoupled seams
3. [docs/PM_PROTOCOL.md](docs/PM_PROTOCOL.md) — how batches and tickets work
4. [docs/tickets/](docs/tickets/) — only the current batch is fully specified
5. [AGENTS.md](AGENTS.md) — rules for Codex, the only executor

## Current batch

**P0 — Constitution + skeleton**

Codex may implement only the four tickets in `docs/tickets/BATCH_P0.md`.
Later chapters exist so the system does not drift. They are not current work.

## Roles

| Role | Person / agent | Job |
|---|---|---|
| Founder | Ren | Freeze principles, review preview, approve publish |
| PM | Grok | Split each batch into four tickets, block scope creep |
| Executor | Codex | Implement one ticket at a time |

## Non-goals for V3.0

- Auto topic selection
- Treating Grok website quota as xAI API billing
- OpenCut as production renderer
- Multi-platform publish before one real preview proves value
- Cookies, sessions, or secrets in git
