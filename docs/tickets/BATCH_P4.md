# BATCH P4 — Asset Planner + Provider Protocol

Status: CURRENT
Depends on: P3 PASS
Executor: Codex
Gate after T4: none (next batch is P5 / R2)

Do these four tickets in order.
One commit per ticket.
Do not start P5 render.

Constitution: §11–§16, §32, §P4.
Hard rule: `grok_ui` and `grok_api` are different billing paths. Never treat SuperGrok quota as xAI API credit.

---

## P4-T1 Asset plan + generation contracts

**Theme:** Planner writes intent. Providers only receive a normalized request.

**In scope:**

- `src/contracts/assets.ts`
- Asset request: `asset_id`, `timeline_hint?`, `purpose`, `priority`, `description`, `preferred_source`, `fallback_source`, `generation?`
- Generation block: `provider_preference[]`, `max_attempts`, `cash_budget_cny`
- Asset plan document + asset manifest record fields from §16 (`source`, `final_eligible`, `has_watermark`, `cash_cost_cny`, `subscription_quota_used`)
- Project budget object from §32
- No network, no fs in the contract file

**Out of scope:** calling Grok; writing files; routing.

**Acceptance:** schema rejects mixing unknown provider ids. `omni_ui` default `final_eligible` is false at the type/default layer or documented in factory helpers.

**Commit:** `feat(p4): asset plan and generation contracts`

---

## P4-T2 Provider protocol + stubs

**Theme:** One interface, five ids, zero paid calls in default tests.

**In scope:**

```ts
interface GeneratedAssetProvider {
  id: "grok_ui" | "grok_api" | "minimax_api" | "omni_ui" | "manual";
  capabilities(): Promise<ProviderCapabilities>;
  prepare(request): Promise<PreparedRequest>;
  submit(request): Promise<GenerationJob>;
  poll(job): Promise<GenerationStatus>;
  collect(job): Promise<GeneratedAsset>;
}
```

- Capabilities include `automation: api | browser | assisted | manual` and `has_watermark_risk`
- `grok_ui`: assisted only — prepare writes a prompt pack under `assets/generated/requests/`; submit/poll return `WAITING_USER_ACTION` until a file appears in the collect directory
- `omni_ui`: assisted, `final_eligible=false` unless Founder flag later
- `grok_api` / `minimax_api`: interface + fake implementation when no key; live HTTP **off** unless `RUN_LIVE=1`
- `manual`: always available, collect from a drop folder
- Missing key → `available=false`, not process crash

**Out of scope:** headless Grok browser; cookie storage; real MiniMax charge.

**Commit:** `feat(p4): generated asset provider protocol`

---

## P4-T3 Router + budget + planner

**Theme:** Router chooses providers. Planner does not generate pixels.

**In scope:**

- Default preference: `grok_ui` → `minimax_api` → `omni_ui` → `manual`
- Estimate cash **before** any paid `submit`. Over budget → `WAITING_USER_ACTION`, do not call
- Subscription quota on `grok_ui` is not cash; record `subscription_quota_used` separately
- `creator assets plan <slug>` writes `plans/asset-plan.json`
- Planner v0 may be rule-based (0–2 generation slots from transcript duration / explicit default). No requirement to call an LLM
- Open transitions: `TRANSCRIBED → ASSET_PLAN_READY | WAITING_USER_ACTION | FAILED`
- Re-running plan on `ASSET_PLAN_READY` is allowed and must not wipe collected assets

**Out of scope:** edit-plan; Remotion; publishing.

**Acceptance:** a plan document lists provider_preference in constitution order. Budget helper refuses a 20 CNY estimate when project cash budget is 10.

**Commit:** `feat(p4): asset planner and provider router`

---

## P4-T4 Generate CLI + test gate

**Theme:** `creator assets generate <slug>` routes and stays fail-soft.

**In scope:**

- CLI generate: execute plan through router
- Assisted path writes request pack + event `waiting_user_action` and does **not** mark assets final
- When collect folder already has a file matching the request id, record it in `assets/manifest.json` and allow `ASSETS_READY` if all required requests are satisfied or skipped
- Fake providers cover tests without network
- Default `pnpm test` never hits xAI or MiniMax
- Open transitions: `ASSET_PLAN_READY → ASSETS_READY | WAITING_USER_ACTION | FAILED`

**Acceptance:**

```bash
creator assets plan <slug>
creator assets generate <slug>
```

With fake/assisted: plan exists, no cash spent, tests green.

**Forbidden:** P5 ffmpeg/Remotion render; storing API keys in repo; treating Omni output as final by default; collapsing `grok_ui` into `grok_api`.

**Commit:** `test(p4): provider routing and assisted generate`

---

## P4 done means

```text
[ ] five provider ids exist behind one interface
[ ] grok_ui ≠ grok_api in code and comments
[ ] asset-plan.json can be routed
[ ] no live paid call in default tests
[ ] no preview.mp4 yet
```
