# Creator Pipeline — Book TOC

This is the directory of the book, not the current sprint backlog.
Each chapter is one development batch.
Each batch is split into **exactly four tickets** when it becomes current.

Only `docs/tickets/BATCH_P0.md` is executable now.

---

## Book structure

```text
0. Why this pipeline exists          (frozen in README + ARCHITECTURE)
1. P0  Constitution + skeleton       CURRENT
2. P1  Ingest
3. P2  Transcribe / understand
4. P3  Brand Kit
5. P4  Asset planner + providers
6. P5  Edit plan + preview render    GATE R2
7. P6  Approval + export
8. P7  One publisher
9. P8  Real-video E2E                GATE R3
```

Gates:

- R1 after P0
- R2 after first real preview (P5)
- R3 after one real video reaches draft/upload (P8)

No extra model-review between tickets inside a batch.

---

## Chapter 1 — P0 Constitution + skeleton  [CURRENT]

Goal: a repo that cannot fall apart.

Four tickets: see `docs/tickets/BATCH_P0.md`

1. Repo constitution
2. Domain contracts
3. CLI host
4. Test gate

R1 asks only:

- Did we leave the contract?
- Is there a second source of truth?
- Did we over-design?
- Did we pull old-platform modules into this repo?

---

## Chapter 2 — P1 Ingest

Goal: a real Cap export can enter one project directory.

Planned four tickets (not current):

1. Media identity contract (hash + ffprobe schema)
2. Ingest copy/classify into `raw/`
3. Duplicate / resume behavior
4. Ingest tests with a generated fixture

---

## Chapter 3 — P2 Transcribe

Goal: Chinese talking-head / screen audio becomes normalized transcript + SRT.

Planned four tickets:

1. Transcript schema (internal, not FunASR raw JSON)
2. FunClip/FunASR adapter as a subprocess
3. Silence / pause derived maps
4. One real short Chinese fixture test

---

## Chapter 4 — P3 Brand Kit

Goal: versioned brand, not per-video redesign.

Planned four tickets:

1. `brand/current.json` + tokens contract
2. Caption / hook / cover template slots
3. Talking-head + screen-demo layouts as data, not one-off JSX soup
4. Re-render same media against two brand versions

Do not invent a new visual identity in code. Missing tokens become TODO.

---

## Chapter 5 — P4 Providers

Goal: generation is routed, never hardcoded into the editor.

Planned four tickets:

1. `GeneratedAssetProvider` interface + manifest schema
2. `grok_ui` + `omni_ui` assisted adapters (WAITING_USER_ACTION)
3. `minimax_api` + `grok_api` adapters with fake clients and budget gate
4. Router tests: no key ⇒ fake pass; over budget ⇒ wait

`grok_ui` and `grok_api` are different billings. Never collapse them.

---

## Chapter 6 — P5 Edit plan + preview  [GATE R2]

Goal: a watchable `preview.mp4` from real Cap media.

Planned four tickets:

1. `edit-plan.json` schema + validator
2. FFmpeg deterministic cut/concat adapter
3. Remotion composition adapter (captions, brand, zoom, b-roll slot)
4. `creator render preview` stops at PREVIEW_READY

Founder watches the preview. If it does not save time, do not start P6/P7.

---

## Chapter 7 — P6 Approval + export

Planned four tickets:

1. Preview hash + approval record
2. Approval invalidation on preview change
3. Export targets 9:16 first, 16:9 optional
4. Cover + final SRT beside the mp4

---

## Chapter 8 — P7 One publisher

Planned four tickets:

1. Publisher capability matrix + adapter interface
2. Official API path for the first chosen platform
3. Local-browser fallback adapter (no cookies in git)
4. Prepare / draft / dry-run only — no silent public publish

Choose the first platform at the start of P7, not now.

---

## Chapter 9 — P8 Real E2E  [GATE R3]

Planned four tickets:

1. One real content-package + Cap project
2. At least one generated or explicit fallback asset
3. Founder approve → export
4. One platform draft/upload + evidence pack

After R3, this repo may be called the daily pipeline.

---

## Later books (not V3.0)

OpenCut production backend, auto publish, mass B-roll, multi-language dubbing, remote queues, team ACL, auto topic selection.
