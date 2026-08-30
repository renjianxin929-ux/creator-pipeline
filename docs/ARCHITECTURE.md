# Architecture — decoupled seams

The durable system is the contracts, not the vendors.

```text
Founder / Grokbot
        │
        ▼
 content-package          ← outside this repo's core
        │
        ▼
   orchestrator CLI       ← thin, replaceable
        │
        ▼
   project state JSON     ← single source of truth
        │
   ┌──────────┼──────────┐
   │          │          │
 ingest     understand   assets
   │          │          │
   └──────────┴──────────┘
                  │
             edit-plan
                  │
        ┌──────┼──────┐
        │             │
     ffmpeg        remotion
   (deterministic) (composition)
        │             │
        └──────┴──────┘
                  │
               preview
                  │
            HUMAN GATE
                  │
               export
                  │
             publisher
```

## Replaceable adapters

| Seam | V3.0 production | Allowed fallback | Forbidden as foundation |
|---|---|---|---|
| Transcribe | FunClip / FunASR adapter | manual SRT | raw vendor JSON as state |
| Generate | grok_ui assisted | minimax_api, manual | omni as final by default |
| Edit / render | FFmpeg + Remotion | none in V3.0 | OpenCut runtime |
| Publish | official API | local browser, manual | silent public post |

## Package boundaries (target)

```text
src/
  contracts/      # zod schemas, state machine, zero I/O
  project/        # filesystem layout for one video project
  cli/            # commander/citty, calls use-cases only
  ingest/         # adapters in, contracts out
  understand/     # transcript adapters
  assets/         # planner + provider router
  providers/      # grok_ui, grok_api, minimax, omni, manual
  editors/        # ffmpeg, remotion, opencut stub
  brand/          # versioned kit loader
  publish/        # api / browser / manual
  testkit/        # fakes, fixtures
```

P0 only creates `contracts/`, `project/`, `cli/`, `testkit/` plus empty adapter folders if useful as seams.
Empty folders must contain a README that says `status=reserved`, not fake implementations.

## State

Program state lives in:

- `project.json`
- `state.json`
- `events.ndjson`

Later batches add manifests and plans. Markdown is human-facing only.

## Relation to the old platform

Old repo (`social-media-automation` and any “拆的懂” tree) is **upstream reference**, not a subtree of this repo.

Allowed later:

- copy brand tokens / useful publish snippets **into adapters**
- link fixtures

Forbidden now:

- git submodule of the old monolith
- moving GEO / competitor / topic engines here
- sharing one database
