# BATCH P1 — Ingest

Status: CURRENT
Depends on: R1 PASS
Executor: Codex
Gate after T4: none (next batch is P2)

Do these four tickets in order.
One commit per ticket.
Do not start P2.

Constitution remains `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md` §9 and §P1.

---

## P1-T1 Media identity contract

**Theme:** A file is identified by content hash + probe metadata, never by filename alone.

**Why this seam exists:** Contracts must not import ffmpeg. Probe results must be our schema, not ffprobe's raw JSON.

**In scope:**

- `src/contracts/media.ts`
- Fields at least: `id`, `sha256`, `byte_size`, `path`, `kind` (`camera` | `screen` | `audio` | `image` | `misc`), `duration_ms?`, `fps?`, `codec?`, `width?`, `height?`, `has_audio?`, `orientation?`
- Pure helpers only; no `child_process`, no `fs`

**Out of scope:** copying files; calling ffprobe; changing state to INGESTED.

**Acceptance:** invalid probe objects fail schema tests. Contracts package still has no Node I/O.

**Forbidden:** using basename as `id`.

**Commit:** `feat(p1): media identity contract`

---

## P1-T2 ffprobe adapter + ingest copy

**Theme:** `creator ingest <project> <file...>` copies media into `raw/<kind>/` and writes probe records.

**Why this seam exists:** FFmpeg belongs behind an adapter. CLI only orchestrates.

**In scope:**

- `src/ingest/ffprobe.ts` wrapping `ffprobe` into the P1-T1 schema
- `src/ingest/classify.ts` — cheap kind guess from probe + extension; Founder can later override
- `creator ingest <slug> <path...>`
- Copy into `workspace/projects/<slug>/raw/<kind>/` using hash-based stored names
- Append derived `derived/media-probe.json` as a list of normalized records
- Append `events.ndjson` (`stage=ingest`)
- After at least one successful file: `CREATED → INGESTED` via `assertTransition`

**Out of scope:** inbox watcher; transcription; silence map; deleting source files.

**Acceptance:**

```bash
creator init p1-demo
creator ingest p1-demo ./some-fixture
creator status p1-demo   # INGESTED
```

If ffprobe is missing: fail that ingest with a clear error, do not corrupt `state.json`.

**Forbidden:** calling Grok/MiniMax; parsing Cap project format; forking Cap.

**Commit:** `feat(p1): ingest copy and ffprobe adapter`

---

## P1-T3 Duplicate and resume

**Theme:** Same bytes ingested twice do not duplicate raw files or break state.

**Why this seam exists:** Idempotent stages are in the constitution. Ingest must be re-runnable.

**In scope:**

- Same sha256 → skip copy, keep existing record, write an event `ingest_duplicate_skipped`
- Re-running ingest on an already `INGESTED` project is allowed and must not reset to CREATED
- Corrupt/unreadable input fails that file only when multiple files are passed; successful files still land

**Out of scope:** content-aware scene split; perceptual hash.

**Acceptance:** ingest the same fixture twice; one raw file; state stays `INGESTED`; events show skip.

**Commit:** `feat(p1): ingest idempotent duplicate skip`

---

## P1-T4 Ingest test gate

**Theme:** Prove ingest without the old platform and without paid APIs.

**In scope:**

- Tests for schema, classify, duplicate skip, illegal transition protection
- If ffmpeg/ffprobe exist, generate a tiny legal fixture in the test temp dir (do not commit a large binary)
- If ffprobe is missing, adapter/unit tests still pass; live copy test is skipped, not failed as a red suite for missing optional media tools — except a documented unit that the CLI errors cleanly
- Do not add `RUN_LIVE` provider tests

**Acceptance:** `pnpm test` / `npm test` green on a machine with Node 20+.

**Forbidden:** committing cookies; depending on `E:\` paths; importing social-media-automation.

**Commit:** `test(p1): ingest contract and idempotency`

---

## P1 done means

```text
[ ] four commits, four themes
[ ] creator ingest moves CREATED → INGESTED
[ ] filename is not the media id
[ ] duplicate bytes are skipped
[ ] npm/pnpm test green
[ ] no transcribe / brand / provider / publish code
```
