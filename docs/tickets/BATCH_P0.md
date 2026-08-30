# BATCH P0 — Constitution + skeleton

Status: CURRENT
Executor: Codex
Gate after T4: R1 (Founder + PM)

Do these four tickets in order.
One commit per ticket.
Do not start P1.

---

## P0-T1 Repo constitution

**Theme:** Make the repo readable as a book, with no runtime behavior yet.

**Why this seam exists:** If constitution lives only in chat, the next agent will invent a second system.

**In scope:**

- Keep / refine root `README.md` and `AGENTS.md` if a factual fix is required
- Add `package.json` name `creator-pipeline`, private, type module
- Add `.gitignore` for `node_modules`, `.env*`, `workspace/`, `dist/`, cookies, browser profiles, media binaries except tiny fixtures
- Add reserved adapter READMEs only if needed so the tree matches `docs/ARCHITECTURE.md`
- Node engine `>= 20`

**Out of scope:** CLI commands, schemas, ffmpeg calls, brand design, providers.

**Acceptance:**

- `npm install` works with almost no dependencies (dev: typescript, a test runner later in T4 is allowed to wait)
- Clone + read `docs/ROADMAP.md` explains the whole product without code

**Forbidden:** copying old platform source; adding Remotion/OpenCut/Playwright now.

**Commit:** `chore(p0): repo constitution and ignore rules`

---

## P0-T2 Domain contracts

**Theme:** Freeze the smallest JSON contracts so later adapters have something to implement.

**Why this seam exists:** Contracts must not import ffmpeg, fetch, or CLI.

**In scope:**

- `src/contracts/` with Zod (or equivalent) for:
  - project identity (`id`, `slug`, `created_at`, `brand_version?`)
  - state enum: `CREATED`, `INGESTED`, `TRANSCRIBED`, `ASSET_PLAN_READY`, `ASSETS_READY`, `EDIT_PLAN_READY`, `PREVIEW_READY`, `HUMAN_APPROVED`, `EXPORT_READY`, `PUBLISH_READY`, `PUBLISHED` plus `WAITING_USER_ACTION`, `WAITING_PROVIDER`, `PARTIAL_PUBLISHED`, `FAILED`
  - legal transitions from `CREATED` only to `INGESTED` or `FAILED` or `WAITING_*` for now; include a transition table that later stages can extend
  - event record: `ts`, `stage`, `event`, `project`, optional `provider`, no secrets
- Pure functions: `assertTransition(from, to)`, `createInitialState()`
- JSON Schema export optional

**Out of scope:** writing real project folders; CLI; ingest.

**Acceptance:**

- Invalid transition throws / returns error
- Contracts module has no Node fs / child_process imports

**Forbidden:** embedding provider prices; treating Markdown as state.

**Commit:** `feat(p0): project and state contracts`

---

## P0-T3 CLI host

**Theme:** A thin CLI that can create a project folder and report state.

**Why this seam exists:** Orchestration must stay above adapters. P0 CLI is a host, not a video engine.

**In scope:**

- `creator` bin
- `creator doctor` — check node version; check ffmpeg/ffprobe *presence* only; missing ffmpeg is WARN not hard fail in P0 if you document it; missing MiniMax key is WARN
- `creator init <slug>` — create `workspace/projects/<slug>/` with `project.json`, `state.json` (`CREATED`), `events.ndjson`, empty `raw/`, `content/`, `derived/`, `assets/`, `plans/`, `review/`, `render/`, `publish/`
- `creator status <slug>` — print state from JSON, never from README
- Workspace root from `creator.config.json` or default `./workspace` (config has no secrets)

**Out of scope:** ingest, transcribe, render, publish, inbox watcher.

**Acceptance:**

```bash
creator doctor
creator init demo
creator status demo
```

Second `creator init demo` is idempotent or cleanly refused without corrupting state.

**Forbidden:** calling any generation API; rendering video; reading the old repo as a runtime dependency.

**Commit:** `feat(p0): doctor init status cli`

---

## P0-T4 Test gate

**Theme:** Prove contracts + CLI without money, media vendors, or the old platform.

**Why this seam exists:** Later live smoke must stay behind `RUN_LIVE=1`. P0 tests are the default gate.

**In scope:**

- Vitest (or equivalent) in `tests/`
- Unit: state transitions, event shape, init folder layout
- CLI integration using a temp workspace directory
- `npm test` script
- Optional tiny generated silence fixture later; not required if tests do not touch media yet

**Out of scope:** live provider tests; publish tests; Remotion render tests.

**Acceptance:**

- `npm test` green on a clean machine with Node 20+
- A missing MiniMax key does not fail the suite

**Forbidden:** spending API budget in CI; committing cookies; asserting against old-repo paths.

**Commit:** `test(p0): contracts and cli gate`

---

## P0 done means

```text
[ ] four commits, four themes
[ ] creator doctor / init / status run
[ ] npm test green
[ ] no old-platform source imported
[ ] no provider live calls
```

Then stop for R1.
