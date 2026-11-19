# ADR-010: Store decisions, derive the plan, keep every accepted plan as a revision

**Date:** 2026-11-19
**Status:** Accepted

## Context

A teaching plan changes all the time: an absence, a moved lesson, a re-imported calendar. Gemma wants to see a preview before anything reflows (template 6A #5), and she will only trust the tool if she can undo. Three ways to store the plan were considered. (a) One editable table of "lesson X is in slot Y" plus a log of changes. (b) *Event sourcing*: store every event that ever happened and rebuild the plan by replaying them. (c) Store only her decisions, calculate the rest, and keep a snapshot of each plan she accepts.

## Decision

Option (c). Her decisions are stored as rows: the scheme of work, pins, per-group overrides, disruptions, and each group's position. *Placements* (which lesson sits in which slot) are calculated from those by the engine. Each accepted plan is saved as an immutable *revision*, a snapshot that is never edited, with a pointer to the revision it came from. A change produces a candidate revision and a *diff* (the list of what would move). Accepting makes the candidate the current plan, as long as the plan has not changed in the meantime. Undo goes back to the parent.

## Consequences

- Preview, diff, undo and history all come from this one mechanism.
- The same decisions always give the same plan, which makes the engine easy to test.
- Never moved by a reflow: taught and declared history, today and the next teaching day, pinned lessons, dated assessments, and other courses. A pin or assessment that can no longer be honoured is reported as a conflict for her to decide.
- Moving a card creates a pin and re-sequences the rest, so her edits survive the next reflow.
- Option (a) was rejected because a preview needs a second copy of the table anyway, hand edits get overwritten by re-sequencing, and a log drifts away from the table it describes.
- Option (b) was rejected because a year is only about 1,200 placements. Replay machinery is far more than that needs, and far harder to read.
- Trade-off: snapshots repeat data (small at this size), and a placement cannot be fixed by editing the database by hand. The fix is always a decision.
- Rules out: any change to the plan that she did not accept ([ADR-008](008-ai-provenance-and-human-review.md)).
