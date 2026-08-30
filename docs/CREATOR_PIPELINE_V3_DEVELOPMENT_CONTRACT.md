# Creator Pipeline V3 — 开发主合同与施工计划

**状态：DRAFT FOR FOUNDER REVIEW**  
**日期：2026-08-30**  
**执行角色：Codex（唯一 EXECUTOR）**  
**架构/验收 Review：仅在明确 Gate 发生，不设逐 Slice 多模型套娃**  
**目标仓库：沿用现有“拆的懂流水线作业”仓库；新 V3 先与旧系统并存，不破坏旧产物。**

---

# 0. 一句话目标

把旧项目从“AI 内容生产平台”改造成一个长期可复用的 **Creator Post-Production Pipeline**：

> 选题和内容方向由 Founder / Grokbot 决定；Creator Pipeline 接收 Cap 录屏、真人口播、截图、已有素材以及 Grok / MiniMax / Omni 生成素材，自动完成素材理解、粗剪、字幕、品牌包装、预览、导出与发布准备；公开发布前保留 Founder 最终 Gate。

本项目不再试图自动决定“讲什么”，重点解决：

1. 素材进入之后如何自动整理；
2. 如何自动理解口播/录屏；
3. 如何自动生成剪辑计划；
4. 如何用开源工具稳定执行剪辑；
5. 如何按固定品牌系统包装；
6. 如何按需插入 Grok / MiniMax / Omni 生成素材；
7. 如何生成多平台版本；
8. 如何优先走平台 API，API 不可用时走本地已登录浏览器自动化；
9. 如何让整条流水线长期可维护、可替换、可恢复。

---

# 1. Founder 已冻结的产品原则

以下原则是 V3 的默认合同。Codex 不得自行改变。

## 1.1 内容层不进入核心流水线

选题、研究、重大观点判断，不由 Creator Pipeline 自动决定。

来源可以是：

- Founder 手工确定；
- Grokbot 给出候选；
- 现有文章/脚本；
- 临时口播；
- 已经完成的 Markdown / Outline。

Pipeline 只要求得到一个标准 `content-package`，不负责重新做完整选题系统。

---

## 1.2 主体内容优先级

最终成片优先级：

1. 真人口播；
2. 真实产品 Demo / Cap 录屏；
3. 真实截图、网页、代码、数据；
4. 固定品牌资产；
5. Grok / MiniMax / Omni 等生成素材。

生成式视频是增强层，不是主体。

---

## 1.3 生成素材 Provider 优先级

默认策略：

### Grok：主生成 Provider

优先使用 Grok，尤其当 Founder 希望消耗现有 Grok / SuperGrok 订阅额度时。

但必须区分：

- `grok_ui`：使用 Founder 当前 Grok 网页/应用订阅额度；
- `grok_api`：使用 xAI API Key，单独计费。

**这两者不能混为一谈。**

xAI 官方明确说明：Grok 与 xAI API 可以共用账号，但 billing 是分开的。  
因此 V3 默认 `grok_ui` 为主要“订阅额度”路径，`grok_api` 只能作为可选 Provider，不得假设会员额度可直接被 API 消耗。

### MiniMax：正式 Fallback Provider

当出现以下情况时允许升级到 MiniMax：

- Grok 多次生成不合格；
- 需要更稳定的特定镜头；
- 需要更高可控性；
- Founder 明确指定；
- `grok_ui` 当前额度不足；
- Grok 页面链路暂时不可用。

MiniMax 允许产生现金成本。

默认建议：

```json
{
  "generation_cash_budget_cny": 10,
  "max_paid_generation_attempts": 2,
  "allow_over_budget_without_founder": false
}
```

实际价格不得硬编码，Provider 必须支持独立 cost metadata。

### Omni：轻量 / 草稿 / 参考 Provider

Omni 不进入默认最终成片主链。

适合：

- 快速试视觉方向；
- 低成本草稿；
- 简单背景或概念素材；
- 作为 Grok / MiniMax 的参考输入；
- Founder 明确接受水印或该素材只做中间参考。

默认规则：

```text
Omni draft
    ↓
reference asset
    ↓
Grok / MiniMax refine
    ↓
final candidate
```

若 Omni 产物存在水印，默认标记：

```json
{
  "final_eligible": false,
  "reason": "watermark"
}
```

只有 Founder 显式批准，才允许直接进入最终成片。

---

# 2. V3 总架构

```text
Founder / Grokbot
       │
       ▼
CONTENT PACKAGE
       │
       ▼
┌──────────────────────────────────────────────┐
│              CREATOR PIPELINE V3             │
│                                              │
│ Orchestrator + Contracts + State + CLI       │
└──────────────────────────────────────────────┘
       │
       ├─────────────── INPUT ─────────────────────────┐
       │                                               │
       ▼                                               ▼
Cap / Camera / Phone                              Existing Assets
Screen Recording / Talking Head             screenshot / logo / image
       │                                               │
       └──────────────────────┬────────────────────────┘
                              │
                              ▼
                           INGEST
                              │
                              ▼
                    MEDIA PROBE / NORMALIZE
                              │
                              ▼
                    TRANSCRIBE / UNDERSTAND
                    FunClip / FunASR + FFmpeg
                              │
                              ▼
                         ASSET PLANNER
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        Existing         Brand Kit        Generated Asset
                                           Router
                                      ┌──────┼───────┐
                                      ▼      ▼       ▼
                                  Grok UI  MiniMax  Omni
                                      │      │       │
                                      └──────┴───────┘
                                             │
                                             ▼
                                         ASSET POOL
                                             │
                                             ▼
                                         EDIT PLAN
                                             │
                          ┌──────────────────┴──────────────────┐
                          ▼                                     ▼
                       FFmpeg                               Remotion
                  deterministic cuts                   visual composition
                          │                                     │
                          └──────────────────┬──────────────────┘
                                             ▼
                                           PREVIEW
                                             │
                                      HUMAN APPROVAL
                                             │
                                             ▼
                                           EXPORT
                                   9:16 / 16:9 / 1:1
                                             │
                                             ▼
                                      PUBLISH PREPARE
                                             │
                      ┌──────────────────────┼─────────────────────┐
                      ▼                      ▼                     ▼
                  Official API          Local Browser           Manual
                                        Adapter
                              Eagle Eye / Playwright / other
                                             │
                                             ▼
                                          PUBLISHED
```

---

# 3. 技术栈冻结

## 3.1 Orchestrator

建议：

- TypeScript；
- Node.js；
- 一个统一 CLI；
- JSON Schema / Zod 做契约；
- 不使用复杂工作流框架作为 V3.0 基础。

原因：

- Remotion 原生 TypeScript/React；
- 浏览器自动化通常 Node 生态更方便；
- Provider adapter 易于统一；
- 减少“一个阶段一个技术栈”的碎片化。

Python 仅作为必要子进程：

- FunClip / FunASR；
- 个别 Python 视频工具。

Orchestrator 通过稳定 Adapter 调用，不让 Python 状态成为第二事实源。

---

## 3.2 剪辑核心

生产级核心：

- FFmpeg / ffprobe；
- FunClip / FunASR；
- Remotion。

可选：

- Auto-Editor；
- PySceneDetect；
- 其他局部算法。

原则：

> 可选工具可以提升质量，但不能成为整条流水线唯一可运行路径。

---

## 3.3 OpenCut

V3.0 不作为生产地基。

当前官方仓库明确处于 from-scratch rewrite，目标包括：

- Editor API；
- plugin-first architecture；
- Rust core；
- MCP；
- Headless mode；
- Scripting。

这些方向非常适合 V3 的未来，但目前不能假设已经是稳定 production API。

因此只建立：

```text
EditorAdapter
├── remotion      status=production
├── ffmpeg        status=production
└── opencut       status=experimental_stub
```

**不得为了 OpenCut 阻塞 V3.0。**

未来 OpenCut 升级为 PRIMARY 的 Gate：

1. 官方 Headless 可稳定运行；
2. 官方 Editor API 有文档；
3. 项目保存 / reopen 稳定；
4. CLI render 可自动化；
5. 至少 3 次真实项目端到端验证无阻断；
6. 不需要依赖旧 Classic 的脆弱浏览器 hack。

---

# 4. 仓库策略

不要立即大规模移动或删除旧目录。

第一阶段：

```text
existing-repo/
├── [旧项目保持原样]
│
├── creator-pipeline/
│   ├── README.md
│   ├── ARCHITECTURE_V3.md
│   ├── package.json
│   ├── src/
│   ├── brand/
│   ├── templates/
│   ├── tests/
│   └── examples/
│
└── docs/
    └── CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md
```

先通过新目录完成一条真实视频 E2E。

E2E 通过之后，再决定是否把旧项目移动到：

```text
legacy/
```

不要在 V3 尚未跑通时做巨型目录迁移。

建议分支：

```text
feat/creator-pipeline-v3
```

在动旧系统前打 Git tag：

```text
pre-creator-pipeline-v3
```

若仓库已有更严格分支规则，Codex 应遵守仓库实际规则。

---

# 5. 标准项目目录

每一条视频必须只有一个项目目录。

示例：

```text
workspace/
└── projects/
    └── 2026-08-30-workbuddy-demo/
        ├── project.json
        ├── state.json
        ├── events.ndjson
        │
        ├── content/
        │   ├── brief.md
        │   ├── script.md
        │   └── references.json
        │
        ├── raw/
        │   ├── camera/
        │   ├── screen/
        │   ├── audio/
        │   └── misc/
        │
        ├── derived/
        │   ├── media-probe.json
        │   ├── transcript.json
        │   ├── transcript.srt
        │   ├── silence-map.json
        │   └── scene-map.json
        │
        ├── assets/
        │   ├── existing/
        │   ├── generated/
        │   ├── references/
        │   └── manifest.json
        │
        ├── plans/
        │   ├── asset-plan.json
        │   ├── generation-plan.json
        │   └── edit-plan.json
        │
        ├── review/
        │   ├── preview-approval.json
        │   └── asset-decisions.json
        │
        ├── render/
        │   ├── preview.mp4
        │   ├── final-9x16.mp4
        │   ├── final-16x9.mp4
        │   ├── final-1x1.mp4
        │   └── cover.png
        │
        └── publish/
            ├── manifest.json
            ├── records.json
            └── platform/
```

实际项目工作区默认 `.gitignore`。

Git 只保存：

- schema；
- brand templates；
- example fixtures；
- pipeline code；
- docs；
- tests。

不要把真实账号会话、Cookie、成片大文件默认提交 Git。

---

# 6. 单一事实源

V3 不再允许 Markdown handoff 成为事实源。

核心事实：

```text
project.json
state.json
assets/manifest.json
plans/edit-plan.json
review/preview-approval.json
publish/records.json
events.ndjson
```

Markdown 只用于：

- Founder 阅读；
- 开发文档；
- 人类解释；
- 可选报告。

程序状态必须来自结构化文件。

---

# 7. 状态机

建议正式状态：

```text
CREATED
  ↓
INGESTED
  ↓
TRANSCRIBED
  ↓
ASSET_PLAN_READY
  ↓
ASSETS_READY
  ↓
EDIT_PLAN_READY
  ↓
PREVIEW_READY
  ↓
HUMAN_APPROVED
  ↓
EXPORT_READY
  ↓
PUBLISH_READY
  ↓
PUBLISHED
```

辅助状态：

```text
WAITING_USER_ACTION
WAITING_PROVIDER
PARTIAL_PUBLISHED
FAILED
```

规则：

- 每一步幂等；
- 每一步可重新运行；
- 已成功 stage 不得无条件重做；
- 失败必须写入 `events.ndjson`；
- 支持 `resume`；
- 不能要求用户从头跑整条链。

---

# 8. CLI 设计

CLI 建议名称：

```text
creator
```

最低命令：

```bash
creator doctor
creator init <slug>
creator ingest <project>
creator transcribe <project>
creator assets plan <project>
creator assets generate <project>
creator edit plan <project>
creator render preview <project>
creator review status <project>
creator approve <project>
creator export <project>
creator publish prepare <project>
creator publish <project> --platform <name>
creator status <project>
creator resume <project>
```

便利入口：

```bash
creator run <project> --until preview
```

行为：

```text
init
→ ingest
→ transcribe
→ asset plan
→ asset generate/collect
→ edit plan
→ preview
```

到 `PREVIEW_READY` 自动停止。

公开发布不得被 `creator run` 自动越过。

---

# 9. Cap 接入

Cap 不需要 Fork，不需要嵌进项目。

Cap 的定位：

> Capture Adapter / 上游录制软件。

默认使用：

```text
Cap
↓ export
creator-pipeline/inbox/
↓
creator ingest
```

可做一个 Inbox Watcher：

```text
workspace/inbox/
```

检测：

- `.mp4`
- `.mov`
- `.mkv`
- `.wav`
- `.mp3`
- `.png`
- `.jpg`

导入时使用 ffprobe：

- duration；
- fps；
- codec；
- resolution；
- audio track；
- orientation；
- file hash。

禁止用文件名作为唯一 ID。

---

# 10. Transcription / Understanding

首选：

```text
FunClip / FunASR
```

输出必须归一化到自己的 schema，不直接把第三方 JSON 当内部事实源。

标准 transcript segment：

```json
{
  "id": "seg_001",
  "start_ms": 12500,
  "end_ms": 16780,
  "speaker": "spk_0",
  "text": "这里是口播文字",
  "confidence": 0.93
}
```

额外派生：

- silence；
- long pause；
- filler words；
- duplicate/restart candidate；
- chapter candidate；
- emphasis candidate；
- screen-demo candidate。

自动删除不能只依赖 LLM。

硬切前至少满足：

- 时间戳有效；
- 不破坏连续语义；
- 不切断单词/短句；
- 不切除 Founder 标记 `keep=true` 的段。

---

# 11. Asset Planner

Asset Planner 不直接生成素材。

只决定：

```text
哪里需要素材？
需要什么？
为什么？
可以用真实素材吗？
需要生成吗？
允许多少钱？
候选 Provider 是谁？
```

标准示例：

```json
{
  "asset_id": "asset_req_004",
  "timeline_hint": {
    "start_ms": 18000,
    "end_ms": 23500
  },
  "purpose": "concept_broll",
  "priority": "medium",
  "description": "表现 Agent 自动协调多个企业系统",
  "preferred_source": "generated",
  "fallback_source": "brand_motion",
  "generation": {
    "provider_preference": [
      "grok_ui",
      "minimax_api"
    ],
    "max_attempts": 2,
    "cash_budget_cny": 4
  }
}
```

---

# 12. Generated Asset Provider Protocol

统一接口，不允许上层写死厂商。

建议概念：

```ts
interface GeneratedAssetProvider {
  id: string;
  capabilities(): Promise<ProviderCapabilities>;
  prepare(request: AssetGenerationRequest): Promise<PreparedRequest>;
  submit(request: PreparedRequest): Promise<GenerationJob>;
  poll(job: GenerationJob): Promise<GenerationStatus>;
  collect(job: GenerationJob): Promise<GeneratedAsset>;
}
```

Provider 可声明：

```json
{
  "automation": "api | browser | assisted | manual",
  "supports_text_to_video": true,
  "supports_image_to_video": true,
  "supports_reference": true,
  "supports_edit_video": false,
  "has_watermark_risk": false
}
```

---

# 13. Grok Provider

## 13.1 grok_ui

默认主 Provider。

用途：

- 使用现有 Grok 订阅额度；
- Founder 平常未充分使用的视频生成额度；
- 主要成片增强镜头。

但是它不是 xAI API。

`grok_ui` 可以有三种实现等级：

### Level A — assisted

V3.0 必须先支持。

Pipeline 自动生成：

```text
prompt
reference images
target duration
aspect ratio
shot purpose
negative constraints
```

然后输出：

```text
WAITING_USER_ACTION
```

Founder / 本地 Agent 在 Grok 页面完成生成，把文件放回指定目录。

### Level B — local browser assisted

允许通过本机已登录的浏览器 Profile 打开对应页面、填充 prompt、上传参考素材。

必须 headful 可见。

任何登录验证、验证码、风控出现：

```text
WAITING_USER_ACTION
```

不能做绕过。

### Level C — browser automation

只有经过真实稳定验证后启用。

依然必须：

- 可单独禁用；
- 失败不影响剪辑系统；
- 不保存 Cookie 到项目；
- 不把账号凭证放 Git；
- 不绕过平台安全机制。

---

## 13.2 grok_api

单独 Adapter。

官方 xAI API 当前已经支持异步视频生成，并支持：

- text-to-video；
- image-to-video；
- reference-to-video；
- edit-video；
- extend-video。

API billing 与 Grok 网页订阅 billing 分离。

因此：

```json
{
  "provider": "grok_api",
  "enabled_by_default": false
}
```

如果以后 Founder 希望 API 自动化优先，再改配置，不改上层。

---

# 14. MiniMax Provider

正式 API Fallback。

支持：

- paid generation；
- task polling；
- cost tracking；
- retry；
- generated asset manifest。

默认只有以下情况使用：

```text
Grok failed
OR Grok unavailable
OR Founder selected MiniMax
OR quality escalation
```

预算规则：

```json
{
  "provider": "minimax_api",
  "cash_budget_cny": 10,
  "max_attempts": 2,
  "hard_stop_over_budget": true
}
```

不得：

- 无限 retry；
- 后台不断重生；
- 把模型价格写死在业务代码。

价格只存在 Provider metadata / config。

---

# 15. Omni Provider

定位：

```text
draft / lightweight / reference
```

默认：

```json
{
  "provider": "omni_ui",
  "final_eligible_by_default": false
}
```

典型链：

```text
Asset Planner
↓
Omni draft
↓
Founder / automated quality check
↓
reference asset
↓
Grok / MiniMax final
```

如果后续 Omni 有稳定、正式、符合条件的 API，可以新增 `omni_api`，但不能改现有 contract。

---

# 16. Asset Manifest

所有素材不论来源统一进入：

```text
assets/manifest.json
```

示例：

```json
{
  "asset_id": "asset_012",
  "type": "video",
  "source": "grok_ui",
  "role": "concept_broll",
  "path": "assets/generated/asset_012.mp4",
  "duration_ms": 5200,
  "has_watermark": false,
  "final_eligible": true,
  "generation": {
    "attempt": 1,
    "cash_cost_cny": 0,
    "subscription_quota_used": true
  },
  "review": {
    "status": "approved"
  }
}
```

Grok subscription 的边际现金成本可以记录为 0，但必须区分：

```text
cash_cost
subscription_quota
api_cost
```

避免预算统计混乱。

---

# 17. Brand Kit：长期核心资产

品牌系统独立版本化：

```text
creator-pipeline/brand/
├── current.json
├── v1.0/
├── v1.1/
└── v1.2/
```

每个版本至少包含：

```text
brand.json

tokens/
  colors.json
  typography.json
  spacing.json
  safe-area.json

logo/
avatar/

covers/
  tutorial.tsx
  opinion.tsx
  deep-dive.tsx
  news.tsx

captions/
  default.tsx
  emphasis.tsx
  quote.tsx

titles/
  hook.tsx
  chapter.tsx
  lower-third.tsx

layouts/
  talking-head.tsx
  screen-demo.tsx
  split-screen.tsx
  screenshot.tsx
  broll.tsx

motion/
  intro.tsx
  transition.tsx
  outro.tsx
  zoom.tsx

prompts/
  image-style.md
  video-style.md

examples/
```

核心原则：

> 每条视频只选择模板和 Override，不重新设计品牌。

项目只需要：

```json
{
  "brand_version": "1.2",
  "cover_template": "tutorial",
  "caption_style": "default"
}
```

---

# 18. Brand Override

允许单条视频微调，但不得污染 Brand Kit。

例如：

```json
{
  "brand_override": {
    "cover_title_size": 88,
    "caption_max_lines": 2
  }
}
```

如果同一种 Override 连续多次被采用：

Founder 再决定是否把它提升为：

```text
brand v1.3
```

---

# 19. Edit Plan：整个系统真正的核心中间产物

LLM 不直接执行剪辑。

LLM 只产生：

```text
edit-plan.json
```

标准示例：

```json
{
  "version": 1,
  "format": "9:16",
  "timeline": [
    {
      "id": "clip_001",
      "source": "raw/screen/demo.mov",
      "source_start_ms": 12000,
      "source_end_ms": 21500,
      "layout": "screen_demo",
      "caption": true,
      "zoom": {
        "enabled": true,
        "x": 0.72,
        "y": 0.31,
        "scale": 1.6
      }
    },
    {
      "id": "clip_002",
      "source_asset_id": "asset_012",
      "start_ms": 9500,
      "layout": "broll",
      "caption": false
    }
  ]
}
```

要求：

- 可校验；
- 可 diff；
- 可重放；
- 可人工改；
- Renderer 不需要 LLM 才能执行。

---

# 20. FFmpeg 职责

FFmpeg 负责确定性工作：

- ffprobe；
- remux；
- codec normalize；
- cut / concat；
- audio normalize；
- silence detection；
- resize / crop；
- basic overlay；
- mux subtitle/audio；
- export compatibility。

不要让 Remotion 承担所有媒体底层工作。

---

# 21. Remotion 职责

Remotion 负责：

- 字幕；
- 标题；
- 品牌模板；
- Logo；
- lower-third；
- chapter；
- screen-demo layout；
- zoom；
- cursor emphasis；
- B-roll；
- screenshot；
- transition；
- CTA；
- cover；
- 多比例 composition。

Remotion 是 V3.0 Production Renderer。

---

# 22. OpenCut Adapter

现在只建契约，不建强依赖。

```text
src/providers/editors/opencut/
├── adapter.ts
└── README.md
```

默认：

```json
{
  "status": "experimental",
  "enabled": false
}
```

不要在 P0–P7 安装一个依赖尚未稳定的 OpenCut stack。

---

# 23. Preview Gate

这是唯一必须保留的人类成片 Gate。

`preview.mp4` 生成后：

```text
state = PREVIEW_READY
```

Pipeline 必须停止。

Founder 审：

- 内容有没有错误；
- 剪辑有没有误删；
- 字幕有没有明显错误；
- 品牌视觉是否正常；
- 生成素材有没有违和；
- 是否有水印；
- 是否可公开。

批准：

```json
{
  "approved": true,
  "reviewed_by": "founder",
  "preview_hash": "...",
  "approved_at": "..."
}
```

只有 hash 对得上的 preview 可以触发最终 export。

Preview 改过后原 approval 自动失效。

---

# 24. Export

至少支持：

```text
9:16
16:9
1:1
```

但不是每次都必须全部导出。

Project config：

```json
{
  "export_targets": [
    "9:16"
  ]
}
```

默认：

- short video → 9:16；
- YouTube 长视频 → 16:9；
- 特殊用途 → 1:1。

同时输出：

- MP4；
- SRT；
- Cover；
- publish metadata。

---

# 25. Publishing 总原则

Publisher 只能消费：

```text
EXPORT_READY
+
HUMAN_APPROVED
```

Publisher 架构：

```text
PublisherAdapter
├── official_api
├── local_browser
└── manual
```

任何一个平台发布失败，不得影响其他平台。

状态必须 per-platform：

```json
{
  "youtube": "published",
  "bilibili": "ready",
  "douyin": "failed",
  "wechat_channels": "waiting_user_action"
}
```

---

# 26. Publishing — API First

Codex 必须针对每个平台建立 capability matrix：

```text
platform
official API available?
account permission available?
supports upload?
supports draft?
supports schedule?
supports public publish?
fallback
```

只有官方、当前、可用的 API 才接。

不得“猜一个 API”。

如果平台 API：

- 未开放；
- 账号无权限；
- 能力不足；
- 无法稳定上传；

则自动降级：

```text
local_browser
```

---

# 27. Publishing — Local Browser Fallback

Founder 允许：

- Eagle Eye；
- Playwright；
- 其他本地浏览器执行器；
- 已登录本地 Profile。

设计成：

```text
LocalBrowserPublisherAdapter
```

不要把上层写死成 Eagle Eye。

实现可有：

```text
eagle_eye
playwright
manual_browser
```

---

# 28. Cookie / 登录安全规则

严禁：

```text
cookies.json commit
session token commit
password commit
browser profile commit
```

正确做法：

- 复用本机独立 browser profile；
- 凭证放 OS Keychain / 环境变量 / 本地 secret store；
- `.env` gitignore；
- 项目只保存逻辑 reference；
- Headful 优先；
- 出现验证码 / MFA / 风控 → `WAITING_USER_ACTION`；
- 不做绕过验证码、绕过风控的逻辑。

Browser Adapter 可以坏。

剪辑主链不能因此坏。

---

# 29. Publish Gate

公开发布必须是显式动作，例如：

```bash
creator publish <project> --platform youtube
```

默认不把 `creator run` 设计为直接公开发布。

允许未来增加：

```bash
creator publish <project> --all
```

但执行时仍需：

- preview 已批准；
- final export hash 匹配；
- publisher session available。

---

# 30. Provider / Publisher Fallback 原则

所有外部系统必须 fail-soft：

```text
Grok UI 挂
→ MiniMax / manual

MiniMax 挂
→ WAITING_USER_ACTION

Omni 挂
→ skip

YouTube API 挂
→ local browser

Douyin browser 挂
→ waiting_user_action
```

不得：

```text
一个 Provider 挂
→ 整个项目状态损坏
```

---

# 31. 可观测性

每一步必须记录：

```text
events.ndjson
```

示例：

```json
{
  "ts": "2026-08-30T13:00:00+08:00",
  "stage": "asset_generation",
  "provider": "grok_ui",
  "event": "waiting_user_action",
  "project": "2026-08-30-workbuddy-demo"
}
```

外部调用记录：

- provider；
- request id；
- start/end；
- result；
- retry count；
- cost；
- error class。

但不得记录秘密。

---

# 32. Cost Control

每个项目：

```json
{
  "budget": {
    "generation_cash_cny": 10,
    "used_cash_cny": 0,
    "subscription_generation_count": 0
  }
}
```

Provider Router 必须在付费调用前：

```text
estimate
→ compare budget
→ call
```

超过预算：

```text
WAITING_USER_ACTION
```

不自动扣更多钱。

---

# 33. 质量策略

自动化目标不是“无人剪辑”。

目标：

```text
机器做 80–90% 重复工作
Founder 做最后 10–20% 决策
```

第一阶段重点：

- 去掉空白；
- 保留正确口播；
- 自动字幕；
- 自动标题/品牌包装；
- 录屏重点 Zoom；
- 插 0–2 个生成镜头；
- 快速 preview；
- 多平台 export；
- 发布准备。

不要第一版做：

- 全自动导演；
- 每一帧 AI 理解；
- 自动生成几十个 B-roll；
- 自动决定公共发布内容；
- 全平台无确认直接 publish。

---

# 34. 测试策略

Codex 是唯一 EXECUTOR，但必须写自动测试。

## Unit

测试：

- schema；
- state transitions；
- budget；
- provider routing；
- asset manifest；
- publish state；
- approval invalidation。

## Integration

用 fake provider：

```text
FakeGrokProvider
FakeMiniMaxProvider
FakePublisher
```

不得在普通测试里消费真钱。

## Media fixture

仓库加入一个非常短的小测试视频：

```text
tests/fixtures/sample.mp4
```

必须允许合法提交/体积可控。

若不能提交二进制，测试时程序生成 fixture。

## Live smoke

Live 调用只允许：

```bash
RUN_LIVE=1
```

CI 默认关闭。

## Publish smoke

自动测试不得直接公开发内容。

只允许：

- draft；
- private；
- test endpoint；
- dry-run；
- prepare-only。

---

# 35. Doctor

必须有：

```bash
creator doctor
```

检查：

- Node；
- ffmpeg；
- ffprobe；
- Python；
- FunClip adapter；
- Remotion；
- local workspace；
- brand config；
- provider config；
- publisher config。

输出：

```text
PASS
WARN
MISSING
```

缺少 MiniMax key 不得让整个 doctor FAIL，只应：

```text
WARN minimax disabled
```

---

# 36. 配置

建议：

```text
creator.config.json
```

不含 secrets。

例如：

```json
{
  "workspace": "../creator-workspace",
  "brand": "v1.0",
  "generation": {
    "primary": "grok_ui",
    "fallback": [
      "minimax_api",
      "omni_ui",
      "manual"
    ]
  },
  "editor": {
    "renderer": "remotion"
  },
  "publishing": {
    "strategy": "api_first"
  }
}
```

Secrets：

```text
.env.local
OS Keychain
local browser profile
```

全部 gitignored。

---

# 37. Slice 施工计划

---

## P0 — 事实冻结与新骨架

Codex：

1. 读取旧仓库事实；
2. 不删除旧目录；
3. 创建 tag / 新 branch（遵守仓库已有规则）；
4. 新建 `creator-pipeline/`；
5. 写 `ARCHITECTURE_V3.md`；
6. 建 TypeScript CLI 骨架；
7. 建 schema / state；
8. 建 `doctor`；
9. 建测试框架。

验收：

```text
creator doctor
creator init demo
creator status demo
```

均可运行。

**Gate R1：需要 Review。**

Review 目的只看：

- 有没有偏离本文合同；
- 是否出现双事实源；
- 是否过度设计；
- 是否破坏旧系统。

通过后 Codex 连续施工 P1–P5，不逐刀套娃 Review。

---

## P1 — Intake

实现：

- Cap / camera 文件 ingest；
- hash；
- ffprobe；
- project manifest；
- raw 分类；
- duplicate protection。

验收：

真实 Cap export 能进入项目。

---

## P2 — Transcription

实现：

- FunClip/FunASR adapter；
- standardized transcript schema；
- SRT；
- silence map；
- basic speaker/timestamp support。

验收：

一条真实中文录屏/口播完成 transcript + SRT。

---

## P3 — Brand Kit

把已经定性的品牌资产固化。

实现：

- brand version；
- token；
- caption；
- hook；
- chapter；
- logo；
- cover；
- talking-head；
- screen-demo；
- intro/outro。

要求：

不要凭空重新设计品牌。

Codex 应把旧项目已有品牌资产迁移到新 contract；若缺少某个 token，先建明确 TODO，不擅自改品牌方向。

验收：

同一素材可以换 brand version 重渲染。

---

## P4 — Asset Planner + Provider Protocol

先做 Provider contract。

实现：

```text
grok_ui
grok_api
minimax_api
omni_ui
manual
```

第一阶段允许：

- `grok_ui` 先做 assisted；
- `omni_ui` 先做 assisted；
- `grok_api` / `minimax_api` 若有 key 则 live；
- 没 key 也必须 fake test PASS。

验收：

一个 `asset-plan.json` 可正确路由 Provider。

---

## P5 — Edit Plan + Render

实现：

- rough cut；
- edit-plan schema；
- FFmpeg executor；
- Remotion composition；
- subtitles；
- brand；
- screen demo layout；
- B-roll insertion；
- preview。

验收：

从真实 Cap 视频生成一个可看的 `preview.mp4`。

**Gate R2：需要 Review。**

这一 Gate 做第一次“真视频审片”。

不是只看测试。

Founder 要实际看 preview。

Review 重点：

- 自动粗剪是否真省时间；
- 字幕是否可用；
- 录屏 Zoom 是否自然；
- Brand 是否统一；
- 生成素材是否违和；
- 是否比手工流程明显更快。

不通过则调整，不进入发布自动化。

---

## P6 — Approval + Export

实现：

- preview hash；
- approval；
- invalidate；
- 9:16；
- 16:9；
- optional 1:1；
- cover；
- final SRT。

验收：

未经 approval 无法 export final。

---

## P7 — Publisher

建立 capability matrix。

实现顺序：

```text
官方 API
→ 本地浏览器
→ Manual
```

优先迁移旧 `publish-md-to-wechat` 中仍有价值的能力，但要包进 Publisher Adapter，不让它继续作为独立“第二系统”。

Eagle Eye 只作为：

```text
LocalBrowserPublisherAdapter implementation
```

不是架构依赖。

验收：

至少选 1 个实际常用平台：

```text
export
→ publish prepare
→ upload/draft
```

跑通。

不要一开始同时做 6 个平台。

---

## P8 — Full E2E

必须用一个真实视频：

```text
Grokbot / Founder 内容
→ Cap 录屏
→ ingest
→ transcribe
→ asset plan
→ 至少一个 Grok 生成素材或真实 fallback
→ edit plan
→ preview
→ Founder approve
→ export
→ 一个平台上传/草稿
```

全链写入结构化 evidence。

**Gate R3：Final Review。**

Final Review 通过后，V3 才可以被称为默认日常流水线。

---

# 38. Review 决策

本项目 **需要 Review，但不需要旧式“每一刀多个模型反复审”**。

理由：

- 这是会长期使用的基础流水线；
- 会接外部 API；
- 会花生成费用；
- 会接真实账号发布；
- 有状态恢复问题；
- 剪辑错误会直接进入公开内容。

但逐 Slice 多模型 Review 会让项目再次变成编排工程。

因此冻结：

```text
Codex = 唯一 Executor

R1 = Architecture / Skeleton Review
R2 = First Real Preview Review
R3 = Full E2E / Production Acceptance Review
```

Reviewer 不参与写代码。

Founder 是最终 Gate。

---

# 39. Codex 行为约束

Codex 必须：

- 先读本文；
- 先读现有 repo；
- 以 repo 事实优先；
- 保留旧链直到 V3 E2E；
- 每个 Slice 有测试；
- 每个 commit 只做一个可解释主题；
- 所有外部 Provider 都 adapter 化；
- 所有 secrets 留本地；
- 所有 paid call 有 budget；
- 所有 browser failure 可恢复；
- 所有 stage 幂等；
- 所有真实 publish 必须在批准之后。

Codex 禁止：

- 再造完整选题系统；
- 把 Grok API 当 Grok 会员额度；
- 把 MiniMax 写死到 Edit Planner；
- 把 Omni 水印素材默认当 final；
- 把 OpenCut 当现成 production headless editor；
- 把 Cookie 写进 repo；
- 用 Markdown 状态覆盖 JSON 状态；
- 为了“架构完整”引入 Kafka / Temporal / Kubernetes 等不必要复杂设施；
- 在 P5 preview 没证明价值之前继续堆平台发布能力；
- 大范围重构旧项目后才开始新链。

---

# 40. Definition of Done

V3.0 完成必须同时满足：

```text
[ ] 一个真实 Cap 视频可 ingest
[ ] 中文 transcript 可生成
[ ] SRT 可生成
[ ] edit-plan 可生成且可人工修改
[ ] Brand Kit 有版本
[ ] Remotion preview 可生成
[ ] Grok UI provider 至少 assisted 跑通
[ ] MiniMax provider 接口存在并可测试
[ ] Omni provider 能作为 draft/reference
[ ] 生成预算可限制
[ ] Founder approval 有 hash gate
[ ] 9:16 final 可导出
[ ] 至少一个实际平台 upload/draft 跑通
[ ] API 失败不破坏 project
[ ] browser publisher 失败可 resume
[ ] secrets / cookies 不进 Git
[ ] 完整 E2E 有 evidence
```

---

# 41. V3.1 以后再做

以下明确延后：

- OpenCut production backend；
- 全自动无人工发布；
- 大规模自动 B-roll；
- 自动多语言配音；
- 多 Agent 编排；
- 远程队列；
- 云端分布式渲染；
- 完整团队协作权限；
- 自动内容策略；
- 自动选题；
- 多平台评论运营；
- 自动根据数据反向改内容；
- 复杂资产数据库。

只有真实使用证明需要，再进入。

---

# 42. 未来 OpenCut 升级路径

当 OpenCut 正式满足 Headless / API 条件：

```text
edit-plan.json
      │
      ├── RemotionAdapter
      └── OpenCutAdapter
```

先：

```text
experimental
```

再：

```text
secondary
```

最后：

```text
primary
```

品牌、Provider、Publish、State 全部不动。

这也是为什么 V3 的核心资产必须是：

```text
contracts + edit plan + brand kit
```

而不是某个剪辑软件。

---

# 43. 本项目最重要的架构判断

V3 的长期护城河不是：

```text
用了 Grok
用了 MiniMax
用了 Remotion
```

而是：

```text
Content Package
      ↓
Asset Plan
      ↓
Edit Plan
      ↓
Brand System
      ↓
Renderer Adapter
      ↓
Publisher Adapter
```

任何模型、剪辑器、平台都可以替换。

你的内容生产习惯和品牌系统不用重做。

---

# 44. Codex 第一轮施工指令

把本文交给 Codex 后，第一轮只允许执行 P0。

Codex 完成后必须返回：

```text
1. 读取了哪些现有文件
2. 旧系统哪些路径被识别为 legacy
3. 新增目录结构
4. 状态 schema
5. CLI 命令
6. 测试结果
7. git diff --stat
8. commit hash
9. 风险 / 未决项
```

**P0 不允许：**

- 真调 Grok；
- 真调 MiniMax；
- 真自动发布；
- 大改旧代码；
- 删除旧目录；
- 做 OpenCut 集成；
- 做 UI。

P0 的目的只有一个：

> 建一条不会再散掉的地基。

Founder / Architect 做 R1 Review 后，再让 Codex连续施工 P1–P5。

---

# 45. 大白话版本

这次不要再做一个“大而全 AI 视频平台”。

你以后真正的日常应该接近：

```text
1. 你决定今天讲什么
2. 用 Cap 录
3. 丢进 Creator Pipeline
4. 系统自己转文字
5. 系统先帮你剪掉明显废片
6. 系统判断哪里要截图 / B-roll
7. 需要生成时优先 Grok
8. Grok 不行再 MiniMax
9. Omni 主要做便宜草稿/参考
10. 系统按你的固定品牌自动包装
11. 生成 Preview
12. 你看一次
13. 你点批准
14. 系统导出
15. 平台有 API 就 API 发
16. 没 API 就调你本地已登录浏览器
```

V3 做成之后，真正需要长期维护的是：

```text
Brand Kit
Edit Plan
Provider Adapter
Publisher Adapter
```

而不是不停重做整个视频流水线。

---

# 46. 2026-08-30 外部事实核验

本合同在冻结前参考并核验了以下官方 / 主项目资料：

- xAI Grok Website / Apps 与 xAI API billing 分离：
  https://docs.x.ai/developers/faq/accounts
- xAI Grok Imagine Video generation：
  https://docs.x.ai/developers/model-capabilities/video/generation
- xAI Grok Imagine Video 1.5：
  https://docs.x.ai/developers/models/grok-imagine-video-1.5
- xAI API Billing：
  https://docs.x.ai/console/billing
- MiniMax Pay-as-you-go / Video Pricing：
  https://platform.minimax.io/subscribe/token-plan?tab=api-enterprise
- OpenCut 官方仓库与 Rewrite 状态：
  https://github.com/OpenCut-app/OpenCut
- FunClip：
  https://github.com/modelscope/FunClip
- Remotion：
  https://github.com/remotion-dev/remotion
  https://www.remotion.dev/

注意：

- 价格、API 能力、平台发布接口都可能变化；
- Codex 在实际接 Provider / Publisher 时必须再次读取当前官方文档；
- 不得把本文 2026-08-30 的价格数字作为长期硬编码业务规则。

---

# 47. Founder Review Checklist

Founder 只需要重点确认这几个问题：

```text
A. Grok UI 订阅额度是否确定作为默认生成主路？
B. 默认现金生成预算是否按 ¥10 / 视频？
C. Omni 是否默认只作为 draft/reference？
D. Preview 后是否保留一次人工批准？
E. 第一版发布只先打通一个平台，是否接受？
F. Brand Kit 是否按版本持续迭代，而不是每条重新设计？
G. OpenCut 是否接受“预留接口但暂不进入生产地基”？
```

这些确认后，V3 架构可以冻结。
