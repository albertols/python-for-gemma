# AI Teacher Planner M3: Disruptions, Reflow, Parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a lesson is lost or Gemma is absent, she sees what it does to each plan before anything changes, chooses how to handle it or decides later, and can undo. Calendar events cancel lessons only after she confirms them. A parity screen shows which group is short before each checkpoint and offers ways to catch up.

**Architecture:** A disruption is a stored fact; re-planning is a separate choice. A change is previewed as one proposal per affected plan, computed by the M2 sequencer from hypothetical inputs. Parity and catch-up options are pure functions over a snapshot.

**Tech Stack:** As the index. Nothing new.

**Spec:** sections 10.2, 10.7, 10.8, 10.13 of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md).

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Start with the check described under "Before starting a milestone" in the index.

## Review Focus

1. **A preview is accepted after something else changed.** Nothing is stored, including the fact. Task 3.3.
2. **An absence is entered for dates already in the past.** History is corrected and labelled as a correction; lessons she has confirmed as taught are not touched. Task 3.3.
3. **The same disruption is entered twice, or two overlap.** Slots are cancelled once; removing one leaves the other in force. Tasks 3.1 and 3.3.
4. **The school changes an event's wording slightly.** It is asked again as a new wording and is a "possible disruption" until confirmed; the old confirmation is not silently reused or silently dropped. Tasks 3.2 and 3.6.
5. **A closure falls on today or tomorrow.** The freeze horizon does not hide it: the hit lessons are released and listed first. Task 3.3.

## The test worlds

`paceWorld()` from M2 is reused. Two variations are added to `@planner/fixtures`:

- `shortWorld()`: `a1` is dated 2026-11-26 and `c1` has 4 lessons, so 7 lessons are due. Slots before each group's `a1` slot are 8, 7 and 7 for 13 1, 13 3 and 13 5. 13 1 has one spare lesson; 13 3 and 13 5 have none.
- `absence()`: a teacher-scope `cover` disruption from 2026-11-17 to 2026-11-19. It touches 13 1 once (18 Nov P2), 13 3 three times (17 Nov P5, 19 Nov P3 and P4) and 13 5 twice (17 Nov P1, 19 Nov P6).

---

### Task 3.1: Cover choices, homework, holds and stranded lessons

**Files:**
- Create: `packages/domain/src/disruptions.ts`, `disruptions.test.ts`, `disruptions.prop.test.ts`
- Modify: `packages/domain/src/plan.ts`, `sequence.ts`, `pace.ts`, `fixtures/src/pace-world.ts`

**Interfaces:**
- Consumes: `sequence`, `planWindows`.
- Produces: `sequence` now honours `coverChoices`, `homework` and `holds`. All three have been in `PlanInputs` since M2 and were always empty. And:

```ts
export function strandedPlacements(head: PlanSnapshot, slots: readonly Slot[]): Placement[];
export function teacherLedMissed(snapshot: PlanSnapshot): Record<GroupId, LessonId[]>;        // placements with viaCover or state "cover"
export function affectedBy(head: PlanSnapshot, slots: readonly Slot[], disruption: Disruption, groups: readonly Group[]): { placement: Placement; slot: Slot }[];
export function mergeDisruptions(list: readonly Disruption[]): Disruption[];                   // drops exact duplicates by scope, dates, periods and effect
```

Rules:

- A `cover` slot with choice `keep`, or with no choice, is usable; the lesson placed there has `viaCover: true`.
- With choice `lost`, the slot is not usable.
- With choice `swap`, `swapLessonId` is placed there with `viaCover: true`, as a slot pin would place it, and the lesson that was planned there flows on.
- A lesson in `homework` is not streamed. It gets a placement with `slotKey: null` and state `homework`, and counts as delivered.
- A hold cuts what is due before its checkpoint: lessons from `firstDeferredLessonId` onward, in the course's own order, are not required there for any group.
- A head placement is stranded when it is `planned` and its slot is now cancelled, or its slot is now `cover` and the placement has `viaCover: false`.
- `teacherLedMissed` counts content lessons only; a spare lesson under cover is not counted.

- [ ] **Step 1: Write the failing tests**

```ts
test("an absence with cover keeps every lesson where it was and marks it as cover", () => {
  const s = sequence(withAbsence(paceWorld()));
  expect(slotsOf(s)).toEqual(slotsOf(first));
  expect(teacherLedMissed(s)).toMatchObject({ "13 1": [expect.any(String)], "13 3": expect.arrayContaining([expect.any(String)]) });
  expect(Object.values(teacherLedMissed(s)).map(l => l.length)).toEqual([1, 3, 2]);
});
test("treating a cover slot as lost moves the planned lesson on", () => {
  // choice lost for 13 3|2026-11-19|3: c2#2 moves to 19 Nov P4, and 13 3's spare lesson before a1 is gone
});
test("swapping puts the chosen lesson in the cover slot and the planned one after it", () => {
  // choice swap c3#1 into 13 3|2026-11-17|5: c3#1 is there with viaCover true; c2#1 is on 19 Nov P3
});
test("a swap to a lesson that is already taught is a conflict", () => {});
test("a lesson set as homework takes no slot and counts as delivered", () => {
  // shortWorld with 13 3|2026-11-17|5 cancelled and homework for 13 3 c2#3: overflow is empty
});
test("a hold moves a lesson past the assessment for everyone, and the others gain a spare lesson", () => {
  // shortWorld with 13 3|2026-11-17|5 cancelled and a hold at cp:a1 from c2#3:
  // overflow is empty; c2#3 is after a1 for all three groups; 13 1 has 2 spare lessons before a1 and 13 5 has 1
});
test("after an absence is recorded, the old head's lessons on cover slots are stranded", () =>
  expect(strandedPlacements(first, slotsWithAbsence).map(p => p.groupId).sort()).toEqual(["13 1", "13 3", "13 3", "13 3", "13 5", "13 5"]));
test("after the choices are applied, nothing is stranded", () => expect(strandedPlacements(sequence(withAbsence(world)), slotsWithAbsence)).toEqual([]));
test("history is never stranded", () => { /* a cancelled slot in the past holding a taught lesson */ });
test("the same disruption entered twice cancels each slot once", () => expect(mergeDisruptions([d, { ...d, id: "d2" }])).toHaveLength(1));
test("two overlapping disruptions: removing one leaves the other in force", () => {});
test("affectedBy lists the lessons a disruption would hit, in date order", () => {});

// disruptions.prop.test.ts: every property of sequence still holds with random cover choices, homework and holds
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `loadPlanInputs` in the API now reads cover choices, homework and holds from the database (Task 3.3 adds their tables; until then they stay empty).
- [ ] **Step 4: Run again.** Expected: PASS, with every M2 test still passing.
- [ ] **Step 5: Finish line and commit.** `feat(domain): cover choices, homework, holds and stranded lessons`

---

### Task 3.2: Calendar events that may cancel lessons

> **Changed by the M2 pre-flight (25 Nov 2026).** `Provenance` is now the object in `provenance.ts`; the old string union is `Origin`, and `EventClassification.provenance` is typed `Origin` (values unchanged). Decide here whether it widens to `Provenance` (a migration if so). M2 takes migrations 0008 to 0010, so this task's file is `0011_disruptions_events.sql` or later, not 0004. Step 3's update of `GET /api/slots` and `loadPlanInputs` is already done in M1b (`loadPlanInputs` builds on `loadPlanning`); nothing to change.

> **Changed by M1b (24 Nov 2026).** The engine part of this task, the classification repository, `GET /api/events`, and the screen without AI were built in M1b Task 1b.3. That version has the `EventClassification` shape with `onlyDates` and `until` (not `exceptDates`), the extra pre-sort rows, and migration `0005_event_classifications.sql`. What is left here: the `planner-classify-calendar-events` skill and its job; `event-suggestion` items; and making confirmations go through the change preview (Task 3.3) once plans exist. Number this task's migration from the next free number. Start by comparing with the M1b code: the code wins.

**Files:**
- Create: `packages/domain/src/events.ts`, `events.test.ts`
- Create: `packages/ai/src/skills/planner-classify-calendar-events.ts`, `.claude/skills/planner-classify-calendar-events/SKILL.md`, `schema.json`
- Create: `apps/api/src/db/migrations/0011_disruptions_events.sql` (next free number), `repos/sqlite/event-repo.ts`, `usecases/classify-events.ts`, and tests

**Interfaces:**
- Consumes: `CalendarRow`, `CalendarDay`, `Group`, `Slot`, `Disruption`, `startJob`, `registerItemHandler`.
- Produces:

```ts
export type EventCategory = "staff-only" | "mock-exams" | "external-exam" | "study-leave" | "trip" | "assembly" | "meeting" | "other";
export interface EventCandidate { wordingKey: string; text: string; column: "secondary" | "events" | "assessments"; yearGroup: YearGroup | null; dates: IsoDate[]; presort: { category: EventCategory; suggestion: "cancels" | "no-effect" | "unsure"; rule: string | null } }
export interface EventClassification { wordingKey: string; yearGroup: YearGroup | null; decision: "cancels" | "no-effect"; groupIds: GroupId[] | null; periods: Period[] | null; exceptDates: IsoDate[]; provenance: Provenance }
export function wordingKey(text: string): string;
export function eventCandidates(args: { rows: readonly CalendarRow[]; days: readonly CalendarDay[]; groups: readonly Group[]; slots: readonly Slot[] }): EventCandidate[];
export function disruptionsFromEvents(candidates: readonly EventCandidate[], classifications: readonly EventClassification[], groups: readonly Group[]): Disruption[];
export function possibleDisruptions(candidates: readonly EventCandidate[], classifications: readonly EventClassification[]): { date: IsoDate; yearGroup: YearGroup | null; text: string }[];
```

Rules:

- A cell with several lines gives one candidate per line. `wordingKey` is the text in lower case with runs of spaces collapsed; digits are kept.
- Candidates come from two places. The `SECONDARY EVENT` column on pupil days gives whole-school candidates (`yearGroup: null`). The `Events` and `Assessments` cells of Years 11, 12 and 13 give year candidates; for Year 12 the assessments cell is the IB one and for Year 13 the A level one, matching her groups' programmes.
- A date is kept only when she has a slot that day in the year concerned. A candidate with no dates left is dropped.
- The fixed pre-sort, first match wins, case-insensitive:

| Text contains | Category | Suggestion |
|---|---|---|
| `staff only`, `staff training`, `inset`, `closed to pupils` | staff-only | cancels |
| `study leave` | study-leave | cancels |
| `mock` | mock-exams | cancels |
| `official exam`, `external exam` | external-exam | cancels |
| `trip`, `visit`, `excursion`, `conference` | trip | unsure |
| `assembly`, `photo`, `talk`, `workshop` | assembly | unsure |
| `parent`, `meeting`, `deadline`, `report` | meeting | no-effect |
| anything else | other | unsure |

- A suggestion is never a decision. Only an `EventClassification` with decision `cancels` produces disruptions: one `cancelled` disruption per date not in `exceptDates`, scoped to the year, or to each group in `groupIds`, or to the school when `yearGroup` is null. Its id is `ev:<wordingKey>:<date>:<scope>`, its reason is the event text, its source is `calendar`.
- A candidate with no classification is a possible disruption on each of its dates.

The skill takes `{ candidates: { wordingKey, text, yearGroup, column }[] }` for the `unsure` ones only and returns `{ suggestions: { wordingKey, category, suggestion, reason }[] }`. Its items have kind `event-suggestion`. Accepting one does not classify anything by itself: it fills in the suggestion she then confirms.

- [ ] **Step 1: Write the failing tests** on the synthetic year

```ts
test("the mock week is one Year 13 candidate with five dates, pre-sorted as cancels", () =>
  expect(candidate("mock exams", 13)).toMatchObject({ dates: ["2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14", "2027-01-15"], presort: { category: "mock-exams", suggestion: "cancels" } }));
test("the Year 12 trip is unsure", () => expect(candidate("geography trip", 12)?.presort.suggestion).toBe("unsure"));
test("the staff training day inside term is a whole-school candidate", () =>
  expect(candidate("staff training day", null)).toMatchObject({ dates: ["2027-05-04"], presort: { suggestion: "cancels" } }));
test("the staff days before term are not candidates, because there are no slots then", () => expect(candidate("staff training", null)).toBeUndefined());
test("an event for a year she does not teach is not a candidate", () => {});
test("a two-line cell gives two candidates", () => {});
test("nothing is cancelled until she confirms", () => expect(disruptionsFromEvents(candidates, [], SEED_GROUPS)).toEqual([]));
test("confirming the mock week cancels Year 13 lessons on those five days and nobody else's", () => {
  const slots = buildSlots({ ...base, disruptions: disruptionsFromEvents(candidates, [confirmMocksY13], SEED_GROUPS) });
  expect(statusOn(slots, "13 1", "2027-01-11")).toBe("cancelled");
  expect(statusOn(slots, "IB S", "2027-01-13")).toBe("open");
  expect(reasonOn(slots, "13 1", "2027-01-11")).toBe("Mock exams");
});
test("a confirmation can exclude a date and can name periods", () => {});
test("an unconfirmed candidate is a possible disruption on each date; a confirmed 'no effect' is not", () => {});
test("a changed wording is a new candidate and the old confirmation does not apply to it", () => { /* "Mock exams" -> "Mock exams (P1-4)" */ });
test("the input sent to the model holds event text for Years 11 to 13 and the school column only", async () => { /* no other columns, no row dumps */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the engine functions, the repository for classifications, and the use case that merges `disruptionsFromEvents` with teacher-entered disruptions when slots are built. Update `GET /api/slots` and `loadPlanInputs` to use it.
- [ ] **Step 4: Write the skill** by the writing-skills loop on synthetic wordings. It must say: decide from the wording alone; answer `unsure` when the text does not say pupils are out of lessons; give the reason in one sentence; never guess which periods.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Finish line and commit.** `feat(planner): calendar events as candidates she confirms before they cancel lessons`

---

### Task 3.3: Previewing and recording a change

**Files:**
- Create: `packages/domain/src/reflow.ts`, `reflow.test.ts`, `reflow.prop.test.ts`, `absence.steps.test.ts`
- Create: `features/07-absence.feature`
- Create: `apps/api/src/usecases/preview-change.ts`, `apply-change.ts`, `routes/changes.ts`, and tests
- Create: `apps/api/src/repos/sqlite/disruption-repo.ts`

**Interfaces:**
- Consumes: `propose`, `strandedPlacements`, `affectedBy`, `teacherLedMissed`, `loadPlanInputs`, `acceptProposal`.
- Produces:

```ts
// domain
export type PlanChange =
  | { kind: "add-disruption"; disruption: Disruption; coverChoices: CoverChoice[] }
  | { kind: "remove-disruption"; disruptionId: string }
  | { kind: "classify-events"; classifications: EventClassification[] }
  | { kind: "set-cover-choices"; coverChoices: CoverChoice[] }
  | { kind: "set-timetable"; version: TimetableVersion }
  | { kind: "set-terms"; terms: Term[] }
  | { kind: "decisions"; pins?: Pin[]; merges?: Merge[]; homework?: HomeworkMode[]; holds?: PaceHold[]; removePinIds?: string[]; removeMergeIds?: string[] };
export interface ChangePreview { proposals: Proposal[]; affected: { groupId: GroupId; lessonId: LessonId; slotKey: SlotKey; itemTitle: string }[]; teacherLedLost: Record<GroupId, number>; corrections: number }
export function previewChange(args: { change: PlanChange; plans: { planId: string; baseRevisionId: string | null; head: PlanSnapshot | null; inputsBefore: PlanInputs; inputsAfter: PlanInputs }[] }): ChangePreview;
```

| Route | Does |
|---|---|
| `POST /api/changes/preview` | Body: a `PlanChange`. Stores nothing. Returns the `ChangePreview`, with a `candidateKey` per proposal |
| `POST /api/changes/apply` | Body `{ change, mode: "apply" \| "record-only", accept: { planId, baseRevisionId, candidateKey }[] }`. In one transaction: stores the fact or decision; in `apply` mode, accepts the listed proposals. If any is stale, nothing is stored and the answer is 409 |
| `GET /api/disruptions`, `DELETE` through `remove-disruption` | Lists teacher-entered disruptions |
| `GET /api/plans/:courseId` | Now also returns `stranded: Placement[]` |

`previewChange` returns one proposal for each plan whose candidate differs from its head or has a new conflict. A plan the change cannot touch is not in the list.

**A disruption dated in the past** is a fact about what happened, so applying it also writes the lesson log: each affected lesson that is still `assumed` gets a `cover` entry (choice keep) or a `skipped` entry (choice lost, or a cancelled slot). A lesson she has already confirmed is left as she confirmed it. These log entries are what `corrections` counts, and the preview shows them before anything is written.

- [ ] **Step 1: Write the feature file** for scenario 7 with the wording of spec section 17, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
// reflow.test.ts
test("an absence previews the lessons hit, the topics, and teacher-led lessons lost per group", () => {
  const p = previewChange({ change: { kind: "add-disruption", disruption: absence(), coverChoices: [] }, plans: [ialPlan] });
  expect(p.affected.map(a => a.groupId).sort()).toEqual(["13 1", "13 3", "13 3", "13 3", "13 5", "13 5"]);
  expect(p.teacherLedLost).toEqual({ "13 1": 1, "13 3": 3, "13 5": 2 });
});
test("a Year 13 closure gives a proposal for the IAL plan and none for IB or IGCSE", () => {});
test("a whole-school closure gives one proposal per plan that has lessons that day", () => expect(p.proposals.map(x => x.planId).sort()).toEqual(["ial-business-u4", "ib-business", "igcse-business"]));
test("a closure tomorrow releases tomorrow's frozen lessons and lists them first", () => {
  // today 2026-11-16, horizon ends 2026-11-17; cancel Year 13 on 2026-11-17
  expect(p.proposals[0]?.diff.entries[0]).toMatchObject({ hitByDisruption: true, from: expect.stringContaining("2026-11-17") });
});
test("an absence entered for last week is a correction, and a lesson she confirmed as taught is left alone", () => {
  // today 2026-11-23; absence 2026-11-17 to 19; 13 3's lesson on 17 Nov is logged taught, the rest are assumed
  expect(p.corrections).toBe(5);
});
test("removing a disruption previews the lessons moving back", () => {});
test("a timetable version starting next term previews moves from that date only", () => { /* version from 2027-01-08 moving 13 1 from Friday P6 to P5: no entry dated before 2027-01-08 */ });
test("once a plan exists, saving the timetable or the terms through their own routes is refused with 'preview this change first'", async () => {});

// absence.steps.test.ts, scenario 7: the preview offers keep, swap and lost for each cover slot; names the topics; shows 1, 3 and 2;
// and with "record, decide later" the six lessons are stranded and no other placement differs from the head

// routes: apply-change.test.ts
test("record and apply stores the disruption and the new revisions together", async () => {});
test("record only stores the disruption; heads do not change; the plans report stranded lessons", async () => {});
test("a stale proposal stores nothing, not even the disruption", async () => { /* change the scheme between preview and apply: 409; GET /api/disruptions is empty */ });
test("undo after apply returns the plan to its parent and keeps the disruption, so the lessons are stranded again", async () => {});
test("deciding later and then choosing: set-cover-choices previews and applies like any change", async () => {});
test("a preview stores nothing", async () => {});

// reflow.prop.test.ts
// - a change scoped to one group never produces a proposal for a plan that group is not in
// - for any change, history placements are deep-equal in head and candidate, except entries counted in `corrections`
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** The API builds `inputsBefore` with `loadPlanInputs` and `inputsAfter` by applying the change to a copy; the database is written only in `apply-change.ts`.
- [ ] **Step 5: Run again.** Expected: PASS, including scenario 7.
- [ ] **Step 6: Update diagram 06** with the `architecture-visual-docs` skill: facts, the preview, and the two ways to record.
- [ ] **Step 7: Finish line and commit.** `feat(planner): preview a change across plans, record it, apply or decide later`

---

### Task 3.4: Parity

**Files:**
- Create: `packages/domain/src/parity.ts`, `parity.test.ts`, `parity.prop.test.ts`, `worked-example.steps.test.ts`
- Create: `features/06-worked-example.feature`
- Create: `apps/api/src/routes/parity.ts`, and its test

**Interfaces:**
- Consumes: `planWindows`, `teacherLedMissed`, `delivered`, `shortWorld`.
- Produces:

```ts
export interface CheckpointParity { checkpoint: Checkpoint; slack: Record<GroupId, number>; lessonsShort: Record<GroupId, LessonId[]> }
export interface ParityReport { groupIds: GroupId[]; jitter: number; checkpoints: CheckpointParity[]; gapToday: { ahead: GroupId; behind: GroupId; lessons: number; beyondJitter: boolean } | null; teacherLedMissed: { groupId: GroupId; unit: string; lessons: number }[] }
export function cycleJitter(timetable: TimetableVersion, groupIds: readonly GroupId[]): number;
export function parity(args: { snapshot: PlanSnapshot; inputs: PlanInputs; timetable: TimetableVersion; unitOf: (itemId: string) => string }): ParityReport[];
```

`GET /api/parity/:courseId` returns `ParityReport[]`, one per pace set of two or more groups.

Definitions:

- **Slack** at a checkpoint is the group's spare lessons in that window, or minus the number of lessons it is short. In `paceWorld()` before `a1` it is 0, +1 and 0.
- **Jitter** is the largest difference in lessons taught between any two of the groups at the end of any day of one undisrupted fortnight, all starting level.
- **Gap today** compares how far each group has got in the course's own lesson order, counting delivered lessons.

- [ ] **Step 1: Write the feature file** for scenario 6, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
test("the timetable's jitter for the three Year 13 groups is 1", () => expect(cycleJitter(SEED_TIMETABLE, ["13 1", "13 3", "13 5"])).toBe(1));
test("jitter for one group is 0", () => expect(cycleJitter(SEED_TIMETABLE, ["13 1"])).toBe(0));
test("slack before the assessment in the base world", () => expect(slackAt("cp:a1")).toEqual({ "13 1": 0, "13 3": 1, "13 5": 0 }));
test("the worked example: 13 3 loses a lesson with no spare one and is one short", () => {
  // shortWorld with 13 3|2026-11-17|5 cancelled
  expect(slackAt("cp:a1")).toEqual({ "13 1": 1, "13 3": -1, "13 5": 0 });
  expect(shortAt("cp:a1")["13 3"]).toEqual(["c2#3"]);
});
test("with a spare lesson in the window, the spare lesson goes and nobody is short", () => {
  // paceWorld with 13 3|2026-11-17|5 cancelled
  expect(slackAt("cp:a1")).toEqual({ "13 1": 0, "13 3": 0, "13 5": 0 });
});
test("a gap within the jitter is not flagged; a larger one is", () => {
  // 13 5 positioned two lessons ahead: lessons 2, beyondJitter true. One lesson ahead: beyondJitter false.
});
test("cover lessons are counted per unit, and position alone does not show them", () => {
  const r = report(sequence(withAbsence(paceWorld())));
  expect(r.teacherLedMissed).toContainEqual({ groupId: "13 3", unit: "u1", lessons: 3 });
  expect(r.gapToday?.beyondJitter ?? false).toBe(false);
});
test("a plan with one group has no parity report", () => expect(parity(singleGroupArgs)).toEqual([]));

// parity.prop.test.ts
// - slack is negative exactly when lessonsShort is not empty
// - the sum of positive slack over a window equals that window's spare lessons
```

Scenario 6's steps run both variants and assert that `catchUpOptions` (Task 3.5) returns at least one option for 13 3 in the first; until Task 3.5 exists, that last step is marked pending and Task 3.5 completes it.

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run again.** Expected: PASS except the pending step.
- [ ] **Step 6: Finish line and commit.** `feat(domain): parity by slack before checkpoints, jitter and teacher-led lessons missed`

---

### Task 3.5: Catch-up options

**Files:**
- Create: `packages/domain/src/catchup.ts`, `catchup.test.ts`
- Modify: `packages/domain/src/worked-example.steps.test.ts`, `apps/api/src/routes/parity.ts`

**Interfaces:**
- Consumes: `propose`, `parity`, `PlanChange`.
- Produces:

```ts
export type CatchUpKind = "use-buffer" | "hold-others" | "condense" | "homework" | "wait";
export interface CatchUpOption { kind: CatchUpKind; title: string; detail: string; change: PlanChange | null; proposal: Proposal | null; shortBefore: number; shortAfter: number; levelAgainOn: IsoDate | null }
export function catchUpOptions(args: { planId: string; baseRevisionId: string | null; head: PlanSnapshot; inputs: PlanInputs; timetable: TimetableVersion; groupId: GroupId; checkpointId: string }): CatchUpOption[];
```

`GET /api/parity/:courseId/options?groupId=&checkpointId=` returns them, each proposal with its `candidateKey`. Choosing one goes through `POST /api/changes/apply` with the option's `change`.

What each option is, for a group that is `n` lessons short at a checkpoint:

| Kind | Offered when | Its change |
|---|---|---|
| `condense` | The group has two lessons of one item still to teach before the checkpoint | A `Merge` of the last such pair. Title: "Condense two lessons into one" |
| `homework` | The group has at least one lesson due | `HomeworkMode` for the last lesson due. Title: "Set one lesson as flipped work or homework" |
| `hold-others` | Another group in the set is not short | A `PaceHold` at this checkpoint from the first lesson the group is short of. Title: "Keep all groups together: teach it after the assessment". Detail names the lesson and how many spare lessons the others gain |
| `use-buffer` | A buffer item lies between this checkpoint and the next | None. Detail says which buffer absorbs it and by what date |
| `wait` | Always | None. Detail gives `levelAgainOn`: the first date in the head plan on which the group has taught every lesson it was short of and is within the jitter of every other group |

Options are returned in the table's order. For options with a change, `proposal` is computed with `propose` and `shortAfter` is read from it.

- [ ] **Step 1: Write the failing tests** on `shortWorld()` with `13 3|2026-11-17|5` cancelled

```ts
test("condense merges 13 3's last two lessons due and nobody is short", () => {
  const o = option("condense");
  expect(o.change).toMatchObject({ kind: "decisions", merges: [{ groupId: "13 3", first: "c2#2", second: "c2#3" }] });
  expect([o.shortBefore, o.shortAfter]).toEqual([1, 0]);
});
test("homework sets c2#3 as homework for 13 3 only", () => {});
test("hold keeps c2#3 until after the assessment for all three, and the others gain a spare lesson", () => {
  const o = option("hold-others");
  expect(o.shortAfter).toBe(0);
  expect(o.detail).toContain("13 1");
});
test("wait names the date the groups are level again", () => expect(option("wait").levelAgainOn).toBe("2026-11-26"));
test("use-buffer is offered only when a buffer comes before the next checkpoint", () => {});
test("each option's proposal changes only what its title says", () => { /* condense: 13 1 and 13 5 placements are unchanged */ });
test("a group that is not short gets only 'wait', with no date", () => {});
test("two lessons short: condense and homework each close one, and say so", () => expect(option2("condense").shortAfter).toBe(1));
```

In the "wait" test the date is 26 November: 13 3 sits `a1` in period 3 that day and teaches the lesson it was short of, `c2#3`, in period 4. By the end of the day all three groups have taught seven lessons.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement,** and complete the pending step of scenario 6.
- [ ] **Step 4: Run again.** Expected: PASS, including scenario 6.
- [ ] **Step 5: Finish line and commit.** `feat(domain): catch-up options as previewable changes`

---

### Task 3.6: Calendar re-import

**Files:**
- Create: `packages/domain/src/reimport.ts`, `reimport.test.ts`, `reimport.steps.test.ts`
- Create: `features/16-reimport.feature`
- Modify: `apps/api/src/usecases/import-calendar.ts`, `routes/calendar.ts`, and tests
- Modify: `fixtures/src/synthetic-calendar.ts` (options to add a closure and to reword an event)

**Interfaces:**
- Consumes: `CalendarRow.hash`, `eventCandidates`, `previewChange`.
- Produces:

```ts
export interface CalendarChange { date: IsoDate; kind: "added" | "removed" | "label-changed" | "text-changed"; before: CalendarRow | null; after: CalendarRow | null }
export function diffCalendar(last: readonly CalendarRow[], next: readonly CalendarRow[]): CalendarChange[];
export function newCandidates(before: readonly EventCandidate[], after: readonly EventCandidate[]): EventCandidate[];
```

`PlanChange` gains `{ kind: "calendar-reimport"; rows: CalendarRow[] }`. Routes: `POST /api/calendar/import/preview` returns `{ ok, findings, changes, newEvents, preview: ChangePreview }` and stores nothing. `POST /api/calendar/import/apply` takes `{ fileHash, mode, accept }` and behaves like `POST /api/changes/apply`; if the file on disk no longer has that hash, it is refused. The first import of all still goes through `POST /api/calendar/import`.

- [ ] **Step 1: Write the feature file** for scenario 16, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
test("the same rows give no changes", () => expect(diffCalendar(rows, rows)).toEqual([]));
test("a day that loses its label is label-changed", () => expect(diffCalendar(rows, withClosure("2026-12-10"))).toEqual([expect.objectContaining({ date: "2026-12-10", kind: "label-changed" })]));
test("changed event text is text-changed and gives a new candidate", () => {});
test("row order does not matter", () => {});
// reimport.steps.test.ts, scenario 16
// - import the same workbook twice: no changes, no proposals, the head revision id is the same
// - the school adds a closure on 2026-12-10: the preview has a proposal for each plan with lessons that day
// - the Year 13 mock week, already confirmed, is still confirmed and still cancels after the re-import
// routes
test("previewing a re-import stores nothing", async () => {});
test("applying with record-only stores the new rows and leaves lessons on the closed day stranded", async () => {});
test("applying after the file changed again is refused", async () => {});
test("a re-import whose workbook has an error stores nothing and keeps the old calendar", async () => {});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** Her confirmations and teacher-entered disruptions live in their own tables and are never rewritten by an import.
- [ ] **Step 5: Run again.** Expected: PASS, including scenario 16.
- [ ] **Step 6: Finish line and commit.** `feat(planner): calendar re-import as a previewed change that keeps her confirmations`

---

### Task 3.7: "A lesson was lost": the absence and closure flow

> **Changed by the M2 pre-flight (25 Nov 2026).** The browser steps of `features/08-undo.feature` are written in Task 2.17 (`e2e/steps/undo.steps.ts`), not here; write only the steps for `07-absence.feature` and `m3-lost-lesson.feature`.

> **Changed by M1b (24 Nov 2026).** Stored disruptions, their routes and a "Lessons were cancelled" dialog without a plan preview were built in M1b Task 1b.1. Extend that dialog here (absence, cover choices, preview with diffs). Do not build a second one.

**Files:**
- Create: `apps/web/src/screens/today/LostLessonDialog.tsx`, `CoverChoices.tsx`, `apps/web/src/components/ChangePreviewPanel.tsx`, `StrandedBanner.tsx`
- Create: `e2e/steps/absence.steps.ts` (browser steps for `features/07-absence.feature`; `08-undo` is Task 2.17's), `features/m3-lost-lesson.feature`
- Modify: `TodayScreen.tsx`, `BoardScreen.tsx`, `SlotCell.tsx`

**Interfaces:**
- Consumes: `POST /api/changes/preview`, `POST /api/changes/apply`, `GET /api/plans/:courseId`, `ProposalDiff`.
- Produces: `<ChangePreviewPanel preview onApply onRecordOnly onCancel />`, reused by Tasks 3.8 and 3.9 and by M5.

What it shows: the dialog opens from "A lesson was lost" on Today and from a lesson's menu on the board. First, what happened: "I was absent" (from and to dates) or "Lessons were cancelled" (who: the whole school, a year, or chosen groups; dates; optionally periods; a reason). For an absence, each affected lesson is listed with three choices: "Class did the planned lesson as cover work" (the default), "Swap in another lesson" (pick from that group's next five lessons), "Lesson lost". The preview updates as she chooses. It shows the lessons hit and their topics, teacher-led lessons lost per group, and one diff per affected plan. Three buttons: "Record and apply", "Record, decide later", "Cancel".

When a plan has stranded lessons, the board marks each with "Needs a decision" and a banner says how many; the banner reopens the choices. "Undo last change" on the board undoes the plan change and the banner returns, because the absence itself is kept.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: A lesson was lost
  Scenario: A closure is previewed before anything changes
    When I record that Year 13 lessons were cancelled on 26 November 2026 for "Trip"
    Then I see which lessons are hit, listed first
    And the board has not changed yet
    When I choose "Record and apply"
    Then the cancelled lessons show "Trip" on the board
  Scenario: Deciding later leaves the lessons stranded
    When I record an absence from 24 to 26 November 2026 and choose "Record, decide later"
    Then six Year 13 lessons are marked "Needs a decision"
    And no other lesson has moved
  Scenario: Cancel stores nothing
    When I preview a closure and choose "Cancel"
    Then the slot audit shows no cancelled lessons
  Scenario: The dialog is usable by keyboard and accessible
    Then the page has no serious accessibility violations
```

The browser tests run with today fixed at 20 November 2026, so they use dates in the following week. The steps for scenario 7 follow the feature's wording: enter the absence, check the three choices, the topics and a count of teacher-led lessons for each group, then record and decide later. The steps for scenario 8 accept a reflow, undo it, and compare the board with a snapshot taken before.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): record an absence or closure with a preview, apply or decide later`

---

### Task 3.8: Confirming calendar events, and re-import in Setup

> **Changed by M1b (24 Nov 2026).** The events card exists (M1b Task 1b.3). This task adds the AI "Ask Claude about the ones marked not sure" flow and the change preview on confirm, and builds the re-import panel. Task 3.6 must keep M1b's label corrections, resolutions, classifications and teacher disruptions across re-import, which M1b already tests.

**Files:**
- Create: `apps/web/src/screens/setup/EventsCard.tsx`, `EventRow.tsx`, `ReimportPanel.tsx`
- Create: `features/m3-events.feature`, `e2e/steps/events.steps.ts` (also the browser steps for `features/16-reimport.feature`)
- Modify: `SetupScreen.tsx`, `CalendarImportCard.tsx`, `SlotCell.tsx`

**Interfaces:**
- Consumes: `GET /api/events` (candidates with their classification or suggestion), `POST /api/changes/preview` and `apply` with `classify-events`, the AI job routes, the re-import routes of Task 3.6.

Add `GET /api/events` in this task: it returns each candidate with `classification`, `presort` and any reviewed AI suggestion.

What it shows: in Setup, "Calendar events that may affect your lessons". Three lists: "Suggested: cancels lessons", "Not sure", "Suggested: no effect". Each row has the event text, the year, how many of her lessons fall on its dates, and where the suggestion came from: a rule (named) or AI (badge and reason). Each row has two choices, "Cancels my lessons" and "Does not affect my lessons"; choosing the first opens details (which groups, which periods, dates to leave out). "Ask Claude about the ones marked not sure" starts the job. Confirming opens the change preview, as in Task 3.7. On the board, a lesson on a date with an unconfirmed event shows a "Possible disruption" marker with the event text.

Importing a calendar when one exists opens the re-import panel: findings, the list of changed days, new event wordings, and the change preview. "Nothing changed" is said in one line when that is the case.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Calendar events
  Scenario: Nothing is cancelled until I confirm
    Then the Year 13 lessons on 11 January 2027 show "Possible disruption: Mock exams"
    And those lessons are still planned
  Scenario: Confirming the mock week
    When I confirm that "Mock exams" cancels my Year 13 lessons
    Then I see a preview for the IAL plan only
    When I apply it
    Then the Year 13 lessons that week show as cancelled with the reason "Mock exams"
  Scenario: An AI suggestion is marked and still needs me
    When I ask Claude about the events marked not sure
    Then "Geography trip" shows a suggestion with the AI badge and a reason
    And it is still listed as unconfirmed
  Scenario: The events list is accessible
    Then the page has no serious accessibility violations
```

The steps for scenario 16 import the same calendar and see "Nothing changed", then import the variant with a closure and see the preview, then check the mock week is still confirmed.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): confirm calendar events, see possible disruptions, re-import with a preview`

---

### Task 3.9: Parity screen

**Files:**
- Create: `apps/web/src/screens/parity/ParityScreen.tsx`, `ParityTable.tsx`, `CatchUpOptions.tsx`
- Create: `e2e/steps/parity.steps.ts` (browser steps for `features/06-worked-example.feature`), `features/m3-parity.feature`
- Modify: `apps/web/src/routes.tsx`, `AppShell.tsx`

**Interfaces:**
- Consumes: `GET /api/parity/:courseId`, `GET /api/parity/:courseId/options`, `ChangePreviewPanel`.
- Produces: `/parity/:courseId`.

What it shows: a table with one row per checkpoint and one column per group. Each cell says "level", "1 spare" or "1 short" in words, with an icon; a short cell has a "See options" button. Above the table: where each group is today, the gap in lessons, and a line that explains jitter ("These groups are normally up to 1 lesson apart during a fortnight, because of the timetable"). Below: teacher-led lessons missed per group and unit, with the sentence "The class covered these with cover work." Options are listed with what each changes, lessons short before and after, and a "Preview" button that opens the change preview. Options with nothing to change say "Nothing to do" and why.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Parity
  Scenario: Slack before each checkpoint
    When I open parity for the Year 13 course
    Then each checkpoint shows level, spare or short for 13 1, 13 3 and 13 5 in words
  Scenario: A catch-up option is a preview
    Given 13 3 is one lesson short before an assessment
    When I open the options and preview "Condense two lessons into one"
    Then I see the change for 13 3 only
    When I apply it
    Then 13 3 is level at that checkpoint
  Scenario: The screen is accessible
    Then the page has no serious accessibility violations
```

The steps for scenario 6 seed the short world, cancel one 13 3 lesson through the lost-lesson dialog, and check that the parity screen shows 13 3 one lesson short with at least one option.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): parity screen with catch-up options`

---

### Task 3.10: M3 gate

**Files:**
- Create: `docs/design/ai-teacher-planner/screens/m3-lost-lesson.png`, `m3-events.png`, `m3-parity.png`
- Modify: both `CLAUDE.md` files, diagrams as needed, the PR description

- [ ] **Step 1: Run every scenario so far.** `pnpm test` and `pnpm e2e`. Expected: scenarios 1 to 8 and 13 to 16 pass in the engine; those tagged `@e2e` pass in the browser.
- [ ] **Step 2: Confirm events with Gemma on her real calendar.** She goes through the list once. About 119 event cells for Years 11 to 13 reduce to far fewer distinct wordings; note the number in the PR. Then she confirms 4 May and 29 June 2027 as staff days.
- [ ] **Step 3: Read the IAL parity screen with her** and check the slack numbers against what she expects for the next assessment.
- [ ] **Step 4: The gate.** Follow "Milestone gate" in the index.
- [ ] **Step 5: Commit and tag.** `docs(planner): M3 gate`, then `git tag planner-m3`.
