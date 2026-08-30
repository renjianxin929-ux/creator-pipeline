# BATCH P5 — Edit Plan + Preview Render

Status: CURRENT
Depends on: P4 PASS
Executor: Codex
Gate after T4: **R2 Founder preview review. Stop. Do not start P6.**

Constitution: §19–§21, §33, §P5.

Do these four tickets in order.
One commit per ticket.

---

## P5-T1 Edit-plan contract

**Theme:** LLM/rules write `edit-plan.json`. Renderers only execute it.

**In scope:**

- `src/contracts/edit-plan.ts`
- `version`, `format` (`9:16` default; allow `16:9` / `1:1`)
- Timeline clip: `id`, `source` or `source_asset_id`, `source_start_ms`, `source_end_ms`, `layout`, `caption`, optional `zoom`
- Validate: end > start, source exists as a string id/path, unknown layout rejected against brand layout ids
- Pure parse/diff helpers. No ffmpeg, no Remotion in this file

**Out of scope:** writing preview.mp4; approval hash.

**Commit:** `feat(p5): edit-plan contract`

---

## P5-T2 FFmpeg rough-cut executor

**Theme:** Deterministic media work stays in FFmpeg.

**In scope:**

- Adapter that cuts/concats from edit-plan using ffmpeg
- Input: ingested raw files + optional generated assets that are `final_eligible` or explicit plan sources
- Silence map may inform a *planner* later; this ticket only executes the plan it is given
- Normalize audio if cheap; do not invent color grading
- Missing ffmpeg → clear error, do not corrupt `state.json`

**Out of scope:** titles, brand frames, captions (those are Remotion).

**Acceptance:** given a two-clip plan and a tiny fixture, executor produces an intermediate cut file in `render/` or `derived/`.

**Commit:** `feat(p5): ffmpeg edit-plan executor`

---

## P5-T3 Remotion preview composition

**Theme:** Remotion is the production visual renderer for V3.0. Keep it one composition.

**In scope:**

- Add Remotion as a dependency only here
- One 9:16 composition that layers: cut video, captions from our SRT/segments, brand tokens (colors / safe-area), optional hook title from brand defaults
- Screen-demo layout may be a simple full-frame video + caption; zoom from plan if present
- OpenCut remains uninstalled. Optional stub folder is allowed, not required
- Brand kit is read-only. Do not invent new colors

**Out of scope:** six platform exports; cover.png pipeline; publish.

**Commit:** `feat(p5): remotion preview composition`

---

## P5-T4 Plan CLI + preview + tests, then STOP

**Theme:** `creator edit plan` and `creator render preview` stop at `PREVIEW_READY`.

**In scope:**

- Transitions: `ASSETS_READY | TRANSCRIBED → EDIT_PLAN_READY → PREVIEW_READY` plus `FAILED` / `WAITING_USER_ACTION`
- Allow planning from `TRANSCRIBED` if asset plan is empty / no generation required (do not block preview on assisted Grok waiting unless the plan *requires* a missing generated clip)
- Planner v0: keep spoken segments, skip long silence from silence-map, optional 0–1 broll clip if a final-eligible generated asset exists
- `creator render preview <slug>` writes `render/preview.mp4`
- Tests: contract + plan generation; render test `it.runIf` ffmpeg+remotion available; generate tiny fixture, do not commit large binaries
- Default tests must not call Grok/MiniMax

**Acceptance:**

```bash
creator edit plan <slug>
creator render preview <slug>
creator status <slug>    # PREVIEW_READY
```

**Forbidden after this ticket:** P6 approval/export, P7 publish, `creator publish`.

**Commit:** `feat(p5): preview cli and render gate`

---

## P5 done means

```text
[ ] edit-plan.json is the only render input
[ ] preview.mp4 can be produced from a fixture project
[ ] pipeline stops at PREVIEW_READY
[ ] Codex stops for R2 — Founder must watch the preview
```
