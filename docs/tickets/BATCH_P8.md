# BATCH P8 — Observe, retry, reuse

Status: CURRENT
Depends on: P7 PASS
Executor: Codex
Gate after T4: constitution P0–P8 engineering complete. **R3 still closed.**

Constitution: §27–§31, §P8 if present; otherwise treat this as post-publish local loop without network.

Do these four tickets in order. One commit per ticket.

---

## P8-T1 Observation + retry contracts

**Theme:** Outcomes are local records. No platform scrape.

**In scope:**

- Observation: platform, dry_run, status, recorded_at, optional view/comment placeholders as `null`
- Retry policy: max_attempts, backoff is data not a scheduler
- Forbidden: fetching Douyin/Bilibili analytics

**Commit:** `feat(p8): observation and retry contracts`

---

## P8-T2 Reuse snapshot

**Theme:** A finished project can donate plan + brand pointer, not media bytes.

**In scope:**

- Snapshot: brand_version, template defaults, edit-plan format, publish plan platforms
- `creator snapshot <slug>` writes `publish/reuse-snapshot.json`
- Snapshot must not copy raw video or secrets

**Commit:** `feat(p8): reuse snapshot`

---

## P8-T3 Local report CLI

**Theme:** Founder can see one project end-to-end without a dashboard.

**In scope:**

- `creator report <slug>` prints: state, media count, transcript adapter if known, preview hash if approved, export master hash, dry-run results
- Write `review/report.json` as the same payload
- Missing stages print `absent`, do not crash

**Out of scope:** web UI, scheduling, live publish.

**Commit:** `feat(p8): project report cli`

---

## P8-T4 Tests, then STOP

**In scope:**

- Snapshot excludes raw paths to media files
- Report works from CREATED through PUBLISH_READY fixtures
- `pnpm test` green, zero network

**Forbidden:** R3 live post, analytics APIs, FunClip install, P9.

**Commit:** `test(p8): report and snapshot gate`

---

## P8 done means

```text
[ ] local report exists
[ ] reuse snapshot has no video bytes
[ ] no PUBLISHED transition
[ ] Codex stops; Founder decides when real ASR + R3 happen
```
