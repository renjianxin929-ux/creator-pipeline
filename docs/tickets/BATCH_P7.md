# BATCH P7 — Publisher protocol (dry-run only)

Status: CURRENT
Depends on: P6 PASS
Executor: Codex
Gate after T4: **R3 is NOT opened.** No live post.

Constitution: §24–§26, §P7.

Do these four tickets in order. One commit per ticket.

---

## P7-T1 Publish contracts

**Theme:** A publish attempt is a record, not a fire-and-forget HTTP call.

**In scope:**

- Platform ids: `douyin`, `video_wechat`, `xiaohongshu`, `bilibili`, `youtube`
- Target: platform + caption + cover path + media path + `dry_run`
- Result: `accepted | rejected | partial | waiting_user_action` + platform ids + error
- No network in this file

**Commit:** `feat(p7): publish contracts`

---

## P7-T2 Publisher adapter protocol

**Theme:** One interface. Default implementations are dry-run.

**In scope:**

```ts
interface PublisherAdapter {
  id: PlatformId;
  available(): Promise<boolean>;
  validate(package, target): Promise<Validation>;
  publish(package, target): Promise<PublishResult>;
}
```

- Dry-run adapter writes `publish/results/<platform>.json` and returns `accepted` with `dry_run: true`
- `available()` is false unless `CREATOR_PUBLISH_DRY_RUN=1` or explicit test fake
- Live browser/API adapters may exist as `available() === false` stubs with comments. They must not read cookies or launch browsers

**Forbidden:** Playwright against Douyin; storing session tokens.

**Commit:** `feat(p7): publisher adapter protocol`

---

## P7-T3 CLI plan + dry-run

**Theme:** `creator publish plan` then `creator publish dry-run`.

**In scope:**

- Require `EXPORT_READY`
- `creator publish plan <slug>` writes `publish/plan.json` listing platforms + metadata placeholders
- `creator publish dry-run <slug>` runs adapters with `dry_run: true`
- Open `EXPORT_READY → PUBLISH_READY` only after dry-run plan exists. Do **not** open `PUBLISHED`
- Missing master.mp4 → `WAITING_USER_ACTION`

**Out of scope:** `creator publish --live`, scheduling, analytics.

**Commit:** `feat(p7): publish plan and dry-run cli`

---

## P7-T4 Tests, then STOP

**In scope:**

- Dry-run does not touch the network
- Unexported project cannot dry-run
- Result files exist after dry-run
- Default `pnpm test` never posts

**Forbidden:** P8 analytics; R3 live publish; installing FunClip.

**Commit:** `test(p7): dry-run publish gate`

---

## P7 done means

```text
[ ] five platform ids exist
[ ] only dry-run can succeed in tests
[ ] state never reaches PUBLISHED
[ ] Codex stops for Founder before any live adapter work
```
