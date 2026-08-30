# Founder Addendum — 2026-08-30

The original development contract remains the constitution.
This file only records Founder decisions made after that draft, where the draft and the repo would otherwise conflict.

If this addendum and the original contract disagree, use this order:

1. Product principles, state machine, adapters, gates, bans in the original contract
2. This addendum for repo location, visibility, and batch cadence
3. `docs/tickets/` for the current executable work

---

## A. Repository

Original §4 assumed V3 would start as a directory inside the old platform repo.

Founder override:

- Dedicated repo: `renjianxin929-ux/creator-pipeline`
- Do not rename the repo
- Visibility target: **public**
- Old platform repo is reference only, not a subtree

The spirit of §4 still holds: do not migrate or delete the old system until V3 has a real E2E.

## B. Constitution file

Canonical path:

```text
docs/CREATOR_PIPELINE_V3_DEVELOPMENT_CONTRACT.md
```

That file must be the Founder's original 2026-08-30 text, not a rewrite.

Integrity of the source file used when this addendum was written:

```text
bytes: 40186
sha256: c66aab29f76fc3f1b532d4c87ceb23b95c26e1ea48eb141793245fbe7a11e268
```

## C. Execution cadence

- Each contract slice (P0–P8) is one batch
- Each batch is split into four tickets
- Codex may complete all four tickets of the current batch in one session
- Still one theme per commit
- Do not start the next P-slice inside that session

## D. Still unfrozen from contract §47

Until Founder ticks these explicitly, Codex uses the contract defaults and must not invent new ones:

- Grok UI as default generation path
- ¥10 cash generation budget per video
- Omni draft/reference only
- Preview requires human approval
- First publish batch targets one platform
- Brand Kit versioned, not redesigned per video
- OpenCut reserved, not production foundation
