# AI Teacher Planner M2: IAL Unit 4 End to End

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemma reviews and locks the IAL Unit 4 pack, imports her planning sheet, says where 13 1, 13 3 and 13 5 are, and accepts a dated plan for all three that keeps them level, with spare lessons before each assessment. She keeps it true with a weekly check-in and can export a fortnight.

**Architecture:** The sequencer is a pure function from facts and decisions to a plan snapshot. Accepted snapshots are immutable revisions. AI sits behind one port with a fake provider for tests and a Claude Code CLI adapter for real use; its output is stored as reviewable items with provenance.

**Tech Stack:** As the index. New and not proven by spike: `pdfjs-dist`, `mammoth`, `docx` (test fixtures only in this milestone).

**Spec:** sections 10.3 to 10.9, 10.12, 11, 12, 15 and appendix D of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md).

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here.

## Review Focus

1. **Three weeks without opening the app.** Tasks 2.4 and 2.18.
2. **A proposal accepted after the plan changed.** Task 2.12.
3. **Claude missing, signed out, slow, or returning invalid data.** Tasks 2.8 and 2.9.
4. **A lesson count is cut below what has already been taught.** History is kept; nothing already delivered is planned again. Task 2.4.
5. **A planning sheet whose numbers do not add up, or whose count cell holds a note.** Her real sheet has both: "5 (started in Y12)", and a stated total of 65 against chapters that sum to 70. The import keeps both numbers and says so. Task 2.13.

## The test world

Tasks 2.2 to 2.5 share one small world, exported from `@planner/fixtures` as `paceWorld()`. It uses the synthetic calendar, the seed timetable and the three Year 13 groups, with `today` 2026-11-09.

Scheme, in order: `c1` teaching, 3 lessons; `c2` teaching, 3 lessons; `a1` assessment, dated 2026-11-27, whole slot; `c3` teaching, 4 lessons; `c4` teaching, 2 lessons. Every group's position is `c1#1`.

Open slots from 2026-11-09 to the end of block T1b (2026-12-22), by date:

| Group | Before its `a1` slot | `a1` slot | After, to 22 Dec |
|---|---|---|---|
| 13 1 | 9, 11, 13, 16, 18, 20, 23, 25 Nov (8) | Fri 27 Nov P6 | 10 slots |
| 13 3 | 10, 12, 12, 17, 19, 19, 24, 26, 26 Nov (9) | Tue 1 Dec P5 | 9 slots |
| 13 5 | 10, 12, 13, 16, 17, 19, 24, 26 Nov (8) | Fri 27 Nov P4 | 10 slots |

Six lessons are due before `a1`. Slack is 2, 3 and 2, so two more lessons (`c3#1`, `c3#2`) are brought forward for everyone, and 13 3 has one spare lesson, in its last slot before the assessment: `13 3|2026-11-26|4`.

---

### Task 2.1: Scheme of work and lessons

**Files:**
- Create: `packages/domain/src/scheme.ts`, `scheme.test.ts`, `lessons.ts`, `lessons.test.ts`, `provenance.ts`, `provenance.test.ts`
- Create: `fixtures/src/pace-world.ts`

**Interfaces:**
- Produces: `scheme.ts` and `lessons.ts` as in the index contract, `paceWorld(): PlanInputs`, and:

```ts
export function defaultDuration(board: "IAL" | "IB" | "IGCSE", marks: number | null): number | null;   // IAL: marks * 1.5, else null
export function defaultSlotUse(durationMinutes: number | null): "whole" | "in-lesson";                 // null or 30 and over: "whole"
export interface SchemeTotals { teaching: number; project: number; revision: number; buffer: number; assessmentSlots: number; assessmentsInLesson: number }
export function schemeTotals(items: readonly SowItem[], overrides: readonly GroupOverride[], groupId: GroupId): SchemeTotals;
export function weeksFor(lessons: number, lessonsPerFortnight: number): number;                        // one decimal place
export function validateScheme(items: readonly SowItem[]): string[];
export const ENGINE: Provenance; export const TEACHER: Provenance; export const IMPORTED: Provenance;
export function exportable<T extends { provenance: Provenance }>(items: readonly T[]): { included: T[]; excluded: T[] };
```

- [ ] **Step 1: Write the failing tests**

```ts
test("a 12-mark IAL question takes 18 minutes and sits inside a lesson", () => {
  expect(defaultDuration("IAL", 12)).toBe(18);
  expect(defaultSlotUse(18)).toBe("in-lesson");
});
test("30 minutes and over takes a whole slot; an unknown length takes a whole slot", () => {
  expect(defaultSlotUse(30)).toBe("whole"); expect(defaultSlotUse(29)).toBe("in-lesson"); expect(defaultSlotUse(null)).toBe("whole");
});
test("expandLessons numbers each item's lessons from 1", () =>
  expect(expandLessons(world.items, [], "13 1", "core").slice(0, 4).map(l => l.id)).toEqual(["c1#1", "c1#2", "c1#3", "c2#1"]));
test("an assessment is not a lesson", () => expect(lessonIds).not.toContain("a1#1"));
test("an override changes one group's count and nobody else's", () => {
  const o = [{ groupId: "13 3", itemId: "c3", lessons: 3 }];
  expect(expandLessons(world.items, o, "13 3", "core").filter(l => l.itemId === "c3")).toHaveLength(3);
  expect(expandLessons(world.items, o, "13 1", "core").filter(l => l.itemId === "c3")).toHaveLength(4);
});
test("only the group's track is expanded", () => { /* an hl item is absent for track core */ });
test("totals keep teaching and assessments apart", () =>
  expect(schemeTotals(world.items, [], "13 1")).toEqual({ teaching: 12, project: 0, revision: 0, buffer: 0, assessmentSlots: 1, assessmentsInLesson: 0 }));
test("weeksFor a six-lesson chapter in a group with six lessons a fortnight is 2", () => expect(weeksFor(6, 6)).toBe(2));
test("weeksFor 4 lessons at 5 a fortnight is 1.6", () => expect(weeksFor(4, 5)).toBe(1.6));
test("validateScheme refuses duplicate ids, a negative count, an assessment without a spec, and a prerequisite that does not exist", () => {});
test("unreviewed and rejected AI items are not exportable; accepted and edited ones are", () => { /* four AI items and one engine item: included 3, excluded 2 */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL, nothing is exported yet.
- [ ] **Step 3: Implement.** `expandLessons` sorts by `order`, skips assessment items and items of another track, and applies the group's overrides. An override of 0 removes the item for that group.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(domain): scheme of work, lessons and provenance`

---

### Task 2.2: The sequencer for one group

**Files:**
- Create: `packages/domain/src/plan.ts`, `sequence.ts`, `sequence.test.ts`, `sequence.prop.test.ts`

**Interfaces:**
- Consumes: `Slot`, `Lesson`, `expandLessons`, `paceWorld`.
- Produces: `plan.ts` as in the index contract and `sequence(inputs: PlanInputs): PlanSnapshot`. This task handles one group at a time with no pace line: each group's lessons simply fill its own earliest slots. Task 2.3 adds the pace line; Task 2.4 adds history and the freeze horizon.

- [ ] **Step 1: Write the failing tests.** Each uses `paceWorld()` cut down to group 13 1 unless it says otherwise.

```ts
test("lessons fill the earliest open slots in scheme order", () =>
  expect(placed("13 1").slice(0, 4)).toEqual([["c1#1", "13 1|2026-11-09|5"], ["c1#2", "13 1|2026-11-11|2"], ["c1#3", "13 1|2026-11-13|6"], ["c2#1", "13 1|2026-11-16|5"]]));
test("a position starts the stream there and declares everything before it", () => { /* nextLessonId c1#3: c1#1 and c1#2 are declared with slotKey null; c1#3 is on 9 Nov */ });
test("a done-list declares an item taught out of order", () => { /* doneItemIds ["c2"]: c2 lessons declared; c3#1 follows c1#3 */ });
test("a position of null means the course is finished", () => { /* every lesson declared, nothing planned */ });
test("a dated whole-slot assessment takes the group's first open slot on or after its date", () =>
  expect(snapshot.assessments).toContainEqual({ groupId: "13 1", itemId: "a1", slotKey: "13 1|2026-11-27|6", slotUse: "whole" }));
test("no lesson shares a slot with a whole-slot assessment", () => expect(lessonAt("13 1|2026-11-27|6")).toBeUndefined());
test("an in-lesson assessment is attached to the slot and a lesson is still taught there", () => { /* a1 with durationMinutes 18: assessments has slotUse "in-lesson" and a lesson is placed in the same slot */ });
test("an assessment with no slot within seven days is a conflict", () => { /* a1 dated 2026-12-23: next 13 1 slot is 2027-01-08 */
  expect(snapshot.conflicts).toContainEqual({ kind: "assessment-no-slot", groupId: "13 1", itemId: "a1", date: "2026-12-23" }); });
test("an undated assessment is placed in scheme order, after the lessons before it", () => { /* a1 date null: it takes the slot after c2#3 */ });
test("a sat assessment is not planned again", () => { /* status "sat": no AssessmentPlacement */ });
test("a slot pin fixes a lesson and the rest flow around it", () => { /* pin c2#1 to 13 1|2026-11-09|5: c1#1 moves to 11 Nov; the pinned placement has pinned true */ });
test("a pin to a cancelled slot is a conflict and the lesson stays in the stream", () =>
  expect(snapshot.conflicts).toContainEqual(expect.objectContaining({ kind: "pin-slot-unavailable", lessonId: "c2#1" })));
test("a pin to another group's slot is a conflict", () => {});
test("a not-after deadline that is met changes nothing", () => {});
test("a not-after deadline that is missed is a conflict with the planned date, and nothing is reordered", () => { /* c2#2 not after 2026-11-17 */
  expect(snapshot.conflicts).toContainEqual(expect.objectContaining({ kind: "not-after-missed", lessonId: "c2#2", plannedDate: "2026-11-18" })); });
test("merged lessons share one slot", () => { /* merge c1#2 with c1#3: both on 11 Nov, c1#3.mergedInto is c1#2, c2#1 is on 13 Nov */ });
test("cancelled slots are skipped", () => { /* 11 Nov cancelled: c1#2 is on 13 Nov */ });
test("a cover slot is used and marked", () => { /* 11 Nov status cover: c1#2 placed there with viaCover true */ });
test("what does not fit in the year is overflow at the last checkpoint", () => { /* c4 with 400 lessons */
  expect(snapshot.overflow.at(-1)?.lessonIds.length).toBeGreaterThan(0); });
test("slots left after the last lesson become spare lessons", () => { /* ids start "flex:13 1:" */ });
```

```ts
// sequence.prop.test.ts (fast-check over random counts, positions, pins, merges and cancelled slots)
// - each lesson is placed at most once
// - at most one lesson per slot, except a merged pair
// - no placement is on a cancelled slot, and none is on another group's slot
// - unpinned lessons appear in scheme order when read in slot order
// - for each group: planned + declared + overflow + absorbed lessons = lessons in its expanded scheme
// - every pin is honoured or appears in conflicts
// - shuffling items, slots, pins, merges and positions in the input gives a deep-equal snapshot
```

- [ ] **Step 2: Run them.** Expected: FAIL, `sequence` is not defined.

- [ ] **Step 3: Implement** `sequence` for independent groups:
  1. Per group, build the stream: `expandLessons`, minus declared lessons (everything before `nextLessonId`, plus `doneItemIds`), minus slot-pinned lessons.
  2. Usable slots are those with status `open` or `cover`, dated on or after `today`, sorted by date then period.
  3. Reserve each slot pin's slot, or record the conflict and return the lesson to the stream.
  4. Reserve each dated, planned, whole-slot assessment's anchor: the first usable, unreserved slot on or after its date, if it is at most seven days later. Record in-lesson anchors without reserving.
  5. Stream the lessons into the remaining slots in order. A merged pair takes one slot. An undated whole-slot assessment takes the next slot when the stream reaches its place in the scheme.
  6. Check not-after pins against where their lessons landed.
  7. Left-over slots become spare lessons; left-over lessons become overflow at the last checkpoint.
  8. Sort every array in the snapshot by group, then slot or lesson id.

  `checkpoints` in this task holds the dated assessments and one `block-end` per teaching block that ends on or after `today`, sorted by date.

- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(domain): sequence lessons onto slots with anchors, pins and merges`

---

### Task 2.3: The pace line and spare lessons

**Files:**
- Create: `packages/domain/src/pace.ts`, `pace.test.ts`, `pace.prop.test.ts`, `schedule.steps.test.ts`
- Create: `features/05-schedule-from-documents.feature`
- Modify: `packages/domain/src/sequence.ts`

**Interfaces:**
- Consumes: the single-group sequencer of Task 2.2.
- Produces: `sequence` now plans groups of one track together. No signature changes. From `pace.ts`:

```ts
export interface WindowPlan { checkpoint: Checkpoint; perGroup: Record<GroupId, { slots: SlotKey[]; required: LessonId[]; broughtForward: LessonId[]; spare: number; short: LessonId[] }> }
export function planWindows(args: { groups: readonly Group[]; checkpoints: readonly Checkpoint[]; streams: Record<GroupId, Lesson[]>; windowSlots: (groupId: GroupId, checkpoint: Checkpoint) => SlotKey[]; requiredBefore: (checkpoint: Checkpoint) => Set<string> /* item ids */; canonical: Lesson[] }): WindowPlan[];
```

**The rule** (spec section 10.6). Groups of one track in a plan form a pace set. Work through the checkpoints in date order. For each checkpoint and each group:

```
window slots  = the group's usable, unreserved slots after its previous boundary and before this one
                (assessment: strictly before the group's anchor slot; block end: up to the block's last day)
required      = the group's unplaced lessons of items that come before this assessment in the scheme
                (none for a block end)
slack         = window slots - required, with buffer lessons counted last (see below)

if every group's slack is 0 or more:
    bring forward the longest run of the next lessons in the course's own order
    such that every group can fit its share of them in its slack
each group places required, then brought-forward lessons, in its earliest window slots, in order
slots still free become spare lessons, in the window's last slots
a group with negative slack places what fits; the rest is overflow at this checkpoint for that group only,
    and is first in line in the next window
```

"The course's own order" is the lesson list with no overrides, so "the next lesson" means the same thing for every group. A group's share of a run leaves out lessons it has already had or does not have.

**Buffers.** A buffer lesson is required like any other while there is room. When a group's slack is negative, its buffer lessons in the window are dropped, last first, until it fits or none are left. Dropped buffer lessons go in `absorbed`, not `overflow`.

After the last checkpoint nothing more is planned. When a stream runs out, every remaining slot is a spare lesson.

- [ ] **Step 1: Write the feature file** for scenario 5 with the wording of spec section 17, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
// pace.test.ts, on paceWorld()
test("two lessons are brought forward for everyone, as many as the tightest group can fit", () => {
  for (const g of ["13 1", "13 3", "13 5"]) expect(dateOf(g, "c3#2")! < anchorDate(g, "a1")).toBe(true);
  for (const g of ["13 1", "13 3", "13 5"]) expect(dateOf(g, "c3#3")! > anchorDate(g, "a1")).toBe(true);
});
test("13 3's extra slot is a spare lesson in its last slot before the assessment", () =>
  expect(lessonAt("13 3|2026-11-26|4")).toBe("flex:13 3:cp:a1#1"));
test("13 1 and 13 5 have no spare lesson before the assessment", () => { /* no flex id for cp:a1 in either group */ });
test("each group sits the assessment in its own first slot on or after the date", () =>
  expect(anchors("a1")).toEqual({ "13 1": "13 1|2026-11-27|6", "13 3": "13 3|2026-12-01|5", "13 5": "13 5|2026-11-27|4" }));
test("after the scheme runs out, every remaining slot is a spare lesson", () =>
  expect(spareCount("cp:block:T1b")).toEqual({ "13 1": 6, "13 3": 5, "13 5": 6 }));
test("a group that loses a slot it could spare loses the spare lesson, and no content moves past the assessment", () => {
  // cancel 13 3|2026-11-17|5: no flex before a1 for 13 3; c3#2 is still before its a1 slot; 13 1 and 13 5 are unchanged
});
test("a group that cannot fit what is due is short alone", () => {
  // a1 dated 2026-11-26, c1 has 4 lessons (7 due). Slots before the anchor: 13 1 has 8, 13 3 has 7, 13 5 has 7.
  // Cancel 13 3|2026-11-17|5. Then:
  expect(snapshot.overflow).toEqual([{ checkpointId: "cp:a1", groupId: "13 3", lessonIds: ["c2#3"] }]);
  expect(placementsOf("13 1")).toEqual(before.placementsOf("13 1"));
  expect(placementsOf("13 5")).toEqual(before.placementsOf("13 5"));
});
test("a buffer before the assessment absorbs a loss the spare lesson cannot", () => {
  // a1 on 27 Nov, c1 with 4 lessons, and a one-lesson buffer b1 between c2 and a1: 8 due. Slots are 8, 9 and 8, so 13 3 has one spare lesson.
  // Cancel 13 3|2026-11-17|5 and 13 3|2026-11-24|5. The first loss takes the spare lesson; the second takes the buffer.
  expect(snapshot.absorbed).toEqual([{ groupId: "13 3", lessonId: "b1#1" }]);
  expect(snapshot.overflow).toEqual([]);
});
test("before a block end there is nothing due, so everyone is held to the group with the fewest slots", () => { /* no assessments: lessons placed per group in the first window are equal in number */ });
test("a group that is ahead gets spare lessons until the others catch up", () => { /* 13 5 positioned at c2#1: it has 3 more spare lessons before a1 than in the base world */ });
test("an override that shortens an item for one group gives that group a spare lesson", () => {});

// pace.prop.test.ts: every property of Task 2.2 still holds for three groups, and
// - at a checkpoint, no group has placed a lesson that comes after the pace run in the course's order
// - a spare lesson is never followed, in the same window, by a content lesson
```

Scenario 5's steps assert, on the full synthetic year with the synthetic pack and planning fixture of Tasks 2.6 and 2.13 (until those exist, the steps use `paceWorld()` and are extended in Task 2.13): every planned lesson is on an open slot of its own group; no planned lesson is on a day that is not a pupil day; lessons are in chapter order; every teaching item has at least one pack reference that leads to a spec point; the count of teaching lessons equals the sum in the sheet; and at least one group has a spare lesson directly before an assessment.

- [ ] **Step 3: Run them.** Expected: FAIL: groups are sequenced independently, so 13 3 races ahead.
- [ ] **Step 4: Implement** `planWindows` and call it from `sequence` for each pace set. Keep steps 1 to 4 and 6 to 8 of Task 2.2; this replaces step 5.
- [ ] **Step 5: Run again.** Expected: PASS, with every test of Task 2.2 still passing.
- [ ] **Step 6: Finish line and commit.** `feat(domain): pace line for parallel groups, with spare lessons before checkpoints`

---

### Task 2.4: History, positions and the freeze horizon

**Files:**
- Create: `packages/domain/src/history.ts`, `history.test.ts`, `history.prop.test.ts`
- Modify: `packages/domain/src/sequence.ts`

**Interfaces:**
- Consumes: `PlanInputs.previous`, `PlanInputs.log`.
- Produces: `sequence` now carries history forward. And:

```ts
export function isHistory(p: Placement): boolean;                    // declared, assumed, taught, cover, homework or skipped
export function delivered(snapshot: PlanSnapshot, groupId: GroupId): Set<LessonId>;   // counts as done: declared, assumed, taught, cover, homework
export function freezeHorizonEnd(today: IsoDate, slots: readonly Slot[]): IsoDate | null;   // next date after today with a usable slot in this plan
export function nextLesson(snapshot: PlanSnapshot, groupId: GroupId): LessonId | null;
```

Rules (spec sections 10.8 and 10.9):

- A placement in `previous` whose slot date is before `today` is history. Its state becomes the log's outcome when the log has an entry for that group and lesson, and `assumed` otherwise. History is copied into the new snapshot unchanged in every other field.
- A `skipped` lesson is not delivered. It returns to the front of that group's stream. The skipped placement stays in history.
- A log entry with outcome `homework` or `taught` for a lesson that was never placed adds a history placement with `slotKey` from the entry.
- Placements in `previous` dated from `today` to `freezeHorizonEnd` are frozen: copied as they are, and their slots are not available to the stream. The exception is a frozen placement whose slot is no longer usable; it returns to the front of the stream.
- With `previous` null, history is the declared lessons from `positions` only.
- Planning starts at the first lesson that is neither history nor frozen.

- [ ] **Step 1: Write the failing tests.** `first` is `sequence(paceWorld())`; later calls pass `previous: first` with a later `today`.

```ts
test("a week later, unanswered lessons are assumed and the plan carries on from the next one", () => {
  const s = sequence({ ...world, today: "2026-11-16", previous: first });
  expect(stateOf(s, "13 1", "c1#1")).toBe("assumed");
  expect(dateOf(s, "13 1", "c2#1")).toBe("2026-11-16");
});
test("a logged outcome replaces assumed", () => { /* log taught for c1#1, cover for c1#2 */ });
test("a skipped lesson is taught next, and the skip stays in history", () => {
  // log skipped for 13 1 c1#3 (13 Nov); today 2026-11-16; horizon ends 2026-11-17
  // c2#1 on 16 Nov is frozen, so c1#3 is planned on 18 Nov, the first slot after the horizon
});
test("today and the next teaching day do not move when the scheme changes", () => {
  // today 2026-11-16, horizon ends 2026-11-17. Cut c2 to 1 lesson. Placements on 16 and 17 Nov equal those in `first`.
});
test("a frozen lesson whose slot was cancelled is released", () => { /* cancel 13 3|2026-11-17|5: its lesson is planned in the next slot */ });
test("three weeks without opening the app", () => {
  const s = sequence({ ...world, today: "2026-11-30", previous: first });
  expect(s.placements.filter(p => p.state === "assumed").length).toBeGreaterThan(20);
  expect(new Set(s.placements.map(p => p.groupId + p.lessonId)).size).toBe(s.placements.length);   // nothing planned twice
  expect(nextLesson(s, "13 1")).toBe("c3#3");
});
test("cutting a count below what was taught keeps the history and plans nothing twice", () => {
  // today 2026-11-23 with c1 fully assumed; set c1 to 1 lesson: c1#2 and c1#3 are still in history; the stream starts at c2's next lesson
});
test("history never appears on a date on or after today", () => {});
test("with no previous plan, only declared lessons are history", () => {});

// history.prop.test.ts
// - for any change to items, pins, merges or slots dated on or after today, isHistory placements are deep-equal before and after
// - frozen placements are deep-equal before and after unless their slot stopped being usable
// - delivered(first) is a subset of delivered(later) unless the log skipped a lesson
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** in `history.ts`, and call it at the start of `sequence`.
- [ ] **Step 4: Run again.** Expected: PASS, with Tasks 2.2 and 2.3 still passing.
- [ ] **Step 5: Finish line and commit.** `feat(domain): history, assumed lessons and the freeze horizon`

---

### Task 2.5: Revisions, diff and undo

**Files:**
- Create: `packages/domain/src/revisions.ts`, `revisions.test.ts`, `revisions.prop.test.ts`, `undo.steps.test.ts`
- Create: `features/08-undo.feature`

**Interfaces:**
- Produces: `revisions.ts` as in the index contract, and:

```ts
export interface PlanRevision { id: string; planId: string; parentId: string | null; label: string; createdAt: string; snapshot: PlanSnapshot }
export interface PlanChain { planId: string; headId: string | null; revisions: Record<string, PlanRevision> }
export function headSnapshot(chain: PlanChain): PlanSnapshot | null;
export function acceptProposal(chain: PlanChain, proposal: Proposal, meta: { id: string; createdAt: string }): { ok: true; chain: PlanChain } | { ok: false; reason: "stale" };
export function undo(chain: PlanChain): { ok: true; chain: PlanChain } | { ok: false; reason: "nothing-to-undo" };
export function snapshotKey(s: PlanSnapshot): string;    // canonical JSON text, the same for deep-equal snapshots
```

- [ ] **Step 1: Write the feature file** for scenario 8, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
test("the first proposal has no before and lists every planned lesson as added", () => {
  const p = propose({ planId: "ial-business-u4", baseRevisionId: null, head: null, inputs: world, label: "First plan" });
  expect(p.before).toBeNull();
  expect(p.diff.entries.every(e => e.change === "added")).toBe(true);
});
test("cancelling a slot moves the lessons after it and marks the one that was hit", () => {
  // cancel 13 1|2026-11-18|2 after the first plan
  expect(diff.entries.find(e => e.lessonId === "c2#2")).toMatchObject({ change: "moved", from: "13 1|2026-11-18|2", to: "13 1|2026-11-20|6", hitByDisruption: true });
  expect(diff.entries[0]?.hitByDisruption).toBe(true);            // hit lessons are listed first
});
test("history, pinned lessons and dated assessments never appear in a diff", () => {});
test("a past lesson later logged as skipped appears as a correction", () => expect(entry("c1#3").change).toBe("correction"));
test("identical snapshots give an empty diff", () => expect(diffSnapshots(first, first, world.slots).entries).toEqual([]));
test("metrics count placed, spare and overflow per group", () =>
  expect(planMetrics(first, world.slots).perGroup["13 3"]).toMatchObject({ placed: 12, spare: 6, overflow: 0, lastContentDate: "2026-12-10" }));
test("accept sets the head and keeps the parent", () => {});
test("accepting a proposal based on an older head is refused", () =>
  expect(acceptProposal(chainWithNewerHead, oldProposal, meta)).toEqual({ ok: false, reason: "stale" }));
test("undo returns to the parent and keeps the undone revision in the chain", () => {});
test("undo with one revision or none says there is nothing to undo", () => {});

// revisions.prop.test.ts
// - for any chain and any proposal on its head: headSnapshot(undo(accept(chain, p)).chain) deep-equals headSnapshot(chain)
// - snapshotKey is equal exactly when snapshots are deep-equal
```

13 3's `lastContentDate` in the metrics test is the date of `c4#2`: its slots after the assessment are 3 Dec P3 and P4, 8 Dec, 10 Dec P3 and P4, and it has four lessons left (`c3#3`, `c3#4`, `c4#1`, `c4#2`), so `c4#2` is on 10 Dec period 3.

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** `diffSnapshots` compares placements by group and lesson id. Entries are sorted: those hit by a disruption first, then by date. Spare lessons are left out of the diff entries and counted in the metrics.
- [ ] **Step 5: Run again.** Expected: PASS, including scenario 8.
- [ ] **Step 6: Finish line and commit.** `feat(domain): plan revisions, diff, accept and undo`

---

### Task 2.6: Curriculum packs: schema, checks, lock

**Files:**
- Create: `packages/domain/src/pack.ts`, `pack.test.ts`
- Create: `packages/importers/src/pack/schema.ts`, `schema.test.ts`, `lock.ts`, `lock.test.ts`
- Create: `fixtures/src/synthetic-pack.ts`

**Interfaces:**
- Produces: the `pack.ts` types in the index contract, and:

```ts
// domain
export function unmappedSpecPoints(pack: CurriculumPack): SpecPoint[];          // in-scope points that no chapter links to
export function packIssues(pack: CurriculumPack): string[];                      // broken references, duplicate ids
export function specPointsFor(pack: CurriculumPack, packRefs: readonly string[]): SpecPoint[];
// importers
export const curriculumPackSchema: z.ZodType<CurriculumPack>;
export function packHash(pack: CurriculumPack): string;                          // SHA-256 of the canonical JSON without lockedAt and hash
export function lockPack(pack: CurriculumPack, now: Date): CurriculumPack;       // throws when packIssues or unmappedSpecPoints is not empty
export function isLockedAndIntact(pack: CurriculumPack): boolean;
// fixtures
export function syntheticPack(): CurriculumPack;     // invented content: 2 units, 6 chapters, 8 spec points, one of them hl-only
```

The synthetic pack is invented, not copied from any board: units `u1` "Markets" and `u2` "Firms" (`u2` out of scope); chapters `ch1` to `ch6` numbered "1" to "6"; `ch1` links two spec points; two chapters link the same spec point; every in-scope point is linked.

- [ ] **Step 1: Write the failing tests**

```ts
test("the synthetic pack passes the schema and has no issues", () => {});
test("a spec point no chapter links to is unmapped; an out-of-scope one is not", () => {});
test("a chapter that links to a missing spec point is an issue", () => expect(packIssues(broken)[0]).toContain("ch2"));
test("a pack with an unmapped point cannot be locked", () => expect(() => lockPack(withUnmapped, now)).toThrow(/unmapped/));
test("locking sets the hash and the time, and the hash ignores key order", () => {});
test("editing a locked pack is detected", () => expect(isLockedAndIntact({ ...locked, subject: "x" })).toBe(false));
test("the schema refuses a pack with an unknown level or a missing page field", () => {});
test("specPointsFor follows chapter links and removes duplicates", () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): curriculum pack schema, checks and lock`

---

### Task 2.7: AI port, fake provider and skill registry

**Files:**
- Create: `packages/ai/package.json`, `tsconfig.json`, `src/index.ts`, `src/port.ts`, `src/fake.ts`, `src/fake.test.ts`, `src/registry.ts`, `src/registry.test.ts`
- Create: `packages/ai/src/skills/planner-suggest-lesson-counts.ts`
- Create: `packages/ai/scripts/write-schemas.ts`

**Interfaces:**
- Produces: `port.ts` as in the index contract, and:

```ts
export interface SkillDefinition<I, O> { id: SkillId; input: z.ZodType<I>; output: z.ZodType<O>; tools: ("WebSearch" | "WebFetch")[]; model: "haiku" | "sonnet" | "opus"; promptPath: string /* .claude/skills/<id>/SKILL.md from the repo root */ }
export const skills: Partial<Record<SkillId, SkillDefinition<unknown, unknown>>>;
export function getSkill(id: SkillId): SkillDefinition<unknown, unknown>;                 // throws for an unregistered id
export function buildPrompt(skill: SkillDefinition<unknown, unknown>, skillText: string, input: unknown, text: string | null): string;
export function jsonSchemaFor(skill: SkillDefinition<unknown, unknown>): object;         // from Zod
export class FakeAiProvider implements AiProvider {
  constructor(fixtures: Partial<Record<SkillId, unknown | ((input: unknown) => unknown)>>, opts?: { delayMs?: number; fail?: AiError["reason"] });
  readonly calls: AiTask<unknown>[];
}
```

The first registered skill is `planner-suggest-lesson-counts`, with input `{ courseTitle: string; mode: "differences" | "split"; items: { id: string; title: string; lessons: number | null }[]; unitTotals: { unitId: string; lessons: number }[] }` and output `{ suggestions: { itemId: string; lessons: number; reason: string; tricky: boolean }[] }`. Its `SKILL.md` is written in Task 2.14.

- [ ] **Step 1: Write the failing tests**

```ts
test("the fake returns its fixture, validated against the task's schema", async () => {});
test("a fixture that does not match the schema fails with invalid-output", async () =>
  await expect(fake.run(task, opts)).rejects.toMatchObject({ reason: "invalid-output" }));
test("the fake records each call and reports started then done", async () => {});
test("the fake can be told to fail, and honours the abort signal", async () => {});
test("the prompt holds the skill text, then the input as JSON, then the extracted text, in that order", () => {});
test("the prompt never contains a file path from the resources folder", () => { /* input with fileName only */ });
test("every registered skill has a SKILL.md and a schema.json that matches its Zod output", () => { /* skipped for skills whose SKILL.md task has not run; listed in PENDING_SKILL_TEXT */ });
test("getSkill for an unregistered id throws with the id in the message", () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `write-schemas.ts` writes `.claude/skills/<id>/schema.json` for every registered skill; add the root script `ai:schemas`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(ai): provider port, fake provider and skill registry`

---

### Task 2.8: Claude Code CLI adapter

**Files:**
- Create: `packages/ai/src/claude-cli.ts`, `claude-cli.test.ts`, `stream.ts`, `stream.test.ts`
- Create: `packages/ai/src/__fixtures__/claude-stream-ok.ndjson`, `claude-auth-status.json`
- Create: `packages/ai/scripts/try.ts` (root script `ai:try`)

**Interfaces:**
- Consumes: `AiProvider`, `AiTask`, `AiError`, `getSkill`, `buildPrompt`, `jsonSchemaFor`.
- Produces:

```ts
export interface SpawnLike { (command: string, args: string[], options: { env: Record<string, string>; stdio: ["ignore", "pipe", "pipe"] }): ChildLike }
export class ClaudeCodeCliProvider implements AiProvider {
  constructor(opts: { spawn: SpawnLike; env: Record<string, string | undefined>; readSkillText: (promptPath: string) => Promise<string>; timeoutMs: number; command?: string });
}
export function buildArgs(prompt: string, model: string, schema: object, tools: readonly string[]): string[];
export function parseStream(lines: AsyncIterable<string>, onProgress: (p: AiProgress) => void): Promise<{ output: unknown; model: string }>;
```

- [ ] **Step 1: Record a real run first.** With Claude Code signed in, run the flag set from the index by hand on a harmless prompt ("Return {\"ok\": true}") with a one-field schema, and save standard output as `claude-stream-ok.ndjson`. Save the output of `claude auth status` as `claude-auth-status.json` with the email and organisation fields removed. The parser is written against these recordings, not from memory. If the recording has no structured result, stop and report: the flag set has changed since the spike.

- [ ] **Step 2: Write the failing tests**

```ts
test("the arguments are exactly the proven flag set", () =>
  expect(buildArgs("P", "sonnet", { type: "object" }, [])).toEqual([
    "-p", "P", "--model", "sonnet", "--tools", "", "--setting-sources", "", "--strict-mcp-config",
    "--disallowedTools", "mcp__*", "--permission-mode", "dontAsk", "--output-format", "stream-json", "--verbose",
    "--json-schema", '{"type":"object"}', "--no-session-persistence" ]));
test("web skills get only the two web tools", () => {
  const a = buildArgs("P", "sonnet", {}, ["WebSearch", "WebFetch"]);
  expect(a[a.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch");
  expect(a).toEqual(expect.arrayContaining(["--allowedTools", "WebSearch", "WebFetch"]));
});
test("--bare is never passed", () => expect(buildArgs("P", "sonnet", {}, [])).not.toContain("--bare"));
test("the child never sees an API key or auth token, and standard input is closed", async () => {
  // env has ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN: the fake spawn receives neither, and stdio[0] is "ignore"
});
test("the recorded stream gives the structured output and the model name", async () => {});
test("output that fails the task's schema is invalid-output and nothing is returned", async () => {});
test("a missing claude command is unavailable, with a sentence she can act on", async () => { /* spawn throws ENOENT */ });
test("auth status with loggedIn false is signed-out", async () => {});
test("a run longer than the timeout is killed and fails with timeout", async () => { /* fake timers */ });
test("aborting kills the child and fails with cancelled", async () => {});
test("a non-zero exit fails with the last line of standard error, cut to 300 characters", async () => {});
test("a stream that ends without a result fails with failed", async () => {});
test("an attachment outside data/uploads is refused before anything is spawned", async () => {});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** `available()` runs `claude auth status` and reads `loggedIn`. `run` loads the skill text, builds the prompt and arguments, spawns, parses, validates with the task's Zod schema, and fills `AiMeta`; `sources` are taken from the output's own `sources` array when it has one, with `opened: false`. Default timeout: 120 seconds without tools, 300 with.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Try it live.** `pnpm ai:try planner-suggest-lesson-counts fixtures/ai/lesson-counts.input.json` once Task 2.14 has written the skill; until then, a throwaway skill id is not added. Skip this step now and tick it in Task 2.14.
- [ ] **Step 7: Finish line and commit.** `feat(ai): Claude Code CLI adapter with the proven flag set`

---

### Task 2.9: AI jobs, provenance and review in the API

**Files:**
- Create: `apps/api/src/jobs/queue.ts`, `queue.test.ts`
- Create: `apps/api/src/db/migrations/0002_ai.sql`, `repos/sqlite/ai-repo.ts`, and tests
- Create: `apps/api/src/usecases/ai-jobs.ts`, `review-item.ts`, `routes/ai.ts`, `routes/ai.test.ts`
- Modify: `apps/api/src/app.ts`, `main.ts`, `config` route

**Interfaces:**
- Consumes: `AiProvider`, `FakeAiProvider`, `ClaudeCodeCliProvider`, `getSkill`.
- Produces: `AppDeps` gains `ai: AiProvider | null`. And:

```ts
export interface AiRun { id: string; skillId: SkillId; status: "queued" | "running" | "done" | "failed" | "cancelled"; startedAt: string; durationMs: number | null; provider: string | null; model: string | null; failure: string | null; itemIds: string[] }
export interface AiItem { id: string; runId: string; kind: string; target: string; data: unknown; review: ReviewState; reviewedAt: string | null; sources: Source[] }
export interface ItemHandler { kind: string; toItems(output: unknown, input: unknown): { target: string; data: unknown }[]; apply(item: AiItem, deps: AppDeps): Promise<void> }
export function registerItemHandler(skillId: SkillId, handler: ItemHandler): void;
export function startJob(deps: AppDeps, request: { skillId: SkillId; input: unknown; text: string | null; attachments: string[] }): AiRun;
```

| Route | Does |
|---|---|
| `POST /api/ai/jobs` | Starts a job; 202 with the run. 409 when AI is off or unavailable, with the reason |
| `GET /api/ai/jobs/:id` | The run |
| `GET /api/ai/jobs/:id/events` | Server-sent events: each `AiProgress`, then the final run |
| `POST /api/ai/jobs/:id/cancel` | Cancels a queued or running job |
| `GET /api/ai/runs` | Every run, newest first, for the activity drawer |
| `GET /api/ai/items?review=suggested` | Items awaiting review |
| `POST /api/ai/items/:id/review` | Body `{ state: "accepted" \| "edited" \| "rejected", data? }`. On accepted or edited, the handler's `apply` stores the result with AI provenance. A second review of the same item is refused with 409 |

`GET /api/config` now reports `ai.available` from `provider.available()`, checked at start-up and again at most once a minute.

- [ ] **Step 1: Write the failing tests** (with `FakeAiProvider`)

```ts
test("jobs run one at a time, in order", async () => {});
test("a finished job stores one run and its items, each suggested", async () => {});
test("a failed job stores the run with its reason and no items", async () => { /* fake fails with invalid-output */ });
test("a failure reason is a sentence, not an error code", async () => expect(run.failure).toBe("Claude returned something the planner could not use. Nothing was saved."));
test("with AI off, starting a job is refused and the engine routes still answer", async () => { /* 409; GET /api/slots is 200 */ });
test("with Claude signed out, the config says so and a job is refused with that reason", async () => {});
test("cancel stops a running job and stores nothing", async () => {});
test("events stream progress and end with the run", async () => {});
test("accepting an item applies it once, with provider, model, skill, time and review state recorded", async () => {});
test("rejecting an item applies nothing", async () => {});
test("an edited item is applied with her data and marked edited", async () => {});
test("reviewing an item twice is refused", async () => {});
test("the server restarts with a job marked running: it is marked failed with 'The planner was closed while this was running.'", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Failure sentences, one per `AiError` reason:

| Reason | Sentence |
|---|---|
| `unavailable` | "Claude Code is not installed on this Mac. Everything else still works." |
| `signed-out` | "Claude Code is signed out. Run `claude` in a terminal and sign in, then try again." |
| `timeout` | "Claude took too long and was stopped. Nothing was saved." |
| `invalid-output` | "Claude returned something the planner could not use. Nothing was saved." |
| `cancelled` | "Cancelled. Nothing was saved." |
| `failed` | "Claude stopped with an error. Nothing was saved." |

- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagrams 03 and 07** with the `architecture-visual-docs` skill if the job flow differs from what they show.
- [ ] **Step 6: Finish line and commit.** `feat(api): AI job queue, provenance and review`

---

### Task 2.10: AI in the interface

**Files:**
- Create: `apps/web/src/components/AiBadge.tsx`, `ProvenancePopover.tsx`, `JobChip.tsx`, `ActivityDrawer.tsx`, `Legend.tsx`, `ReviewBar.tsx`, `apps/web/src/api/jobs.ts`
- Create: `features/m2-ai-marking.feature`, `e2e/steps/ai.steps.ts`
- Modify: `apps/web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: the AI routes of Task 2.9.
- Produces: `<AiBadge review={state} />`, `<ProvenancePopover provenance={...} />`, `<ReviewBar item onAccept onEdit onReject />`, `useJob(jobId)` (subscribes to the event stream), `<JobChip />` and `<ActivityDrawer />` in the shell header, `<Legend />`.

What they show (spec section 12): awaiting review is a sparkle icon and a dashed outline; accepted is a small sparkle; edited is a sparkle and a pencil. Each state also has a text alternative ("AI suggestion, not reviewed"). The popover names the provider, model, skill, time and sources, each source a link marked opened or not opened. The legend shows the three states and the sentence fixed in the index. The header chip shows a running job with its latest progress note and a cancel button; when AI is unavailable it shows why. The drawer lists every run with its outcome.

- [ ] **Step 1: Write the failing browser tests.** The seed adds one suggested AI item through the fake provider.

```gherkin
@e2e
Feature: AI is marked
  Scenario: A suggestion awaiting review is marked by icon and outline
    When I open the activity drawer
    Then I see one run of "planner-suggest-lesson-counts" by the fake provider
    And its suggestion has the "AI suggestion, not reviewed" badge and a dashed outline
  Scenario: The legend explains the marks
    When I open the legend
    Then I see "Everything without the sparkle is calculated from your calendar and timetable."
  Scenario: AI is unavailable
    Given AI is switched off
    Then the header says AI is off and the board still opens
  Scenario: The AI components are accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The badge's meaning is in its icon and text, never colour alone.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagram 04** if the shared pieces changed.
- [ ] **Step 6: Finish line and commit.** `feat(web): AI badge, provenance popover, job chip and activity drawer`

---

### Task 2.11: Drafting a pack from a specification

**Files:**
- Create: `packages/importers/src/pack/pdf-text.ts`, `pdf-text.test.ts`
- Create: `packages/ai/src/skills/planner-build-curriculum-pack.ts`, `.claude/skills/planner-build-curriculum-pack/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/draft-pack.ts`, `draft-pack.test.ts`, `scripts/pack-draft.ts` (root script `pack:draft`)
- Create: `fixtures/src/synthetic-spec-pdf.ts`

**Interfaces:**
- Consumes: `ResourceGateway`, `AiProvider`, `curriculumPackSchema`, `packIssues`.
- Produces:

```ts
export function extractPdfText(data: Uint8Array): Promise<{ pages: { number: number; text: string }[] }>;
export function draftPack(deps: { gateway: ResourceGateway; ai: AiProvider }, args: { courseId: CourseId; specPath: string; chapters: { number: string; title: string }[]; unitsInScope: string[] }): Promise<{ pack: CurriculumPack; meta: AiMeta; issues: string[] }>;
// writes nothing itself; scripts/pack-draft.ts saves the result to data/packs/<courseId>.draft.json
```

The skill's input is `{ courseId, board, unitsInScope, chapters, pages: { number, text }[] }`. Its output is the `units`, `specPoints` and `chapters` of a `CurriculumPack`, with a page number on every spec point.

- [ ] **Step 1: Write the failing tests**

```ts
test("text comes out page by page, in reading order", async () => { /* a two-page synthetic PDF */ });
test("a PDF with no text layer gives pages with empty text, not an error", async () => {});
test("draftPack reads the specification through the gateway and sends text, not a path", async () => {
  expect(fake.calls[0]?.attachments).toEqual([]);
  expect(JSON.stringify(fake.calls[0]?.input)).not.toContain("Specification &");
});
test("a path the gateway refuses is never sent to a model", async () => { /* the textbook path: ResourceDenied, fake.calls is empty */ });
test("a draft that breaks pack rules is returned with its issues, for her to fix in review", async () => {});
test("more than 150 pages is refused: this is a specification, not a textbook", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `extractPdfText` with pdfjs-dist behind this one file, and `draftPack`.
- [ ] **Step 4: Write the skill** by the writing-skills loop. Baseline: run a bare instruction ("turn this specification text into units, spec points and chapter links as JSON") on the synthetic specification through `pnpm ai:try` and note what is wrong: typically missing page numbers, invented spec codes, chapter links guessed from titles, and HL-only content not marked. Write `SKILL.md` to fix what you saw. It must say: use only codes that appear in the text; give the page of every point; mark a point HL-only only when the text does; leave a chapter unlinked and say so when unsure; never copy more than a point's title. Run again and compare.
- [ ] **Step 5: Run the tests again.** Expected: PASS, including the registry's schema-freshness test for this skill.
- [ ] **Step 6: Finish line and commit.** `feat(planner): draft a curriculum pack from a specification`

---

### Task 2.12: Courses, scheme, positions and plans in the API

**Files:**
- Create: `apps/api/src/db/migrations/0003_scheme_plans.sql`
- Create: `apps/api/src/repos/sqlite/scheme-repo.ts`, `decision-repo.ts`, `fact-repo.ts`, `plan-repo.ts`, `pack-store.ts`, and tests
- Create: `apps/api/src/usecases/plan-inputs.ts`, `propose-plan.ts`, `accept-plan.ts`, `undo-plan.ts`, `check-in.ts`, and tests
- Create: `apps/api/src/routes/packs.ts`, `scheme.ts`, `plans.ts`, `checkin.ts`, and `routes/plans.test.ts`
- Modify: `scripts/seed-synthetic.ts` (synthetic pack, scheme, positions and a first accepted plan)

**Interfaces:**
- Consumes: the engine of Tasks 2.1 to 2.6.
- Produces: `loadPlanInputs(deps, courseId, today): PlanInputs` (the only place that assembles engine input from the database), and these routes:

| Route | Does |
|---|---|
| `GET /api/courses` | Courses with their groups, pack state (`none`, `draft`, `locked`) and whether a plan exists |
| `GET /api/packs/:courseId` | `{ draft, locked }` from `data/packs/` |
| `PUT /api/packs/:courseId/draft` | Saves her corrections to the draft |
| `POST /api/packs/:courseId/lock` | Locks; 422 with the unmapped points or issues |
| `GET /api/scheme/:courseId` | `{ items, overrides, totals, slotsLeft }`, the last two per group |
| `PUT /api/scheme/:courseId` | Replaces items and overrides after `validateScheme`; 422 with reasons. Refused with 409 until the pack is locked |
| `GET /api/positions/:courseId`, `PUT /api/positions/:courseId` | Positions per group |
| `GET /api/plans/:courseId` | `{ head: PlanRevision \| null, canUndo, upToDate }` |
| `POST /api/plans/:courseId/proposals` | Computes a proposal from what is stored now. Stores nothing. Returns it with `candidateKey` |
| `POST /api/plans/:courseId/accept` | Body `{ baseRevisionId, candidateKey }`. Recomputes; if the head or the key differs, 409 `stale-proposal`. Otherwise stores the revision |
| `POST /api/plans/:courseId/undo` | Head becomes the parent; 409 when there is none |
| `GET /api/placements?from&to` | Placements of every plan's head in the range, each with its lesson title, kind and provenance |
| `GET /api/checkin` | Assumed lessons not yet confirmed, grouped by week, oldest first |
| `POST /api/checkin` | Body `{ entries: { groupId, lessonId, outcome, note }[] }`. Writes the lesson log. Returns the courses whose plan is no longer up to date |

`upToDate` is false when a fresh `sequence` of today's inputs differs from the head in anything but history states.

- [ ] **Step 1: Write the failing tests**

```ts
test("a scheme cannot be saved before the pack is locked", async () => {});
test("the first proposal, accepted, becomes the head", async () => {});
test("accepting with an old base is refused and the head does not change", async () => {
  // two proposals from one head; accept the first; accept the second: 409 stale-proposal
});
test("accepting after the scheme changed is refused, because what she saw is no longer what would be stored", async () => {
  // proposal; PUT scheme; accept with the old candidateKey: 409
});
test("undo restores the previous head exactly, and a second undo with nothing left is refused", async () => {});
test("placements for a week return titles and states for the board", async () => {});
test("check-in lists assumed lessons by week, oldest first", async () => { /* fixedToday three weeks after the plan */ });
test("confirming a week writes one log entry per lesson and they leave the check-in", async () => {});
test("logging a skip leaves the plan not up to date and offers a proposal", async () => {});
test("positions for a lesson that does not exist are refused with the valid ids near it", async () => {});
test("a proposal on a course with no positions says positions are needed", async () => { /* 422, not an empty plan */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Packs are JSON files in `data/packs/` (`<courseId>.draft.json`, `<courseId>.json`); the database holds only the locked hash. Revisions store the snapshot as JSON. Guard the mutating routes with `requireAccess`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagrams 03, 05 and 06** with the `architecture-visual-docs` skill.
- [ ] **Step 6: Finish line and commit.** `feat(api): packs, scheme, positions, plan proposals, accept, undo and check-in`

---

### Task 2.13: Planning-sheet and assessment-schedule import

**Files:**
- Create: `packages/importers/src/planning/read-planning.ts`, `read-planning.test.ts`, `read-planning.golden.test.ts`, `to-items.ts`, `to-items.test.ts`
- Create: `packages/importers/src/assessment-schedule/read-schedule.ts`, `read-schedule.test.ts`
- Create: `fixtures/src/synthetic-planning.ts`
- Create: `apps/api/src/usecases/import-scheme.ts`, and its test; `routes/scheme.ts` gains `POST /api/scheme/:courseId/import`
- Modify: `packages/domain/src/schedule.steps.test.ts` (scenario 5 on the full synthetic year)

**Interfaces:**
- Produces:

```ts
export interface PlanningRow { kind: "section" | "chapter"; sheetRow: number; number: string | null; title: string; lessons: number | null; countNote: string | null; extra: string | null; statedSectionTotal: number | null }
export interface PlanningImport { rows: PlanningRow[]; statedTotal: number | null; sum: number; findings: ImportFinding[] }
export function readPlanningSheet(data: Uint8Array): Promise<PlanningImport>;
export interface ScheduleRow { dateText: string; date: LooseDate; topicText: string; type: string; marks: number | null }
export function readAssessmentSchedule(data: Uint8Array, academicYear: { start: number; end: number }): Promise<{ rows: ScheduleRow[]; findings: ImportFinding[] }>;
export function planningToItems(args: { courseId: CourseId; board: "IAL" | "IB" | "IGCSE"; planning: PlanningImport; schedule: ScheduleRow[]; pack: CurriculumPack; today: IsoDate }): { items: SowItem[]; findings: ImportFinding[] };
```

`FindingKind` gains `total-mismatch`, `section-total-mismatch`, `missing-count`, `unlinked-chapter` and `unreadable-table`.

**The planning sheet's layout** (her IAL Unit 4 and IGCSE Year 11 sheets, checked on 24 Nov 2026): the first row is a header whose second cell is `Number of Classes`. A row with a title and no count is a section, and its title may end in "(24 classes)". A chapter row starts with the chapter number ("26 Trading Blocs") and its count cell may hold a note after the number ("5 (started in Y12)"). A third column, when present, holds exam-practice notes. Near the bottom a lone number is the stated total, with "Total" on a nearby row.

The synthetic sheet: header `Synthetic Content`, `Number of Classes`; section "Part A (7 classes)" with "1 Demand" `3 (started last year)` and "2 Supply" `4`; section "Part B (6 classes)" with "3 Markets" `4` and "4 Prices" `2`; a stated total of `10`. The synthetic schedule is a Word table with header cells Date, Topic, Type and rows "27 Nov", "Chapters 1-2", "20 mark" and "11 Dec", "Chapter 3", "12 mark".

- [ ] **Step 1: Write the failing tests**

```ts
test("sections and chapters are told apart, and a chapter's number is split from its title", () =>
  expect(imp.rows.map(r => [r.kind, r.number, r.title])).toEqual([
    ["section", null, "Part A"], ["chapter", "1", "Demand"], ["chapter", "2", "Supply"],
    ["section", null, "Part B"], ["chapter", "3", "Markets"], ["chapter", "4", "Prices"] ]));
test("a count with a note keeps both", () => expect(row("1")).toMatchObject({ lessons: 3, countNote: "started last year" }));
test("the stated total and the sum are both kept, and a difference is a finding", () => {
  expect(imp).toMatchObject({ statedTotal: 10, sum: 13 });
  expect(imp.findings).toContainEqual(expect.objectContaining({ severity: "warning", message: expect.stringContaining("10") }));
});
test("a section total that disagrees with its chapters is a finding", () => { /* change "Part B (6 classes)" to 7 */ });
test("a chapter with no number in its count cell is a finding and gets no count", () => {});
test("a sheet without a 'Number of Classes' header is refused", () => {});
test("schedule rows read the date, topic and marks", () =>
  expect(schedule.rows[0]).toMatchObject({ date: { date: "2026-11-27" }, topicText: "Chapters 1-2", marks: 20 }));
test("items come out in sheet order, each linked to its pack chapter, with origin import", () =>
  expect(items.filter(i => i.kind === "teaching").map(i => [i.id, i.lessons, i.packRefs])).toEqual([["ch1", 3, ["ch1"]], ["ch2", 4, ["ch2"]], ["ch3", 4, ["ch3"]], ["ch4", 2, ["ch4"]]]));
test("an assessment is placed after the last chapter it names, with a length from its marks", () => {
  expect(items.map(i => i.id)).toEqual(["ch1", "ch2", "a-ch2", "ch3", "a-ch3", "ch4"]);
  expect(item("a-ch2").assessment).toMatchObject({ date: "2026-11-27", marks: 20, durationMinutes: 30, slotUse: "whole", covers: ["ch1", "ch2"] });
  expect(item("a-ch3").assessment).toMatchObject({ marks: 12, durationMinutes: 18, slotUse: "in-lesson", covers: ["ch3"] });
});
test("a count note and a third-column note are kept on the item", () => expect(item("ch1").note).toBe("started last year"));
test("a schedule row dated before today is imported as sat", () => { /* today 2026-12-01: a-ch2 has status "sat", a-ch3 "planned" */ });
test("a chapter the pack does not have is imported unlinked, with a finding", () => {});
test("importing again keeps item ids, so pins and overrides still point at them", () => {});
test("the import is a preview: nothing is stored until she accepts it", async () => { /* POST import returns { items, findings, changes }; GET scheme is unchanged */ });

// read-planning.golden.test.ts, on her real IAL sheet, through the gateway
test("sixteen chapters, 22 to 37, summing to 70, with a stated total of 65", () => {
  expect(chapters.map(c => c.number)).toEqual(range(22, 37).map(String));
  expect(imp.sum).toBe(70); expect(imp.statedTotal).toBe(65);
  expect(row("22").countNote).toBe("started in Y12");
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The planning sheet is read with exceljs; the schedule's first table with mammoth, behind `read-schedule.ts`. Marks are read from "N mark" in the type cell.
- [ ] **Step 4: Extend scenario 5's steps** to run on the synthetic year, pack, sheet and schedule, as described in Task 2.3.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Finish line and commit.** `feat(importers): planning sheets and assessment schedules into a scheme of work`

---

### Task 2.14: Lesson-count suggestions

**Files:**
- Create: `.claude/skills/planner-suggest-lesson-counts/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/suggest-counts.ts`, `suggest-counts.test.ts`
- Create: `fixtures/ai/lesson-counts.input.json`

**Interfaces:**
- Consumes: `startJob`, `registerItemHandler`, the skill registered in Task 2.7.
- Produces: an item handler with kind `lesson-count`, target the item id, data `{ lessons, reason, tricky }`. Accepting one sets that item's count with AI provenance and review `accepted`; editing sets her number with review `edited`.

- [ ] **Step 1: Write the failing tests**

```ts
test("each suggestion that differs from her number becomes one item; equal ones become none", async () => {});
test("accepting a suggestion changes that item's count and records AI provenance", async () => {});
test("a suggestion for an item that does not exist is dropped and reported in the run", async () => {});
test("nothing changes in the scheme until she reviews", async () => {});
test("the input sent to the model holds titles and counts only", async () => { /* no dates, no group names, no file names */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the use case and handler.
- [ ] **Step 4: Write the skill** by the writing-skills loop, on the synthetic scheme. It must say: start from her numbers and change one only with a reason; keep each unit's total unless told `mode: "split"`; flag a topic as tricky only with a reason tied to the content; use the exam board's own terms; no student names.
- [ ] **Step 5: Run again, then try it live** with `pnpm ai:try planner-suggest-lesson-counts fixtures/ai/lesson-counts.input.json`. Expected: schema-valid output in a few seconds. Tick Task 2.8 Step 6.
- [ ] **Step 6: Finish line and commit.** `feat(planner): lesson-count suggestions as reviewable differences`

---

### Task 2.15: Pack review and lock screen

**Files:**
- Create: `apps/web/src/screens/setup/PackReview.tsx`, `PackTree.tsx`, `features/m2-pack-review.feature`, `e2e/steps/pack.steps.ts`
- Modify: `apps/web/src/screens/setup/SetupScreen.tsx`

**Interfaces:**
- Consumes: `GET /api/courses`, `GET/PUT /api/packs/:courseId`, `POST /api/packs/:courseId/lock`.
- Produces: `/setup/courses/:courseId/pack`. Reused unchanged for IB in M4 and IGCSE in M6.

What it shows: the draft as a tree of units, then spec points, each with its code, title, level and page reference, and under each the chapters that link to it. She can mark a unit in or out of scope, correct a title, add or remove a chapter link, and mark a unit as checked. A panel lists unmapped points and issues; "Lock" is disabled, with the reason, until that panel is empty and every in-scope unit is checked. A locked pack is read-only and shows when it was locked. The draft carries the AI badge until locked; locking is her review.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Reviewing a curriculum pack
  Scenario: A pack with an unmapped point cannot be locked
    Given a draft pack with one spec point linked to no chapter
    Then "Lock" is disabled and says one point is not linked
    When I link that point to a chapter and mark every unit as checked
    And I lock the pack
    Then the pack is shown as locked and cannot be edited
  Scenario: Every point shows its page
    Then each spec point shows a page reference
  Scenario: The screen is usable by keyboard and accessible
    Then I can open and close a unit with the keyboard
    And the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the screen. The tree uses the tree-view keyboard pattern.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): review and lock a curriculum pack`

---

### Task 2.16: Scheme of work screen

**Files:**
- Create: `apps/web/src/screens/scheme/SchemeScreen.tsx`, `SchemeTable.tsx`, `SchemeTotals.tsx`, `ImportSchemeDialog.tsx`, `scheme-model.ts`, `scheme-model.test.ts`
- Create: `features/m2-scheme.feature`, `e2e/steps/scheme.steps.ts`

**Interfaces:**
- Consumes: `GET/PUT /api/scheme/:courseId`, `POST /api/scheme/:courseId/import`, `GET /api/slots`, the engine's `schemeTotals`, `weeksFor` and `sequence` in the browser, the AI job routes.
- Produces: `/scheme/:courseId`, and:

```ts
export interface GroupFit { groupId: GroupId; lessonsLeft: number; slotsLeft: number; fits: boolean; over: number }
export function fitFor(inputs: PlanInputs): GroupFit[];      // runs sequence() locally and reads overflow
```

What it shows: the items in her order with kind, title, lesson count, the count as weeks for each group, the spec references, and for assessments the date, marks, length and whether it takes a whole lesson. She can reorder, edit counts, add an item of any kind, set a per-group override, and delete an item nothing depends on. A totals bar per group shows "65 teaching + 4 assessment" style totals against slots left, and turns to a warning with the number over when it does not fit; it recalculates as she types, without a round trip. "Import from my planning sheet" lists the allowlisted planning files, shows the import's findings and a preview of changes, and applies only when she accepts. "Suggest lesson counts" starts the AI job; suggestions appear beside her numbers as differences with the AI badge and a review bar. A teaching item with no pack reference is labelled "not linked to the specification"; a project is not.

- [ ] **Step 1: Write the failing tests**

```ts
test("fitFor says how many lessons are over when the scheme is too long", () => { /* c4 with 40 lessons: over > 0 for every group */ });
test("fitFor fits the base world", () => expect(fitFor(paceWorld()).every(f => f.fits)).toBe(true));
```

```gherkin
@e2e
Feature: Scheme of work
  Scenario: Totals follow my edits at once
    When I change a chapter from 4 lessons to 6
    Then the teaching total goes up by 2 for every group without the page reloading
    And that chapter shows 2 weeks for 13 1
  Scenario: Importing my planning sheet is a preview
    When I import the planning sheet
    Then I see that the sheet states 10 but its chapters add up to 13
    And nothing is saved until I accept
  Scenario: A lesson-count suggestion is shown as a difference
    When I ask for lesson-count suggestions
    Then one chapter shows "4 → 5" with the AI badge and a reason
    When I accept it
    Then the chapter has 5 lessons and a small sparkle
  Scenario: The scheme does not fit
    When I add 200 lessons to a chapter
    Then each group's total shows how many lessons do not fit
  Scenario: The screen is accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reordering works by keyboard ("Move up", "Move down" buttons on each row) as well as by drag.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): scheme of work editor with live totals and reviewable suggestions`

---

### Task 2.17: Positions, proposal preview, accept and undo; the board shows the plan

**Files:**
- Create: `apps/web/src/screens/setup/PositionsCard.tsx`, `apps/web/src/components/ProposalDiff.tsx`, `ProposalDialog.tsx`, `LessonCard.tsx`, `apps/web/src/screens/board/board-plan.ts`, `board-plan.test.ts`
- Create: `features/m2-plan.feature`, `e2e/steps/plan.steps.ts`
- Modify: `apps/web/src/screens/board/SlotCell.tsx`, `BoardScreen.tsx`

**Interfaces:**
- Consumes: positions, plans and placements routes of Task 2.12; `Proposal`.
- Produces: `<ProposalDialog proposal onAccept onCancel />`, used by every later feature that changes a plan; `<LessonCard />`; and:

```ts
export interface CardModel { slotKey: SlotKey; title: string; sub: string; state: PlacementState; kind: Lesson["kind"]; pinned: boolean; assessment: { title: string; slotUse: "whole" | "in-lesson" } | null; provenance: Provenance }
export function cardsFor(placements: PlacementView[], assessments: AssessmentView[]): Map<SlotKey, CardModel>;
```

What it shows:

- **Positions** (in Setup, per course): for each group, "next lesson" chosen from the scheme, and a list of items already done out of order. Until positions are saved, the course says "Tell the planner where each group is" and no plan is proposed.
- **Proposal dialog:** the label, a before-and-after summary per group (lessons placed, spare lessons, lessons that do not fit, date of the last content lesson), conflicts in plain sentences, and the list of changes grouped by group with old and new date. Lessons hit by a disruption come first. Buttons: "Accept" and "Cancel". If the accept is refused as stale, the dialog says "The plan changed while this was open" and offers to recompute.
- **Board:** a lesson cell now shows the lesson ("3 Markets · 2 of 4"). States look different and each has a text label: planned; assumed ("assumed taught"); taught; cover; skipped. A spare lesson shows "Spare lesson" with its purpose and the explanation from the index in a popover. A whole-slot assessment is its own card; an in-lesson one is a chip on the lesson's card. Dates before a group's go-live show a "Declared" band naming the topics declared, not individual lessons. An "Undo last change" button appears when `canUndo`.
- **Out of date:** when `upToDate` is false, because the scheme or the positions changed after the plan was accepted, the board and the scheme screen show "The plan is out of date" with "See what changes", which opens the proposal dialog. Nothing changes until she accepts.

- [ ] **Step 1: Write the failing tests**

```ts
test("an in-lesson assessment is a chip on the lesson's card, a whole-slot one is its own card", () => {});
test("a spare lesson's card says Spare lesson", () => expect(card("13 3|2026-11-26|4")).toMatchObject({ kind: "flex", title: "Spare lesson" }));
test("a merged pair is one card naming both lessons", () => {});
```

```gherkin
@e2e
Feature: A plan from positions
  Scenario: Saying where each group is leads to a proposal
    Given the course has a locked pack and a scheme but no positions
    When I set each Year 13 group's next lesson and ask for a plan
    Then I see a proposal with every group's lessons placed and no conflicts
    When I accept it
    Then the board shows lesson titles on real dates
  Scenario: Undo
    Given I accepted a change to the plan
    When I undo it
    Then the board is exactly as before
  Scenario: A stale proposal is refused
    Given a proposal is open and the scheme is then changed in another tab
    When I accept the proposal
    Then I am told the plan changed and nothing is applied
  Scenario: Spare lessons are explained
    When I open a spare lesson
    Then I see "A lesson this group has before the next checkpoint that the other groups do not. Use it for exam practice, support activities or independent study."
  Scenario: The board and dialog are accessible
    Then the page has no serious accessibility violations
```

The "Undo" scenario is the browser side of `features/08-undo.feature`.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The dialog traps focus and returns it to the control that opened it.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): positions, proposal preview with accept and undo, and the plan on the board`

---

### Task 2.18: Weekly check-in

**Files:**
- Create: `apps/web/src/screens/today/CheckIn.tsx`, `features/m2-checkin.feature`, `e2e/steps/checkin.steps.ts`
- Modify: `apps/web/src/screens/today/TodayScreen.tsx`

**Interfaces:**
- Consumes: `GET /api/checkin`, `POST /api/checkin`, the proposal dialog.

What it shows: on Today, "Did these happen as planned?" with one section per week that has unconfirmed lessons, oldest first, and inside it one row per group listing that week's lessons. One button per group confirms the whole row. Each lesson can instead be marked "cover", "skipped" or "set as homework", with an optional note. When a skip leaves a plan out of date, a banner offers "See what changes", which opens the proposal dialog. With nothing to confirm, the section says so in one line. If more than four weeks are waiting, the oldest four are shown with "and N more weeks".

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Weekly check-in
  Scenario: One click confirms a group's week
    Given last week's lessons have not been confirmed
    When I confirm last week for 13 1
    Then 13 1's lessons for that week are shown as taught on the board
    And 13 1 no longer appears in the check-in for that week
  Scenario: A skipped lesson offers a new plan
    When I mark one of 13 3's lessons as skipped
    Then I see that the plan is out of date and can preview the change
    And the preview labels the skipped lesson as a correction
  Scenario: Three weeks away
    Given three weeks of lessons have not been confirmed
    Then the check-in shows three weeks, oldest first
    And Today still shows today's lessons above it
  Scenario: The check-in is accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): weekly check-in that writes the lesson log`

---

### Task 2.19: Thin exports: Excel fortnight and Teams text

**Files:**
- Create: `packages/exporters/package.json`, `tsconfig.json`, `src/index.ts`, `src/model.ts`, `src/xlsx/fortnight.ts`, `fortnight.test.ts`, `src/teams/post.ts`, `post.test.ts`, `src/ai-note.ts`, `ai-note.test.ts`, `ai-marked.steps.test.ts`
- Create: `features/13-ai-marked-reviewed.feature`
- Create: `apps/api/src/routes/export.ts`, `export.test.ts`
- Modify: `apps/web/src/screens/board/BoardScreen.tsx` (Export menu)

**Interfaces:**
- Consumes: `exportable`, `Provenance`, board and placement data.
- Produces:

```ts
export interface ExportLesson { groupId: GroupId; date: IsoDate; period: Period; room: string | null; title: string; state: PlacementState; provenance: Provenance }
export interface FortnightExport { w1: IsoDate | null; w2: IsoDate | null; lessons: ExportLesson[]; generatedOn: IsoDate }
export function aiNote(included: readonly { provenance: Provenance }[], excluded: readonly { provenance: Provenance }[]): { statement: string | null; warning: string | null };
export function exportFortnightXlsx(data: FortnightExport): Promise<{ file: Uint8Array; warning: string | null }>;
export function teamsPostText(args: { groupId: GroupId; weekOf: IsoDate; lessons: ExportLesson[] }): { text: string; warning: string | null };
```

Routes: `GET /api/export/fortnight.xlsx?w1=` and `GET /api/export/teams?groupId=&weekOf=`. Each returns the warning in a response header and in the body's metadata, and the board shows it before the download starts. The route passes as `excluded` every AI item still awaiting review that belongs to a course in the export; in this milestone those are lesson-count suggestions, so the warning tells her the export does not reflect them.

- [ ] **Step 1: Write the feature file** for scenario 13, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
test("an unreviewed AI item is left out, with a warning that says how many", () =>
  expect(aiNote([], [aiSuggested]).warning).toBe("1 AI suggestion was left out because you have not reviewed it."));
test("reviewed AI items are named in a statement with the review date", () =>
  expect(aiNote([aiAccepted], []).statement).toMatch(/1 item was drafted by AI and reviewed on 2026-11-2\d/));
test("with no AI items there is no statement and no warning", () => expect(aiNote([engineItem], [])).toEqual({ statement: null, warning: null }));
test("the workbook has Week 1 and Week 2 sheets laid out like her timetable", async () => {
  // read the bytes back with exceljs: sheet "Week 1" has header row Mon to Fri with dates, rows P1 to P6, and the cell for Friday P6 holds "13 1" and the lesson title
});
test("a double period is one merged cell", async () => {});
test("the Teams text lists the group's lessons for the week in date order, with no markup", () =>
  expect(teamsPostText(args).text).toBe("13 1: week of 23 November\nMon 23 Nov P5: 2 Supply (3 of 4)\nWed 25 Nov P2: 2 Supply (4 of 4)\nFri 27 Nov P6: Assessment: Chapters 1-2"));
test("the export route sets the warning header when something was left out", async () => {});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** Excel is written with exceljs. The last row of each sheet holds the AI statement when there is one.
- [ ] **Step 5: Run again.** Expected: PASS, including the engine steps of scenario 13.
- [ ] **Step 6: Finish line and commit.** `feat(exporters): fortnight as Excel and a Teams post as text`

---

### Task 2.20: Timetable image upload

**Files:**
- Create: `packages/ai/src/skills/planner-import-timetable.ts`, `.claude/skills/planner-import-timetable/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/import-timetable-image.ts`, and its test; `routes/timetable.ts` gains `POST /api/timetable/image`
- Create: `packages/domain/src/timetable-diff.ts`, `timetable-diff.test.ts`
- Modify: `apps/web/src/screens/setup/TimetableEditor.tsx`, `packages/ai/src/claude-cli.ts`

**Interfaces:**
- Produces:

```ts
export interface TimetableCellChange { week: WeekLabel; weekday: Weekday; period: Period; from: string | null; to: string | null }
export function diffTimetables(current: TimetableVersion, suggested: Pick<TimetableVersion, "entries" | "duties">): TimetableCellChange[];
```

The skill's output is `{ entries: TimetableEntry[]; duties: DutyEntry[]; unsure: { week, weekday, period, note }[] }`. The item handler has kind `timetable-grid`; accepting it replaces the current version's grid after `validateTimetable`.

- [ ] **Step 1: Prove how an image reaches the CLI.** The proven flag set gives the model no file tools, so the image must travel in the request. Try a headless run that sends a small test image as an image block on standard input with `--input-format stream-json` and asks for its dominant colour. If it works, record the stream as a fixture and extend `ClaudeCodeCliProvider` for tasks with attachments. If the CLI will not take an image this way, stop: report it, leave the upload button out, and do not give the run a file tool. The seeded grid and its editor already cover the need.

- [ ] **Step 2: Write the failing tests**

```ts
test("diffTimetables lists only the cells that differ", () => {});
test("an upload is saved under data/uploads and nowhere else", async () => {});
test("an upload that is not a PNG or JPEG, or is over 10 MB, is refused", async () => {});
test("the suggestion is a reviewable item; the timetable does not change until she accepts", async () => {});
test("accepting a grid with two groups in one period is refused with the reason", async () => {});
test("cells the model was unsure about are listed for her", async () => {});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement,** and write the skill by the writing-skills loop using a synthetic timetable image you draw yourself (never her real one in a test or a commit). The skill must say: read group codes and rooms exactly as written; list any cell it cannot read under `unsure` and leave it empty; never infer a cell from the other week.
- [ ] **Step 5: Run again.** Expected: PASS. In the browser, Setup shows the suggested grid beside the current one with changed cells marked, and a review bar.
- [ ] **Step 6: Finish line and commit.** `feat(planner): suggest a timetable grid from an uploaded image`

---

### Task 2.21: M2 gate

**Files:**
- Create: `e2e/steps/schedule.steps.ts` (browser steps for `features/05-schedule-from-documents.feature`)
- Create: `docs/design/ai-teacher-planner/screens/m2-pack-review.png`, `m2-scheme.png`, `m2-proposal.png`, `m2-board-plan.png`, `m2-checkin.png`
- Modify: both `CLAUDE.md` files, `README.md`, diagrams as needed, the PR description

- [ ] **Step 1: Write the browser steps for scenario 5** on the seeded synthetic course: open the board for a fortnight, and check that each Year 13 group's lessons sit on that group's own cells, that the half-term week has none, that chapter order runs forward through the fortnight, that a card shows its spec reference, and that a spare lesson sits directly before an assessment for one group. Run `pnpm e2e`. Expected: PASS.

- [ ] **Step 2: Build the real IAL pack with Gemma.** `pnpm pack:draft --course ial-business-u4 --spec "ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf"` with the chapter list from her planning sheet and Unit 4 in scope. She reviews and locks it on the pack screen. The pack stays in `data/`; check `git status` shows nothing new.

- [ ] **Step 3: Go live for IAL with her.** Import her planning sheet and assessment schedule, and read the findings together (the 65 against 70 is expected). Enter the positions from spec appendix D: all three groups next on chapter 27, lesson 1, with the chapter 26 assessment sat on 24 and 25 November. Ask for a plan and read the proposal with her before she accepts.

- [ ] **Step 4: Check the plan against what she knows.** The slot audit and the plan's dates for the coming fortnight must match her own timetable. Any wrong date stops the gate.

- [ ] **Step 5: The gate.** Follow "Milestone gate" in the index. Screenshots come from the synthetic data folder.

- [ ] **Step 6: Commit and tag.** `docs(planner): M2 gate`, then `git tag planner-m2`.
