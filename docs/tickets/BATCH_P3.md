# BATCH P3 — Brand Kit

Status: CURRENT
Depends on: P2 PASS
Executor: Codex
Gate after T4: none (next batch is P4)

Do these four tickets in order.
One commit per ticket.
Do not start P4 or P5 Remotion render.

Constitution: `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md` §17, §18, §P3.

This is a new standalone repo. There is no in-repo legacy brand to copy.
Do **not** invent a flashy new identity. Freeze a minimal v1.0 token set plus explicit TODOs for missing assets (logo files, motion). Visual composition stays P5.

---

## P3-T1 Brand contract and version pointer

**Theme:** Brand is versioned data. A project only stores `brand_version` plus optional override.

**Why this seam exists:** Per-video restyling must not mutate the kit. Renderer later reads a resolved snapshot.

**In scope:**

- `src/contracts/brand.ts`
- `brandVersion`, `tokens` (colors, typography, spacing, safe_area), `templates` ids, `brand_override` as a shallow JSON object with known keys only
- Resolve function: `kit + override -> resolved brand` without writing back to the kit
- No Remotion, no ffmpeg, no provider

**Out of scope:** drawing frames; generating logos; asset planner.

**Acceptance:** schema rejects unknown token keys if you use `.strict()` on the kit file. Override cannot add a new official token, only override existing ones.

**Commit:** `feat(p3): brand contract and resolve rules`

---

## P3-T2 v1.0 kit on disk

**Theme:** The kit lives under `brand/`, not inside a project directory.

**In scope:**

```text
brand/
  current.json          # { "version": "1.0" }
  v1.0/
    brand.json
    tokens/colors.json
    tokens/typography.json
    tokens/spacing.json
    tokens/safe-area.json
    prompts/image-style.md
    prompts/video-style.md
    TODO.md             # missing logo/avatar/motion files
```

- Neutral, boring defaults (near-black, near-white, one accent, one sans stack). No new marketing identity.
- `TODO.md` lists logo / avatar / intro / outro files as missing; do not generate fake brand images into git.
- Loader reads `brand/current.json` then `brand/<version>/`.

**Out of scope:** committing png/mp4 brand assets; installing Remotion.

**Acceptance:** loader returns v1.0 tokens from disk. Missing `brand/v1.1` fails clearly.

**Commit:** `feat(p3): brand v1.0 kit on disk`

---

## P3-T3 Template registry + project binding

**Theme:** A project picks template ids; it does not embed kit files.

**In scope:**

- Registry of template ids required by the constitution, even if implementation is data-only:
  `cover.tutorial | opinion | deep-dive | news`
  `caption.default | emphasis | quote`
  `title.hook | chapter | lower-third`
  `layout.talking-head | screen-demo | split-screen | screenshot | broll`
  `motion.intro | transition | outro | zoom`
- `creator init` writes optional `brand_version: "1.0"` on `project.json`
- `creator brand <slug>` prints resolved brand version + template defaults + override
- Allow `brand_override` on `project.json` without copying kit files into `workspace/`
- Open no new media state. Brand is orthogonal to `INGESTED` / `TRANSCRIBED`.

**Out of scope:** Remotion `.tsx` compositions that render video. If you add placeholder `.tsx` files they must not add a Remotion runtime dependency.

**Acceptance:**

```bash
creator init brand-demo
creator brand brand-demo
```

prints `1.0` and template ids. Changing override in project.json does not rewrite `brand/v1.0/`.

**Commit:** `feat(p3): brand templates and project binding`

---

## P3-T4 Brand test gate

**Theme:** Two versions can coexist; resolve is pure.

**In scope:**

- Contract tests for override-cannot-invent-tokens
- Loader test with a temporary `v1.1` fixture that only changes accent color
- Same project snapshot resolved against v1.0 vs v1.1 differs only in tokens
- `pnpm test` green without Remotion

**Forbidden:** P4 provider protocol; P5 render; generating images; pulling old social-media CSS as a hidden second kit.

**Commit:** `test(p3): brand version resolve`

---

## P3 done means

```text
[ ] four commits, four themes
[ ] brand/v1.0 exists and is the default
[ ] project stores version + override only
[ ] no Remotion render yet
[ ] missing logo files are TODOs, not invented artwork
```
