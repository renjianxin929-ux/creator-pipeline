# PM protocol

## Why a new repo

The old system mixed topic selection, scraping, scoring, calendars, and rendering.
V3 needs a long-lived post-production core. A new repo is the first decoupling act:
this tree can die or be replaced without dragging the old platform with it.

## Batch cycle

Treat every batch as a normal small development cycle:

```text
PM writes 4 tickets
  → Founder says "start"
  → Codex does T1
  → Codex does T2
  → Codex does T3
  → Codex does T4
  → tests green
  → PM checks scope
  → Founder gate if the batch is R1/R2/R3
  → next batch
```

Codex should not receive the next batch file until the current four tickets are done.

## Four-ticket rule

Each batch file contains exactly four tickets.
Each ticket must satisfy:

1. One theme
2. One independently reviewable commit
3. Runnable acceptance
4. Failure does not force a full restart

If a fifth concern appears, it is either a new batch or a rejection of scope.

## Ticket template

```text
ID:
Theme:
Why this seam exists:
In scope:
Out of scope:
Acceptance:
Forbidden:
Commit message hint:
```

## Decoupling test for any ticket

Ask before coding:

- If MiniMax disappeared tomorrow, would this ticket still make sense?
- If Remotion were swapped for another composer later, would the contract survive?
- If the old social-media repo vanished, could this ticket still be finished?

If the answer is no, the ticket is coupled and must be rewritten.
