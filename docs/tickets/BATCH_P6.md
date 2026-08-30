# BATCH P6 — Approve + Export package

Status: CURRENT
Depends on: R2 CONDITIONAL PASS
Executor: Codex
Gate after T4: none. **Do not start P7.**

Constitution: §22–§23, §P6.

Do these four tickets in order. One commit per ticket.

---

## P6-T1 Approval contract

**Theme:** Approval is a signed fact about a specific preview file, not a boolean on `state.json` alone.

**In scope:**

- `src/contracts/approval.ts`
- Fields: `preview_path`, `preview_sha256`, `approved_at`, `approved_by`, `edit_plan_sha256?`, `notes?`
- Hash the preview bytes. Filename is not identity.
- No network. No platform API.

**Out of scope:** uploading; rewriting captions.

**Commit:** `feat(p6): approval contract`

---

## P6-T2 Approve CLI

**Theme:** `creator approve <slug>` moves `PREVIEW_READY → HUMAN_APPROVED`.

**In scope:**

- Open that transition (plus `FAILED` / `WAITING_USER_ACTION` if preview missing)
- Refuse approve when `render/preview.mp4` is absent
- Write `review/approval.json`
- Re-approve of the same hash is idempotent. If preview bytes changed since last approval, require a fresh approve and do not keep the old hash as current

**Out of scope:** silent auto-approve; publish.

**Commit:** `feat(p6): approve cli`

---

## P6-T3 Export package

**Theme:** Export copies an approved preview into a reviewable package. It does not invent new edits.

**In scope:**

- `creator export <slug>`
- Requires `HUMAN_APPROVED` and approval hash matching current preview
- Write `publish/package/` (or `render/export/`):
  - `master.mp4` (copy of approved preview)
  - `metadata.json` (title/description/hashtags placeholders + source hashes)
  - optional `cover.jpg` only if cheap ffmpeg still frame; otherwise `cover.TODO`
- Transition `HUMAN_APPROVED → EXPORT_READY`
- Do not call any social network

**Out of scope:** 6 platform aspect-ratio encodes unless already trivial copies. One master is enough for P6.

**Commit:** `feat(p6): export approved package`

---

## P6-T4 Tests, then STOP

**In scope:**

- Contract tests for approval hash
- Integration: fixture preview file → approve → export → `EXPORT_READY`
- Changing one preview byte invalidates previous approval
- `pnpm test` green. No live ASR. No publish.

**Forbidden:** `creator publish`, cookies, Bilibili/Douyin adapters, opening P7.

**Commit:** `test(p6): approve and export gate`

---

## P6 done means

```text
[ ] approve records sha256 of preview.mp4
[ ] export refuses unapproved or stale preview
[ ] no publisher code
[ ] Codex stops
```
