# BATCH P9 — Director Layer + REN Style Foundation

**Status:** READY FOR FOUNDER-LED IMPLEMENTATION  
**Depends on:** P0–P8 engineering closed  
**Design source:** `docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md`

This batch adds the missing personal creative-asset layer without replacing the existing V3 pipeline.

## Batch goal

Make this path real:

```text
Frozen Script + transcript/media/assets + REN Style OS
                        ↓
                 Director Plan
                        ↓
                 existing Edit Plan
                        ↓
              FFmpeg / Remotion preview
                        ↓
             Founder review decisions
```

The first P9 implementation must remain agent/vendor independent. Asta may be the preferred Director during real use, but the repository contracts must not require Asta.

---

## Ticket P9.1 — Director + Style contracts

Create typed contracts and persistence for the new layer.

Required concepts:

- semantic role enum (`HOOK`, `CLAIM`, `PROBLEM`, `PROOF`, `DEMO_ACTION`, `RESULT`, `CONTRAST`, `CONCEPT`, `TRANSITION`, `CTA`);
- `DirectorPlan` and segment decisions;
- `StyleManifest` / style version reference;
- allowed / forbidden visual choices;
- caption mode + emphasis;
- motion ID;
- reason + confidence;
- source-script identity/hash so a changed frozen script invalidates stale Director Plans;
- project-store read/write helpers.

Suggested project paths:

```text
content/frozen-script.md
plans/director-plan.json
review/director-decisions.json
```

Do not make Markdown the runtime state source. The frozen script may remain human-readable content, but Director Plan and review decisions must be structured.

Acceptance:

- schemas validate good fixtures and reject invalid semantic roles / time ranges / unsupported plan references;
- stale-plan invalidation is deterministic;
- no LLM/provider dependency is needed for tests.

---

## Ticket P9.2 — REN Style OS v1 data model

Upgrade the current `brand/v1.0` concept into a versioned style system without inventing a fake final aesthetic.

Add structured slots for:

```text
editing grammar
visual grammar
motion grammar
caption grammar
reference metadata
quality gates
```

Recommended shape:

```text
brand/v1.0/
  brand.json
  tokens/
  prompts/
  style/
    editing-grammar.json
    visual-grammar.json
    motion-library.json
    caption-rules.json
    quality-gates.json
    references.schema.json or equivalent typed contract
```

Human-readable companion notes are allowed, but structured files are authoritative for execution.

Rules:

- no arbitrary new visual identity should be frozen by Codex;
- unknown Founder choices remain explicit TODO / `status=unfrozen`;
- current tokens/templates remain backward compatible;
- motion IDs and visual pattern IDs are stable identifiers, not renderer-specific names;
- renderer mapping lives behind adapters/components.

Acceptance:

- existing brand loads still pass;
- Style OS can be resolved by version;
- at least one fixture demonstrates semantic editing rules and forbidden choices;
- all unfrozen aesthetic values are visibly marked rather than hallucinated.

---

## Ticket P9.3 — Style-aware Director Planner seam

Add a Director seam that converts the frozen script + existing understanding/assets + Style OS into a structured Director Plan.

The first implementation should support two paths:

1. **manual/imported Director Plan** — production-safe baseline;
2. **DirectorAdapter interface** — allows Asta or another strong agent to generate the same contract outside/through a future adapter.

Do not hardcode one model vendor.

The planner must preserve the separation:

```text
script = content truth
Director Plan = visual interpretation
Edit Plan = executable timeline
```

Required behavior:

- semantic role decisions attach to script/transcript ranges;
- choices are constrained by Style OS allowed/forbidden patterns;
- Director Plan can flag `SCRIPT_VISUAL_RISK` without silently rewriting content;
- existing rule-based edit planner remains a fallback and current V3 projects remain renderable;
- a Director Plan can influence layout, caption emphasis, zoom/focus, evidence/B-roll policy and approved motion slots without creating a second renderer-owned timeline.

Acceptance:

- one fixture produces a Director Plan from imported/manual input;
- one existing edit-plan fixture can be augmented/derived from it;
- forbidden decorative B-roll on a `PROOF` segment is rejected or gated;
- no regression to current FFmpeg/Remotion preview path.

---

## Ticket P9.4 — Director QA + Founder Decision Dataset + Golden Set seed

Add the review loop that turns Founder corrections into durable personal assets.

Required structured review record should support:

- project / preview identity;
- director segment ID;
- AI/Director proposed choice;
- Founder action: `ACCEPT`, `REJECT`, `CHANGE`;
- reason;
- replacement pattern / motion / visual choice when supplied;
- whether this decision is project-local or a candidate reusable style rule;
- explicit Founder approval before any reusable rule is promoted into Style OS.

Add a first Golden Set mechanism using fixtures or Founder-approved examples.

Metrics should include at least:

- hard-rule violations;
- semantic-role agreement where reference exists;
- visual-choice agreement where reference exists;
- caption/motion rule compliance;
- **Founder Edit Distance** (define a simple deterministic v1 metric; do not pretend it is perceptual truth).

Acceptance:

- review decisions persist and can be reported;
- no automatic mutation of Style OS occurs without Founder approval;
- Golden Set can compare two Director Plan outputs against the same approved reference;
- report shows rule failures separately from subjective/director differences.

---

# Batch-wide hard constraints

1. Do not rebuild OpenMontage.
2. Do not move topic/research/content strategy into this repository.
3. Do not make Asta/GPT/Claude/Codex a hard runtime dependency.
4. Do not replace FFmpeg + Remotion production foundations in P9.
5. HyperFrames/video-use/SmartSub may be studied or later adapted, but are not sources of truth.
6. Do not create a second visual timeline outside `Director Plan → Edit Plan`.
7. Do not let renderers invent style decisions.
8. Do not silently rewrite the frozen script.
9. Do not auto-promote Founder feedback into reusable style rules without explicit approval.
10. Preserve existing P0–P8 tests and current project compatibility.

# Founder gate after P9

Do not call P9 complete merely because schemas compile.

The gate is one real video:

```text
real frozen script
+ real footage/demo
+ initial Style OS
→ Director Plan
→ Edit Plan
→ Preview
→ Founder review
→ decision record
```

P9 passes only if the Founder can identify and correct director decisions at the semantic/visual level without manually reconstructing the whole timeline.
