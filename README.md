# Creator Pipeline

Post-production pipeline for talking-head + screen-demo videos.

**V3 Constitution:** [docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md](docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md)

The original V3 contract remains the source of truth for the V3 product principles, adapter boundaries, state rules, gates, and bans. P0–P8 engineering is closed.

The current post-V3 enhancement is the **Director Layer + REN Style OS**:

- [Founder decision](docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md)
- [P9 executable batch](docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md)

This repo is **not** a content-strategy platform.
Topic, research, and public opinion stay outside.
The pipeline starts after a `content-package` and raw media exist.

## One-sentence job

Receive Cap recordings, talking-head audio/video, screenshots, existing assets, and optional generated shots → understand → plan → direct → cut → brand → preview → founder gate → export → publish-prepare.

## Current architecture extension

```text
Frozen Script + transcript/media/assets + REN Style OS
                        ↓
                 Director Layer
                        ↓
                 Director Plan
                        ↓
                 existing Edit Plan
                        ↓
              FFmpeg / Remotion preview
                        ↓
             Director QA + Founder Gate
                        ↓
             Founder Decision Dataset
```

The script remains content truth. The Director Plan is its derived visual-execution contract. Asta or another strong model may act as Director, but no model/vendor is the source of style truth.

## Read order

1. [docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md](docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md) — V3 constitution
2. [docs/FOUNDER_ADDENDUM.md](docs/FOUNDER_ADDENDUM.md) — V3 Founder overrides
3. [docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md](docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md) — current Founder-frozen post-V3 architecture
4. [docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md](docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md) — current executable batch
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — durable seams
6. [AGENTS.md](AGENTS.md) — execution rules

`docs/ROADMAP.md` is the historical V3 book TOC and still describes the original P0–P8 sequence; it is not the current sprint pointer after V3 closure.

## Current batch

P9 — Director Layer + REN Style Foundation.

P9 has four tickets:

1. Director + Style contracts
2. REN Style OS v1 data model
3. Style-aware Director Planner seam
4. Director QA + Founder Decision Dataset + Golden Set seed

P9 is not complete until one real frozen script + real footage/demo reaches Director Plan → Edit Plan → Preview → Founder review → persisted decision record.

## Roles

| Role | Who | Job |
|---|---|---|
| Founder | Ren | Freeze principles/style, review director decisions, approve publish |
| Director | Asta or equivalent strong agent | Translate frozen script + real media + REN Style OS into a structured Director Plan |
| Executor | Codex or another explicitly assigned execution agent | Implement the current ticket/Director Plan without redesigning the video |
| Renderers | FFmpeg / Remotion and replaceable adapters | Deterministic execution, not creative source of truth |

## CLI baseline

Install dependencies and build the local CLI:

```bash
npm install
npm run build
npm link
```

The current repository contains the P0–P8 CLI/production baseline. P9 may extend it only within the frozen P9 ticket scope.
