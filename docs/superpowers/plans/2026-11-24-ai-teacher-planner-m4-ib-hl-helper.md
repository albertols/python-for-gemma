# AI Teacher Planner M4: IB Tracks and the HL Helper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemma opens one screen and sees, for IB H, what is teachable now and why, when each blocked topic unlocks, whether the next fortnight's four lessons are covered, and how many lessons remain before the Paper 3 mock. HL lessons placed before their prerequisites are flagged.

**Architecture:** One IB course with two tracks. IB S carries the core stream as any group does. IB H carries the HL stream, which the sequencer fills slot by slot with the first topic that is eligible on that date. Eligibility is a pure function of the core group's plan. The prerequisite map is content: a skill proposes it, she reviews it once, and it is locked.

**Tech Stack:** As the index. Nothing new.

**Spec:** section 10.10 and appendix D of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md).

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Start with the check described under "Before starting a milestone" in the index.

## Review Focus

1. **An HL topic whose prerequisite is not in the plan at all** (it overflowed, or she removed it). It is `blocked` with the reason, not an error and not "teachable". Task 4.1.
2. **Prerequisites that form a loop, or point at an HL topic.** Refused when the map is saved, with the loop named. Task 4.1.
3. **Nothing is eligible and the fallback pool is empty.** The slot becomes a spare lesson and the helper says the runway is short. Tasks 4.2 and 4.3.
4. **IB S slips after the IB H plan was accepted.** The preview shows the HL lessons that are no longer allowed where they are, with what could go there instead. Task 4.2.
5. **The unit totals do not match the split.** A split that does not add up to its unit's total is refused and nothing is stored. Task 4.4.

## The test world

`ibWorld()`, added to `@planner/fixtures`: groups IB S (core) and IB H (hl), the synthetic calendar, the seed timetable, `today` 2026-11-23.

Core items, in order: `k1` 3 lessons, `k2` 4 lessons, `k3` 3 lessons. HL items, in order: `h1` 2 lessons, needs `k2`; `h2` 2 lessons, no prerequisites; `p3` revision "Paper 3 preparation", 4 lessons, no prerequisites.

IB S teaches on Wednesday P5 and Thursday P1 and P2; IB H on Monday P1 and P2. From 23 November the core plan is: `k1` on 25 and 26 Nov; `k2` on 2, 3, 3 and **9 Dec**; `k3` on 10, 10 and 16 Dec. So `h1` unlocks at the first IB H slot after 9 December: **Monday 14 December**. The HL plan is: `h2` on 23 Nov; `p3` on 30 Nov and 7 Dec; `h1` on 14 Dec; two spare lessons on 21 Dec.

---

### Task 4.1: HL eligibility

**Files:**
- Create: `packages/domain/src/hl.ts`, `hl.test.ts`, `hl.prop.test.ts`
- Create: `fixtures/src/ib-world.ts`
- Modify: `packages/domain/src/scheme.ts` (`validateScheme`)

**Interfaces:**
- Consumes: `PlanSnapshot`, `Slot`, `SowItem.prerequisites`, `SowItem.availableFrom` (in the contract since M2, null until now), `delivered`.
- Produces:

```ts
export interface HlStatus { itemId: string; status: "done" | "teachable" | "unlocks" | "blocked"; unlocksOn: IsoDate | null; waitingFor: { itemId: string; finishesOn: IsoDate | null }[]; why: string[] }
export function coreFinish(snapshot: PlanSnapshot, slots: readonly Slot[], coreGroupId: GroupId, items: readonly SowItem[]): Record<string, { done: boolean; slotKey: SlotKey | null; date: IsoDate | null }>;
export function eligibleAt(item: SowItem, slot: Slot, finish: ReturnType<typeof coreFinish>): boolean;
export function hlStatus(args: { on: IsoDate; items: readonly SowItem[]; snapshot: PlanSnapshot; slots: readonly Slot[]; coreGroupId: GroupId; hlGroupId: GroupId }): HlStatus[];
```

Rules:

- A core item is finished at the slot of its last lesson in the core group's plan. A core item whose lessons are all history is finished already.
- An HL item is eligible at an IB H slot when every prerequisite is finished in a slot that comes before it (earlier date, or the same date and an earlier period), and the slot's date is on or after `availableFrom`.
- `hlStatus` on a date: `done` when the HL group has delivered all its lessons; `teachable` when eligible at the HL group's first slot on or after that date; `unlocks` when it becomes eligible at a later HL slot, with that slot's date; `blocked` when a prerequisite has no finishing slot in the plan.
- `validateScheme` now refuses a prerequisite that is not a core item, and any loop.

- [ ] **Step 1: Write the failing tests** on `ibWorld()`

```ts
test("k2 finishes on 9 December in the core plan", () => expect(finish.k2).toMatchObject({ done: false, date: "2026-12-09" }));
test("on 23 November h2 is teachable, h1 unlocks on 14 December", () => {
  expect(status("h2")).toMatchObject({ status: "teachable", why: ["No prerequisites"] });
  expect(status("h1")).toMatchObject({ status: "unlocks", unlocksOn: "2026-12-14", waitingFor: [{ itemId: "k2", finishesOn: "2026-12-09" }] });
});
test("a prerequisite that finishes on the same day in an earlier period counts", () => { /* an HL slot at P5 on the day the core item ends at P2 */ });
test("a prerequisite already taught counts as finished", () => { /* IB S positioned past k2: h1 is teachable on 23 Nov */ });
test("a prerequisite that is not in the plan blocks the topic and says why", () => {
  // k2 given 400 lessons so it overflows
  expect(status("h1")).toMatchObject({ status: "blocked", unlocksOn: null });
  expect(status("h1").why[0]).toContain("is not in the plan");
});
test("availableFrom holds a topic back until its date", () => { /* p3 available from 2026-12-07: not eligible on 30 Nov */ });
test("a finished HL topic is done", () => {});
test("a loop in the map is refused and named", () => expect(validateScheme(withLoop)[0]).toMatch(/h1.*h1|loop/));
test("a prerequisite on an HL topic is refused", () => {});

// hl.prop.test.ts (spec section 10.14)
// - cancelling any core-group slot never makes any HL item's unlocksOn earlier, and never turns "unlocks" or "blocked" into "teachable"
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The scheme editor gains an "Available from" date on HL items.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(domain): HL eligibility from the core group's plan`

---

### Task 4.2: Sequencing the HL track

**Files:**
- Create: `packages/domain/src/hl-sequence.ts`, `hl-sequence.test.ts`, `hl.steps.test.ts`
- Create: `features/10-hl-prerequisites.feature`
- Modify: `packages/domain/src/sequence.ts`

**Interfaces:**
- Consumes: `eligibleAt`, `coreFinish`, the M2 and M3 sequencer.
- Produces: `sequence` plans an `hl` group after the `core` group of the same plan, using the core result. No signature changes. The `hl-prerequisite` conflict in the index contract is now produced.

Rules:

- The core track is sequenced first, exactly as before.
- For the HL group, go through its usable slots in order. At each slot: if a pinned lesson is there, keep it, and record an `hl-prerequisite` conflict when its item is not eligible at that slot. Otherwise continue the item in progress if it is still eligible; otherwise take the first item in her HL order that is eligible and has lessons left; otherwise the slot is a spare lesson.
- Merges, homework, cover choices, history and the freeze horizon apply to the HL group as to any group.
- The fallback pool is nothing special in the engine: it is the prerequisite-free items she puts at the end of her HL order, so they are chosen when nothing earlier is eligible.
- Dated HL assessments (the Paper 3 mock) anchor as any assessment does.

- [ ] **Step 1: Write the feature file** for scenario 10, tagged `@engine @e2e`. IB H has lessons on Mondays only, so the feature places the topic on Monday 30 November, not 2 December; say so in a comment in the file.

- [ ] **Step 2: Write the failing tests**

```ts
test("the HL plan takes what is eligible, in her order", () =>
  expect(hlPlan()).toEqual([
    ["h2#1", "IB H|2026-11-23|1"], ["h2#2", "IB H|2026-11-23|2"],
    ["p3#1", "IB H|2026-11-30|1"], ["p3#2", "IB H|2026-11-30|2"],
    ["p3#3", "IB H|2026-12-07|1"], ["p3#4", "IB H|2026-12-07|2"],
    ["h1#1", "IB H|2026-12-14|1"], ["h1#2", "IB H|2026-12-14|2"] ]));
test("slots with nothing eligible and nothing left are spare lessons", () => expect(lessonAt("IB H|2026-12-21|1")).toMatch(/^flex:IB H:/));
test("an item in progress is finished before a newly eligible one starts", () => { /* p3 is not interrupted on 7 Dec even if h1 were eligible */ });
test("scenario 10: an HL topic pinned before its prerequisite finishes is flagged", () => {
  const s = sequence(withPin(ibWorld(), { lessonId: "h1#1", slotKey: "IB H|2026-11-30|1" }));
  expect(s.conflicts).toContainEqual({ kind: "hl-prerequisite", groupId: "IB H", lessonId: "h1#1", prerequisiteItemId: "k2", finishesOn: "2026-12-09" });
  expect(lessonAt(s, "IB H|2026-11-30|1")).toBe("h1#1");          // her pin is kept, and flagged
});
test("when IB S loses a lesson, the HL topic that depended on it moves later and the preview shows it", () => {
  // cancel IB S|2026-12-03|1: k2 now finishes on 10 Dec; h1 is still on 14 Dec.
  // cancel IB S on 2, 3 and 9 Dec: k2 finishes on 17 Dec; h1 moves to 21 Dec and the diff lists it
});
test("the core plan is the same with or without an HL group", () => {});
test("an IAL plan, with no HL group, is unchanged by this task", () => expect(sequence(paceWorld())).toEqual(before));
```

Scenario 10's steps assert the flag and, using `teachableAt` from Task 4.3, that `p3` is offered instead; that last step is pending until Task 4.3.

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run again.** Expected: PASS except the pending step. Every property test of M2 and M3 still passes, now also generating HL items.
- [ ] **Step 6: Finish line and commit.** `feat(domain): sequence the HL track by eligibility`

---

### Task 4.3: Teachable now, runway and alternatives

**Files:**
- Create: `packages/domain/src/hl-helper.ts`, `hl-helper.test.ts`
- Modify: `packages/domain/src/hl.steps.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Teachable { itemId: string; title: string; lessonsLeft: number; rank: number; why: string[] }
export function teachableAt(args: { slotKey: SlotKey; items: readonly SowItem[]; snapshot: PlanSnapshot; slots: readonly Slot[]; coreGroupId: GroupId; hlGroupId: GroupId }): Teachable[];
export interface Runway { fortnight: Fortnight; hlSlots: number; eligibleLessons: number; enough: boolean }
export function runway(args: { fortnight: Fortnight; items: readonly SowItem[]; snapshot: PlanSnapshot; slots: readonly Slot[]; coreGroupId: GroupId; hlGroupId: GroupId }): Runway;
export function slotsBeforeAssessment(snapshot: PlanSnapshot, slots: readonly Slot[], hlGroupId: GroupId, itemId: string, from: IsoDate): number | null;
```

Ranking in `teachableAt`, best first: the item in progress; then items with a prerequisite that the core group finished within the previous 14 days (they follow on from what was just taught); then her HL order. `why` holds one sentence per fact, such as "No prerequisites", "Needs k2, which IB S finished on 9 December", "Follows on from k2, taught last week", "In progress: 1 of 2 taught".

`runway` counts the HL group's usable slots in the fortnight and the lessons left in items eligible at its first slot.

- [ ] **Step 1: Write the failing tests**

```ts
test("on 30 November the pool is what is teachable, and the reason is given", () =>
  expect(teachableAt({ ...args, slotKey: "IB H|2026-11-30|1" }).map(t => [t.itemId, t.why[0]])).toEqual([["p3", "No prerequisites"]]));
test("on 14 December h1 ranks first because it follows on from k2", () => {
  expect(teachableAt({ ...args, slotKey: "IB H|2026-12-14|1" })[0]).toMatchObject({ itemId: "h1", why: expect.arrayContaining(["Follows on from k2, taught last week"]) });
});
test("an item in progress ranks first", () => {});
test("the runway for the fortnight of 30 November: four slots, four eligible lessons, enough", () =>
  expect(runway({ ...args, fortnight: { w1: "2026-11-30", w2: "2026-12-07", breakBefore: false } })).toMatchObject({ hlSlots: 4, eligibleLessons: 4, enough: true }));
test("with the pool removed the runway is short", () => expect(runwayWithoutPool).toMatchObject({ hlSlots: 4, eligibleLessons: 0, enough: false }));
test("slots before a dated Paper 3 mock are counted from today", () => { /* mock dated 2026-12-21: 8 slots from 23 Nov */ });
test("an undated mock gives null", () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement,** and complete the pending step of scenario 10.
- [ ] **Step 4: Run again.** Expected: PASS, including scenario 10.
- [ ] **Step 5: Finish line and commit.** `feat(domain): teachable-now list, runway and slots before the Paper 3 mock`

---

### Task 4.4: The IB scheme: from the pack, with unit totals

> **Added after M1 (spec appendix E).** The IB groups spend lesson time on their Internal Assessment in Terms 2 and 3. Add IA project items to the IB scheme, sized from the hours in the reviewed IB pack (the Business Management guide), with the milestones from her IA task schedule. The planner never opens `ibdp/IA/IAs 2025` or `ibdp/IA/IA 2026` (denied, student work). She named it on 25 Nov 2026: `ibdp/IA/IA Intro & Tasks` (a file or folder directly under `ibdp/IA/`, outside the denied subfolders). First check, by listing only that path, that it is not under a denied folder and that its names hold no student names; then add exactly that path to the gateway allowlist, with a test that the denied IA subfolders stay refused. If it holds student work or names, she enters the milestones by hand in the scheme screen instead. Year 12 IB mocks and Extended Essay days are already cancelled by M1b's confirmed events.

**Files:**
- Create: `packages/domain/src/pack-to-items.ts`, `pack-to-items.test.ts`
- Create: `apps/api/src/usecases/split-unit-totals.ts`, and its test
- Modify: `.claude/skills/planner-suggest-lesson-counts/SKILL.md`, `apps/api/src/usecases/suggest-counts.ts`, `apps/web/src/screens/scheme/SchemeScreen.tsx`, `routes/scheme.ts`

**Interfaces:**
- Consumes: `CurriculumPack`, the lesson-count skill in `split` mode, `startJob`.
- Produces:

```ts
export function packToItems(pack: CurriculumPack, courseId: CourseId, unitOrder: readonly string[]): SowItem[];
export function splitIsValid(suggestions: { itemId: string; lessons: number }[], items: readonly SowItem[], unitTotals: Record<string, number>, unitOf: (itemId: string) => string): string[];
```

`POST /api/scheme/:courseId/from-pack` with `{ unitOrder }` returns a preview of items built from the locked pack; she accepts it like an import. Scheme responses gain `unitTotals`.

Rules:

- `packToItems` makes one teaching item per chapter of an in-scope unit, in `unitOrder` and then pack order. Its id is `t-<chapter number>`, its track is `hl` when the chapter is HL-only, its count is 0, its origin is `import`.
- A teaching item with a count of 0 is shown as "not set", and a course with any such item cannot be planned: the proposal route answers 422 naming them.
- In `split` mode the skill receives the unit totals she typed and proposes a count for each item. `splitIsValid` checks that each unit's suggestions add up to its total and that none is 0. A run that fails the check is stored as failed with the reason, and creates no items.

- [ ] **Step 1: Write the failing tests**

```ts
test("items follow her unit order, then the pack's order", () => { /* unitOrder ["u2", "u1"] */ });
test("an HL-only chapter becomes an hl item", () => {});
test("out-of-scope units give no items", () => {});
test("a split that adds up is valid", () => expect(splitIsValid(good, items, { u1: 10 }, unitOf)).toEqual([]));
test("a split that is one lesson over its unit total is refused, naming the unit and both numbers", () =>
  expect(splitIsValid(over, items, { u1: 10 }, unitOf)[0]).toMatch(/u1.*11.*10/));
test("a failed split stores no suggestions", async () => {});
test("a course with a topic at 0 lessons cannot be planned, and the answer names the topics", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The scheme screen gains a "Lessons per unit" panel for courses with unit totals, a "Build from the pack" action, and "Split the unit totals" beside "Suggest lesson counts". Suggestions are reviewed one by one, or all at once with "Accept all for this unit".
- [ ] **Step 4: Extend the skill** for `split` mode by the writing-skills loop: a baseline run on the synthetic pack, then the added guidance: every item gets at least one lesson; a unit's counts add up exactly to its total; more lessons go to content the specification gives more weight or that is flagged as demanding, with the reason stated.
- [ ] **Step 5: Run again.** Expected: PASS. Add a browser scenario to `features/m2-scheme.feature`: with unit totals of 10 and a fake split, accepting all sets every count and the unit shows 10 of 10.
- [ ] **Step 6: Finish line and commit.** `feat(planner): build the IB scheme from the pack and split unit totals`

---

### Task 4.5: The prerequisite map: skill, review and lock

**Files:**
- Create: `packages/ai/src/skills/planner-hl-prerequisites.ts`, `.claude/skills/planner-hl-prerequisites/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/hl-map.ts`, `routes/hl-map.ts`, and tests
- Create: `apps/web/src/screens/setup/HlMapReview.tsx`, `features/m4-hl-map.feature`, `e2e/steps/hl-map.steps.ts`

**Interfaces:**
- Consumes: `startJob`, `registerItemHandler`, `validateScheme`, `ReviewBar`.
- Produces: skill input `{ hlItems: { id, code, title }[]; coreItems: { id, code, title }[] }`, output `{ links: { hlItemId: string; prerequisiteItemIds: string[]; reason: string }[] }`. Items have kind `hl-prerequisites`, one per HL item. Routes: `GET /api/hl-map/:courseId` (each HL item with its prerequisites, provenance and any suggestion), `PUT /api/hl-map/:courseId/:itemId` (her own edit), `POST /api/hl-map/:courseId/lock` and `/unlock`.

Rules: accepting a suggestion sets that item's `prerequisites` with AI provenance. A suggestion naming an item that is not a core item is dropped and reported. The map can be locked when no suggestion is awaiting review; while locked it is read-only, and unlocking asks her to confirm.

- [ ] **Step 1: Write the failing tests**

```ts
test("one reviewable item per HL topic, with its reason", async () => {});
test("accepting sets the prerequisites and records AI provenance; editing records her version", async () => {});
test("a suggestion that would make a loop is refused at review with the loop named", async () => {});
test("the map cannot be locked while a suggestion is unreviewed", async () => {});
test("a locked map refuses edits until unlocked", async () => {});
test("the model is sent codes and titles only", async () => {});
```

```gherkin
@e2e
Feature: HL prerequisite map
  Scenario: Reviewing the proposed map
    When I ask for a prerequisite map
    Then each HL topic shows what it needs, a reason, and the AI badge
    When I accept one, edit one and reject one
    Then each shows its own mark, and the rejected topic has no prerequisites
  Scenario: Locking
    Given every suggestion is reviewed
    When I lock the map
    Then the map is read-only and says when it was locked
  Scenario: The screen is accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the use case, routes and screen (in Setup, under the course).
- [ ] **Step 4: Write the skill** by the writing-skills loop on the synthetic pack. It must say: name a prerequisite only when the HL topic cannot be taught without it; prefer none to a weak link; give the reason in one sentence using the syllabus's own terms; core topics only.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Finish line and commit.** `feat(planner): HL prerequisite map proposed by a skill, reviewed and locked`

---

### Task 4.6: The HL helper screen

**Files:**
- Create: `apps/api/src/usecases/hl-helper.ts`, `routes/hl.ts`, and tests
- Create: `apps/web/src/screens/hl/HlHelperScreen.tsx`, `TeachableList.tsx`, `RunwayCard.tsx`, `FortnightFill.tsx`
- Create: `e2e/steps/hl.steps.ts` (browser steps for `features/10-hl-prerequisites.feature`), `features/m4-hl-helper.feature`
- Modify: `apps/web/src/routes.tsx`, `AppShell.tsx`, `scripts/seed-synthetic.ts` (seed `ibWorld()` as the IB course)

**Interfaces:**
- Consumes: `hlStatus`, `teachableAt`, `runway`, `slotsBeforeAssessment`, the changes routes of M3.
- Produces: `GET /api/hl/:courseId` returning `{ statuses: HlStatus[]; runway: Runway; nextFortnight: { slot: Slot; lessonId: LessonId | null; title: string; alternatives: Teachable[] }[]; paper3: { itemId: string; date: IsoDate | null; slotsBefore: number | null } | null; conflicts: Conflict[] }`, and the screen `/hl/:courseId`.

What it shows, top to bottom:

- **Runway:** "Next fortnight: 4 IB H lessons, 4 lessons ready." When short: "Only 2 lessons are ready for 4 slots", in words and with an icon.
- **Teachable now:** ranked, each with lessons left and its reasons.
- **Unlocks later:** each topic with the date and what it is waiting for ("Unlocks Monday 14 December, after IB S finishes k2 on 9 December").
- **Blocked:** each with the reason.
- **Next fortnight:** the planned lesson in each IB H slot, with a menu of alternatives from `teachableAt`. Choosing one creates a slot pin through the change preview, so she sees the effect before it is applied.
- **Paper 3 mock:** its date, or "no date yet", and the IB H lessons left before it.
- **Flags:** any `hl-prerequisite` conflict, with the lesson, the prerequisite, when it finishes, and what is teachable in that slot instead.

- [ ] **Step 1: Write the failing tests**

```ts
test("the helper route returns statuses, the runway and four slots for the next fortnight", async () => {});
test("with no HL group the route answers 404 with a sentence", async () => {});
```

```gherkin
@e2e
Feature: HL helper
  Scenario: What can I teach IB H next
    When I open the HL helper
    Then I see what is teachable now with a reason for each
    And I see that h1 unlocks on Monday 14 December 2026 after k2 finishes
  Scenario: Swapping a lesson in the next fortnight is a preview
    When I choose another teachable topic for an IB H lesson
    Then I see a preview of the change before it is applied
  Scenario: The screen is accessible
    Then the page has no serious accessibility violations
```

The browser steps for scenario 10 pin the dependent topic to the IB H lesson on 30 November through the menu, apply it, and check the flag and the alternative.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagrams 04 and 06** with the `architecture-visual-docs` skill.
- [ ] **Step 6: Finish line and commit.** `feat(web): HL helper with teachable-now, unlock dates, runway and fortnight fill`

---

### Task 4.7: M4 gate

**Files:**
- Create: `docs/design/ai-teacher-planner/screens/m4-hl-helper.png`, `m4-hl-map.png`
- Modify: both `CLAUDE.md` files, diagrams as needed, the PR description

- [ ] **Step 1: Run every scenario so far.** `pnpm test` and `pnpm e2e`. Expected: PASS.
- [ ] **Step 2: Build the real IB pack with Gemma.** `pnpm pack:draft --course ib-business --spec "ibdp/ibdp Textbook & Guide/Business Management Guide.pdf"`, with Units 1, 4 and 3 in scope in that order. She reviews and locks it. Check `git status` shows nothing new.
- [ ] **Step 3: Build the IB scheme with her.** Build from the pack; she types the unit totals from her course outline; split them and review. She adds by hand the Unit 1 podcast project (kind project), the Unit 1 exam, the Paper 3 mock, and at the end of her HL order the fallback items: Paper 3 preparation, exam skills, and IA preparation with `availableFrom` 1 February 2027.
- [ ] **Step 4: Propose, review and lock the prerequisite map with her.**
- [ ] **Step 5: Go live for IB with the positions in spec appendix D.** IB S: next is the podcast project, then 1.6. IB H: 5.6, 5.7 and 5.8 on the done-list; next lesson in 2.5; a not-after deadline of 22 December 2026 on the last lesson of 2.7. Read the proposal with her before she accepts, then open the HL helper together: the success measure is that "What can I teach IB H next?" is answered in under a minute.
- [ ] **Step 6: The gate.** Follow "Milestone gate" in the index.
- [ ] **Step 7: Commit and tag.** `docs(planner): M4 gate`, then `git tag planner-m4`.
