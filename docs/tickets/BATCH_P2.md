# BATCH P2 — Transcription

Status: CURRENT
Depends on: P1 PASS
Executor: Codex
Gate after T4: none (next batch is P3)

Do these four tickets in order.
One commit per ticket.
Do not start P3.

Constitution: `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md` §10 and §P2.

---

## P2-T1 Transcript contracts

**Theme:** FunClip/FunASR JSON is never the internal fact source.

**Why this seam exists:** Third-party transcript formats change. Ours must be stable, validatable, and writable to `derived/`.

**In scope:**

- `src/contracts/transcript.ts`
- Segment: `id`, `start_ms`, `end_ms`, `speaker`, `text`, `confidence?`, `keep?`
- Document: `source_media_id`, `language?`, `segments`
- Silence interval schema: `start_ms`, `end_ms`, `reason` (`silence` | `long_pause`)
- Pure functions: validate time ranges (`end_ms > start_ms`, no negative), render SRT from segments
- No `child_process`, no `fs`, no ModelScope imports

**Out of scope:** running ASR; writing files; state transitions.

**Acceptance:** invalid overlap/negative timestamps fail tests. SRT renderer is deterministic.

**Commit:** `feat(p2): transcript and silence contracts`

---

## P2-T2 Transcribe adapter protocol

**Theme:** Orchestrator calls an adapter interface; FunClip is one implementation.

**Why this seam exists:** Python subprocess must not become a second state store.

**In scope:**

- `src/transcribe/types.ts` — `TranscribeAdapter` with `id`, `available()`, `transcribe(input) -> TranscriptDocument`
- `src/transcribe/fake-adapter.ts` — deterministic fixture adapter for tests (no network, no paid API)
- `src/transcribe/funclip-adapter.ts` — subprocess wrapper that *maps* FunClip/FunASR output into our schema
- If FunClip/Python/model is missing: `available()` is false; do not throw during module import
- Adapter returns our contract only. Do not persist vendor JSON as `transcript.json`

**Out of scope:** edit-plan; filler-word LLM cleanup as a required path; installing models in CI.

**Acceptance:** fake adapter returns valid segments without Python. FunClip adapter code exists and fail-softs when the binary/module is absent.

**Forbidden:** hard-coding a Windows `E:\` model path; treating FunClip files as `state.json`.

**Commit:** `feat(p2): transcribe adapter protocol`

---

## P2-T3 CLI + derived artifacts + state

**Theme:** `creator transcribe <slug>` writes our artifacts and moves `INGESTED → TRANSCRIBED`.

**In scope:**

- Open transition table: `INGESTED → TRANSCRIBED | FAILED | WAITING_USER_ACTION`
- `creator transcribe <slug>`
- Choose primary media: prefer `kind=camera` or `screen` with audio; otherwise first video/audio record
- Write `derived/transcript.json`, `derived/transcript.srt`, `derived/silence-map.json`
- Append events (`stage=transcribe`)
- Adapter selection: FunClip if `available()`, else fake only when `CREATOR_TRANSCRIBE_ADAPTER=fake` (tests). If neither available: do **not** change state; emit `WAITING_USER_ACTION` event and a clear CLI error telling Founder how to install/run FunClip later
- Re-run on `TRANSCRIBED` is allowed and must not reset to `INGESTED`
- Hard-cut policy is not implemented here; only record silence intervals. Do not delete media.

**Out of scope:** Brand Kit; asset planner; preview render.

**Acceptance:**

```bash
creator status <slug>          # INGESTED
creator transcribe <slug>
creator status <slug>          # TRANSCRIBED
```

`derived/transcript.srt` exists and is parseable.

**Commit:** `feat(p2): transcribe cli and derived artifacts`

---

## P2-T4 Transcription test gate

**Theme:** Prove schema + CLI without requiring a production ASR model in every environment.

**In scope:**

- Contract tests for segments, SRT, silence map
- Integration with fake adapter: ingest fixture → transcribe → `TRANSCRIBED` + files
- FunClip-missing path: CLI exits non-zero or reports waiting, `state.json` stays `INGESTED`
- Do not add live ModelScope download to default `pnpm test`
- Optional: if FunClip is actually installed, one extra test may run; default suite must stay green without it

**Acceptance:** `pnpm test` / `npm test` green on Node 20+.

**Forbidden:** P3 brand tokens; provider calls; committing wav/mp4 except generated temp fixtures.

**Commit:** `test(p2): transcript contracts and fake adapter`

---

## P2 done means

```text
[ ] four commits, four themes
[ ] transcript schema is ours, not FunClip's
[ ] SRT is generated from our segments
[ ] missing ASR does not corrupt INGESTED state
[ ] no brand / asset-plan / render / publish code
```
