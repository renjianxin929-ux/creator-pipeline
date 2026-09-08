# P9.2 — REN Style OS v1 + Style Discovery Foundation

**Status:** READY AFTER P9.1 ARCHITECT PASS  
**Parent batch:** `docs/tickets/BATCH_P9_STYLE_DIRECTOR_FOUNDATION.md`  
**Founder source:** `docs/FOUNDER_DIRECTOR_STYLE_LAYER_DECISION_2026-09-07.md`

This document refines **P9.2 only**. It does not create a fifth P9 ticket. The four sections below are **implementation slices A–D inside P9.2**.

## Goal

Do **not** pretend the Founder already has a fully articulated style.

P9.2 must build a versioned Style OS that can safely hold uncertainty and gradually accumulate real preferences without allowing an agent to invent a fake “REN style”.

Target property:

```text
unknown preference
      ↓
UNSET
      ↓
real candidate/reference/use
      ↓
CANDIDATE
      ↓
repeated real-world evidence
      ↓
OBSERVED
      ↓
explicit Founder approval
      ↓
FROZEN
```

P9.2 defines the data model and loader boundaries for this lifecycle.

P9.2 does **not** implement automatic learning, Founder review actions, Golden Set scoring, or promotion logic. Those remain P9.4 scope.

---

# P9.2A — Style lifecycle + manifest contract

Create the common lifecycle/state contract used by all Style OS domains.

Required statuses:

```text
UNSET
CANDIDATE
OBSERVED
FROZEN
```

Semantics:

- `UNSET`: no Founder preference is claimed; agents may make project-local choices but must not describe them as Founder style.
- `CANDIDATE`: a plausible reusable rule/pattern exists but is not Founder-approved.
- `OBSERVED`: the pattern has appeared repeatedly in real references or real Founder-approved outputs, but is still not a hard rule.
- `FROZEN`: Founder explicitly approved; downstream Director/Executor must treat it as durable Style OS truth.

Hard rule:

**No code path in P9.2 may automatically promote a style item to `FROZEN`.**

Add a versioned Style OS manifest resolved from the existing `brand/v1.0` system.

Recommended paths:

```text
brand/v1.0/style/
  manifest.json
  editing-grammar.json
  visual-grammar.json
  motion-library.json
  caption-rules.json
  quality-gates.json
  references.json
  reference-inbox.json
```

The Style OS must remain backward compatible with the existing Brand Kit. Existing Brand Kit loading must continue to work even if style files are absent or all items are `UNSET`.

Acceptance:

- lifecycle schema validates the four statuses and rejects arbitrary states;
- style version is resolved independently of any model/vendor;
- missing/unfrozen domains are explicit and legal;
- no implicit default is interpreted as a Founder preference;
- existing brand tests continue to pass.

---

# P9.2B — Grammar domain contracts

Add structured contracts for the five durable style-rule domains below.

## 1. Editing Grammar

Rules are semantic, not simplistic timing instructions.

A rule should support fields conceptually equivalent to:

```json
{
  "id": "editing.proof.real-evidence-first",
  "status": "CANDIDATE",
  "applies_to": ["PROOF"],
  "rule": "Prefer real demo, screenshot, or result evidence over decorative B-roll.",
  "allowed_visuals": ["visual.proof.real-demo"],
  "forbidden_visuals": ["visual.proof.decorative-broll"],
  "why": "Evidence segments exist to establish credibility.",
  "evidence_refs": ["ref_001"]
}
```

Do not seed a complete personal editing style in code.

## 2. Visual Grammar

Define reusable visual-pattern IDs and their usage boundaries.

Examples may exist as IDs/placeholders, but visual implementation remains `UNSET` unless Founder-approved.

Potential pattern namespaces:

```text
visual.hook.*
visual.claim.*
visual.proof.*
visual.contrast.*
visual.concept.*
visual.result.*
```

A visual pattern may describe:

- purpose;
- applicable semantic roles;
- layout intent;
- information-density limits;
- whether title/caption/motion is allowed;
- forbidden overlays/behaviors;
- implementation status.

Do not freeze colors, fonts, positioning, motion timing, or aesthetic implementation without Founder evidence.

## 3. Motion Grammar

Define a small stable vocabulary of motion IDs independent from renderer implementation.

Candidate placeholder IDs may include:

```text
motion.keyword-pop
motion.evidence-highlight
motion.ui-focus
motion.comparison-reveal
motion.process-flow
motion.result-hold
motion.chapter-transition
```

These IDs define **purpose**, not the final animation look.

Every motion item must be able to remain `UNSET` or `CANDIDATE` at the implementation level.

## 4. Caption Grammar

Separate recognition from style.

Contract should support rules such as:

- semantic chunking policy;
- line-count bounds;
- default/emphasis/quote behavior;
- keyword-emphasis limits;
- demo safe-area constraints;
- prohibited busy-caption patterns.

Do not hardcode a final Founder caption style if it has not been approved.

## 5. Quality Gates

Quality Gates are hard prohibitions or required checks, not taste scores.

Initial items may be `CANDIDATE` unless already Founder-frozen.

The contract should distinguish:

- hard gate vs advisory rule;
- applicable semantic roles/domains;
- status;
- reason.

Acceptance:

- all rule IDs are stable and renderer/vendor independent;
- all domains can be empty or contain `UNSET` items;
- no grammar forces invented aesthetics;
- semantic-role links reuse the P9.1 semantic role contract;
- visual/motion IDs remain compatible with the P9.1 Director Plan identifiers.

---

# P9.2C — Reference Library + Reference Inbox

Create two separate structures.

## Reference Inbox

Purpose: extremely low-friction capture when the Founder only knows “this part looks/feels good” but cannot yet explain why.

An inbox item should support:

```json
{
  "id": "inbox_001",
  "source": "...",
  "timestamp_start": "00:18",
  "timestamp_end": "00:25",
  "founder_note": "I like how this switches from speaker to demo.",
  "status": "UNANALYZED"
}
```

Keep this intentionally lightweight.

P9.2 must not require the Founder to fill detailed taxonomy before saving a reference.

## Reference Library

A promoted/analyzed reference should support:

- stable reference ID;
- source identity or URL/text locator;
- timestamp/range when applicable;
- category/pattern;
- neutral description of what happens;
- Founder note / why it was saved;
- reusable aspects;
- explicit `do_not_copy` aspects;
- linked grammar/visual/motion IDs;
- lifecycle status;
- provenance / manually supplied analysis vs later agent analysis.

Hard boundaries:

- storing a reference does not freeze a style rule;
- analyzed references may support `CANDIDATE`/`OBSERVED` evidence only;
- no blind style-copy instruction;
- no web scraping/downloading implementation is required in P9.2;
- no automatic reference analysis model/provider is required.

Acceptance:

- empty inbox/library is valid;
- an inbox item can exist with only source + minimal Founder note;
- a formal reference can link to style rules without mutating them;
- references can explicitly record what must not be copied.

---

# P9.2D — Style loader/resolution + first neutral seed

Add repository loaders/resolvers for Style OS versions.

Required behavior:

```text
brand/current.json
      ↓
brand/v1.0
      ↓
brand/v1.0/style/manifest.json
      ↓
resolved Style OS snapshot
```

The resolved Style OS must be deterministic and immutable to callers.

## Neutral seed policy

Create only enough seed data to prove the system works.

Allowed seed categories:

1. structural placeholders;
2. rules already explicitly implied by Founder-frozen architecture;
3. conservative `CANDIDATE` examples used as fixtures/tests;
4. explicit `UNSET` items showing unknown aesthetic implementation.

Do **not** claim that candidate seed values are Founder-approved.

Good seed example:

```text
editing.proof.real-evidence-first
status=CANDIDATE
```

because the Founder decision already repeatedly states that real evidence should not be replaced by decorative B-roll.

Good UNSET example:

```text
motion.keyword-pop
status=UNSET
implementation_status=UNSET
```

because the exact animation has not been chosen.

Do not seed a full hook style, font system, motion timings, transition language, or other aesthetic details without real Founder evidence.

Acceptance:

- `loadStyleOS(version)` or equivalent resolves a structured snapshot;
- existing Brand Kit API remains backward compatible;
- one test demonstrates a `CANDIDATE` semantic rule;
- one test demonstrates an `UNSET` visual/motion implementation;
- empty references/inbox load successfully;
- no model/provider dependency;
- no P9.3 planner behavior is implemented.

---

# Cross-slice invariants

1. P9.2 builds **Style Discovery Foundation**, not a fabricated final style.
2. `FROZEN` always means explicit Founder approval; P9.2 never self-promotes.
3. `UNSET` is a first-class valid state, not an error.
4. Project-local Director choices do not automatically become Style OS rules.
5. References are evidence, not style truth.
6. Renderer/tool implementation is replaceable and never appears as the durable style identity.
7. P9.2 must not implement Founder review actions, automatic learning, Golden Set scoring, Founder Edit Distance, or reusable-rule promotion. Those are P9.4.
8. P9.2 must not implement Director generation or Edit Plan derivation. Those are P9.3.
9. Existing P0–P9.1 behavior and tests must remain compatible.
10. Do not redesign the existing Brand Kit merely to make the Style OS look complete.

# P9.2 closure gate

P9.2 is complete when the repository can truthfully represent all of these states at once:

```text
- a known candidate editing rule;
- an observed-but-not-frozen rule;
- an explicitly unknown visual/motion implementation;
- an empty reference inbox;
- a lightly captured reference-inbox item;
- a formal analyzed reference;
- a quality gate that is not automatically promoted;
- a resolved Style OS snapshot by version.
```

The gate is **not** “REN style is finished”.

The correct outcome is:

> the repository is now capable of discovering, storing, validating, and later freezing REN style without inventing it.

After P9.2 implementation, stop for Architect Review before P9.3.