# Founder Decision — Director Layer + REN Style OS

**Date:** 2026-09-07  
**Status:** FROZEN FOR NEXT IMPLEMENTATION BATCH  
**Repository:** `renjianxin929-ux/creator-pipeline`

This decision is a post-V3 enhancement. It does **not** replace or rewrite `docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md`.

## 1. Problem being solved

Creator Pipeline V3 already has the post-production skeleton: ingest → understand → asset plan → edit plan → FFmpeg/Remotion → preview → Founder approval → export/publish-prepare.

The missing layer is not another video tool. The missing asset is the Founder's own reusable creative system:

- personal editing judgment;
- personal visual language;
- personal motion language;
- caption/emphasis rules;
- reference patterns;
- review/rejection history;
- repeatable quality gates.

The goal is to make the creative result portable across agents. A strong agent may raise the quality ceiling, but the **REN Style OS** must protect the quality floor.

## 2. Frozen architecture decision

Insert a **Director Layer** between the frozen content script and the existing edit plan.

```text
Frozen Script + Raw/Derived Media + Asset Map
                    +
               REN Style OS
                    ↓
             Director Layer
                    ↓
        Visual / Director Plan
                    ↓
             Edit Plan Contract
                    ↓
      FFmpeg / Remotion / other renderers
                    ↓
                 Preview
                    ↓
             Director QA / Founder Gate
                    ↓
         Founder Decision Dataset
                    ↓
               REN Style OS
```

The Director Layer does **not** replace the content script and does not rewrite the thesis by default.

### Script responsibility

The frozen script decides:

- what is said;
- narrative order;
- claims, proof, demo and conclusion;
- final spoken wording.

### Director responsibility

The Director translates the script into visual execution:

- when the viewer sees talking head vs. real demo vs. screenshot vs. B-roll;
- when to hold, cut, punch in or return to speaker;
- what words receive caption emphasis;
- which approved motion pattern is used;
- what must remain visually quiet;
- where real evidence is mandatory;
- what execution agents must not invent.

### Execution-agent responsibility

Execution agents do not redesign the video. They implement the approved Director Plan using replaceable tools and renderers.

## 3. Agent model

Preferred operating model:

```text
Strong Director Agent (Asta or equivalent)
              ↓
       structured Director Plan
              ↓
  ┌───────────┼───────────┐
  ↓           ↓           ↓
Cut Agent  Caption Agent  Motion Agent
  ↓           ↓           ↓
FFmpeg      ASR/Caption   Remotion/HyperFrames/etc.
  └───────────┼───────────┘
              ↓
            Preview
              ↓
      Director QA + Founder Gate
```

Asta is a preferred **Director**, not a hard dependency. The contracts and style assets must remain vendor/agent independent.

The system should aim for this property:

> A stronger model can produce a better first cut, but another compliant agent should still produce a recognizably REN-style result because the style and decision contracts are externalized.

## 4. REN Style OS — durable personal assets

The long-term asset is not a specific model or editing product. It is a versioned style system.

Minimum domains:

### 4.1 Editing Grammar

Semantic rules describing how different content roles are normally edited.

Initial semantic roles should support at least:

- `HOOK`
- `CLAIM`
- `PROBLEM`
- `PROOF`
- `DEMO_ACTION`
- `RESULT`
- `CONTRAST`
- `CONCEPT`
- `TRANSITION`
- `CTA`

Rules must be semantic, not simplistic timing rules such as “cut every 3 seconds”.

Example intent:

```text
PROOF
→ prefer real demo / screenshot / evidence
→ do not cover evidence with decorative B-roll
→ allow evidence-highlight / ui-focus motion only

CLAIM
→ talking head can remain primary
→ allow keyword emphasis
→ avoid immediate decorative cutaway that weakens the claim
```

### 4.2 Visual Grammar

Freeze reusable visual patterns, not only colors and fonts.

Examples:

- hook treatment;
- strong-opinion title;
- quote treatment;
- number/stat treatment;
- real product screenshot treatment;
- comparison card;
- process diagram;
- evidence callout;
- lower third;
- safe-area/layout behavior.

### 4.3 Motion Grammar

Maintain a small approved motion vocabulary rather than generating arbitrary animation every video.

Initial IDs may include placeholders such as:

- `motion.keyword-pop`
- `motion.evidence-highlight`
- `motion.ui-focus`
- `motion.comparison-reveal`
- `motion.process-flow`
- `motion.number-count`
- `motion.screenshot-depth`
- `motion.chapter-transition`

Exact visual implementation remains Founder-approved and versioned.

### 4.4 Caption Grammar

ASR is only recognition. Caption style is a separate asset.

The style system should define:

- semantic chunking;
- max lines / safe area;
- default vs. emphasis vs. quote behavior;
- keyword highlight policy;
- when captions should remain static;
- prohibited “busy” caption patterns.

### 4.5 Reference Library

References are not an unstructured bookmark folder.

Each useful segment should be able to record:

- source/reference identity;
- timestamp range;
- pattern/type;
- why Founder likes it;
- what is reusable;
- what must not be copied;
- linked grammar/motion/template IDs.

References teach the system the Founder’s judgment; they do not become blind style-copy instructions.

### 4.6 Founder Decision Dataset

Every meaningful Founder change should be recordable as data.

Example:

```text
00:04–00:07
AI suggestion: decorative B-roll
Founder: reject
Reason: this is claim establishment; speaker should remain primary
Learned pattern: CLAIM → talking-head priority
```

The review loop should gradually reduce **Founder Edit Distance** rather than merely collecting subjective scores.

## 5. Director Plan contract

The Director must output structured, inspectable decisions rather than vague prose such as “make this more dynamic”.

A segment decision should be able to express fields conceptually equivalent to:

```json
{
  "segment_id": "seg_07",
  "semantic_role": "PROOF",
  "source_range_ms": [21000, 28000],
  "director_intent": "prove the prior claim with real product evidence",
  "primary_visual": "screen_demo",
  "allowed_visuals": ["screen_demo", "screenshot_focus", "evidence_highlight"],
  "forbidden_visuals": ["decorative_broll"],
  "caption_mode": "emphasis",
  "emphasis_text": "文件有没有交出来",
  "motion_id": "motion.ui-focus",
  "reason": "the spoken line is evidence, not an abstract concept",
  "confidence": 0.88
}
```

Exact schema will be implemented in the next batch.

## 6. Script and Director Plan are not competing sources of truth

The script remains the content source of truth.

The Director Plan is a derived **visual execution contract** attached to the frozen script.

Preferred chain:

```text
Content Script
    ↓ freeze
Frozen Script
    +
REN Style OS + media/assets
    ↓
Visual / Director Plan
    ↓
Edit Plan
```

A Director may flag a script segment as visually weak (for example, a long abstract passage with no evidence or visual carrier), but it must not silently rewrite the thesis. Any requested script change returns to the content/Founder layer.

## 7. Golden Set and cross-agent portability

Create a small Golden Set from Founder-approved clips/videos.

Use it to evaluate different Director or execution agents on:

- semantic role recognition;
- real-evidence priority;
- visual choice;
- caption/emphasis compliance;
- approved motion usage;
- brand consistency;
- forbidden-pattern violations;
- Founder Edit Distance.

Target behavior:

- hard rules should be highly consistent across agents;
- style choices may vary within an allowed range;
- high-level director judgment may improve with stronger models;
- switching agents must not destroy the Founder's durable style assets.

## 8. Tool policy

Do not make any of these tools the source of style truth:

- Asta;
- Codex;
- Claude or another LLM;
- Remotion;
- HyperFrames;
- FFmpeg;
- SmartSub / FunASR;
- video-use;
- OpenCut.

They are directors, executors, renderers or reference implementations.

The durable assets are:

```text
REN Style OS
Director Plan Contract
Edit Plan Contract
Reference Library
Founder Decision Dataset
Golden Set
```

## 9. First practical goal

Do not attempt to perfect the whole style before using it.

The first implementation should make it possible to:

1. take one real frozen script and its real media;
2. load a versioned REN Style OS;
3. produce an inspectable Director Plan;
4. derive/augment the existing edit plan without breaking the current V3 pipeline;
5. render a preview;
6. record Founder accept/reject/change decisions;
7. reuse those decisions on the next video.

## 10. Non-goals for the first batch

- do not rebuild OpenMontage;
- do not reintroduce topic/research generation into this repo;
- do not make Asta a mandatory runtime dependency;
- do not redesign the whole Brand Kit in code without Founder references;
- do not replace the existing FFmpeg/Remotion production path;
- do not add OpenCut as production foundation;
- do not make an LLM response the single source of project state;
- do not auto-learn/overwrite style rules without Founder approval.
