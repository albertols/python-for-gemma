# AI Teacher Planner M5: Board Editing, Views and AI Marking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemma moves a lesson to a slot she chooses, by keyboard or by dragging, sees the effect before it is applied, and her choice survives later reflows. She can merge lessons, rename a spare lesson, switch between day, week, fortnight, month and unit views, open any lesson to see why it is where it is, and tell at a glance what AI produced.

**Architecture:** A move is a slot pin, created through the same change preview as every other change. The engine lists legal targets and explains placements; the board only draws them. Pointer drag sits behind one adapter file so the library can be replaced.

**Tech Stack:** As the index. New and not proven by spike: `@dnd-kit/react` (pre-1.0; one adapter file only).

**Spec:** sections 10.5, 10.8, 12 of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md).

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Start with the check described under "Before starting a milestone" in the index.

## Review Focus

1. **The target slot stopped being available between drawing the board and dropping the lesson.** The preview shows the conflict and cannot be applied. Tasks 5.1 and 5.2.
2. **A lesson is moved ahead of the lessons that come before it.** It is allowed, because it is her choice, and the preview says in words which lesson is now taught out of order. Task 5.1.
3. **So many pins that the plan cannot be built.** Every pin that cannot be honoured is listed with a "Remove this pin" action; none is dropped silently. Task 5.4.
4. **Everything by keyboard.** Moving, merging, opening the drawer and switching views work without a pointer, and focus returns to the lesson afterwards. Tasks 5.2 and 5.6.
5. **A lesson in history is dragged.** History cannot be picked up; the card says why. Tasks 5.1 and 5.3.

---

### Task 5.1: Moves as pins

**Files:**
- Create: `packages/domain/src/moves.ts`, `moves.test.ts`, `pins.steps.test.ts`
- Create: `features/09-pins-survive.feature`

**Interfaces:**
- Consumes: `PlanSnapshot`, `Slot`, `Pin`, `PlanChange`, `sequence`, `isHistory`.
- Produces:

```ts
export interface MoveTarget { slotKey: SlotKey; date: IsoDate; period: Period; holds: LessonId | null; allowed: boolean; reason: string | null }
export function canMove(head: PlanSnapshot, groupId: GroupId, lessonId: LessonId): { ok: true } | { ok: false; reason: string };
export function moveTargets(args: { head: PlanSnapshot; slots: readonly Slot[]; groupId: GroupId; lessonId: LessonId; today: IsoDate }): MoveTarget[];
export function moveChange(args: { groupId: GroupId; lessonId: LessonId; toSlotKey: SlotKey; pins: readonly Pin[]; newPinId: string }): PlanChange;
export function outOfOrder(candidate: PlanSnapshot, slots: readonly Slot[], groupId: GroupId, lessonId: LessonId): LessonId[];   // earlier lessons now taught after it
```

Rules:

- A lesson can be moved when its placement is `planned`. History cannot: "This lesson is in the past. Use the check-in to correct what happened."
- Targets are the group's own slots dated today or later. A target is not allowed, with the reason given, when it is cancelled, holds a whole-slot assessment, or holds another pinned lesson. A slot holding an unpinned lesson is allowed: that lesson flows on.
- `moveChange` replaces any existing slot pin for the lesson with one new pin.
- Her own move may put a lesson into or take it out of the freeze horizon.

- [ ] **Step 1: Write the feature file** for scenario 9, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests** on `paceWorld()`

```ts
test("a planned lesson can move; a taught one cannot, and says why", () => {});
test("targets are this group's slots from today on, in date order", () => expect(targets.every(t => t.slotKey.startsWith("13 1|") && t.date >= "2026-11-09")).toBe(true));
test("the slot of a whole-slot assessment is not a target, and says why", () => expect(target("13 1|2026-11-27|6")).toMatchObject({ allowed: false, reason: "An assessment is in this lesson" }));
test("a slot holding another pinned lesson is not a target", () => {});
test("moving a lesson a second time leaves one pin, not two", () => {});
test("moving c3#1 to 11 November is allowed and reported as out of order", () => {
  expect(outOfOrder(candidate, slots, "13 1", "c3#1")).toEqual(["c1#2", "c1#3", "c2#1", "c2#2", "c2#3"]);
});
// pins.steps.test.ts, scenario 9
// Given I moved 13 1's c3#1 to 13 1|2026-11-25|2 and accepted
// When 13 1|2026-11-18|2 is cancelled and I accept the reflow
// Then c3#1 is still on 13 1|2026-11-25|2 and has pinned true
test("a closure on the pinned slot itself is a conflict she sees, not a silent move", () => {
  expect(preview.proposals[0]?.conflicts).toContainEqual(expect.objectContaining({ kind: "pin-slot-unavailable", lessonId: "c3#1" }));
});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** In `apply-change.ts`, refuse to apply a `decisions` change whose own new pin comes back as `pin-slot-unavailable`: answer 409 with the reason.
- [ ] **Step 5: Run again.** Expected: PASS, including scenario 9.
- [ ] **Step 6: Finish line and commit.** `feat(domain): move a lesson by pinning it, with legal targets and an out-of-order note`

---

### Task 5.2: "Move to…" by keyboard

**Files:**
- Create: `apps/web/src/screens/board/MoveDialog.tsx`, `LessonMenu.tsx`
- Create: `e2e/steps/move.steps.ts` (browser steps for `features/09-pins-survive.feature`), `features/m5-move.feature`
- Modify: `LessonCard.tsx`, `SlotCell.tsx`, `apps/api/src/routes/plans.ts` (`GET /api/plans/:courseId/move-targets?groupId=&lessonId=`)

**Interfaces:**
- Consumes: `moveTargets`, `moveChange`, `outOfOrder`, `ChangePreviewPanel`.

What it shows: every planned lesson card has a menu button and responds to the `M` key when focused. "Move to…" opens a dialog listing the targets by week: date, period, and what is there now ("free", a lesson's title, or why it is not allowed). Arrow keys move through the list, Enter chooses. Choosing shows the change preview in the same dialog, with a sentence when lessons end up out of order ("3 Markets, lesson 1 will be taught before 2 Supply, lessons 3 and 4"). After applying, focus returns to the moved lesson in its new place, and the card shows a pin icon with the text "Pinned by you".

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Moving a lesson
  Scenario: Move a lesson with the keyboard only
    When I focus a 13 1 lesson and press M
    And I choose a later lesson slot with the arrow keys and Enter
    Then I see a preview of what else moves
    When I apply it
    Then the lesson is in the slot I chose and shows "Pinned by you"
    And focus is on that lesson
  Scenario: A slot with an assessment cannot be chosen
    When I open "Move to…" for a 13 1 lesson
    Then the assessment's slot is listed as not allowed, with the reason
  Scenario: A past lesson cannot be moved
    When I open the menu of a lesson from last week
    Then "Move to…" is unavailable and says why
```

The steps for scenario 9 move a lesson, record a closure on another day through the lost-lesson dialog, apply it, and check the moved lesson has not moved.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The list is a listbox with a labelled group per week.
- [ ] **Step 4: Run again.** Expected: PASS, with axe clean on the open dialog.
- [ ] **Step 5: Finish line and commit.** `feat(web): move a lesson by keyboard through a preview`

---

### Task 5.3: Dragging, behind one adapter

**Files:**
- Create: `apps/web/src/screens/board/dnd-adapter.tsx`, `dnd-adapter.test.tsx`
- Modify: `LessonCard.tsx`, `SlotCell.tsx`, `BoardScreen.tsx`, `features/m5-move.feature`

**Interfaces:**
- Produces, from the adapter and nothing else in the app importing the drag library:

```ts
export function DragBoard(props: { onDrop: (lesson: { groupId: GroupId; lessonId: LessonId }, toSlotKey: SlotKey) => void; children: ReactNode }): JSX.Element;
export function useDragCard(lesson: { groupId: GroupId; lessonId: LessonId }, enabled: boolean): { ref: Ref<HTMLElement>; dragging: boolean };
export function useDropSlot(slotKey: SlotKey, accepts: (lesson: { groupId: GroupId; lessonId: LessonId }) => boolean): { ref: Ref<HTMLElement>; over: boolean; canDrop: boolean };
```

What it does: a planned lesson can be dragged to one of its allowed targets. While dragging, allowed slots are outlined and others are dimmed. Dropping opens the same change preview as "Move to…"; nothing is applied by the drop itself. History cards and other groups' slots do not react.

- [ ] **Step 1: Write the failing tests.** A unit test asserts that no file under `apps/web/src` except `dnd-adapter.tsx` imports from `@dnd-kit`. Add to `features/m5-move.feature`:

```gherkin
  Scenario: Dragging opens the same preview
    When I drag a 13 1 lesson to a later 13 1 slot
    Then I see the preview and nothing has changed yet
    When I cancel
    Then the lesson is where it was
  Scenario: A lesson cannot be dropped on another group's slot
    When I drag a 13 1 lesson over a 13 3 slot
    Then the slot does not accept it
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with `@dnd-kit/react`, after reading its current documentation. If the library cannot do this cleanly on the table layout, keep the adapter's interface and implement it with native pointer events; the rest of the app does not change.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagram 09** if a library was added.
- [ ] **Step 6: Finish line and commit.** `feat(web): drag a lesson to a slot, through the same preview`

---

### Task 5.4: Merging, pins, spare lessons and homework from the card

**Files:**
- Create: `apps/web/src/screens/board/PinsPanel.tsx`, `SpareLessonEditor.tsx`
- Create: `features/m5-card-actions.feature`, `e2e/steps/card-actions.steps.ts`
- Modify: `LessonMenu.tsx`, `apps/api/src/usecases/apply-change.ts` (flex edits), `apps/api/src/routes/plans.ts` (`GET /api/plans/:courseId/pins`)

**Interfaces:**
- Consumes: `PlanChange` with `decisions`; `FlexEdit`.
- Produces: `PlanChange` `decisions` gains `flexEdits?: FlexEdit[]`.

What it shows: the lesson menu gains "Merge with the next lesson", "Split merged lessons", "Set as homework", "Unpin" and, on a spare lesson, "Rename or set a purpose" (exam practice, support activities, independent study, or her own title). Each goes through the change preview, except renaming a spare lesson, which changes no dates and is saved at once. A "Pinned lessons" panel lists every pin for the course with its lesson, slot and an "Unpin" button, and lists pins that cannot be honoured first, each with "Remove this pin".

- [ ] **Step 1: Write the failing tests**

```ts
test("a flex edit changes the spare lesson's title and purpose and no placement", async () => {});
test("a flex edit for a spare lesson that no longer exists is ignored and reported", async () => {});
```

```gherkin
@e2e
Feature: Card actions
  Scenario: Merge two lessons
    When I merge a 13 3 lesson with the next one and apply the preview
    Then both lessons are shown in one cell and the lessons after them are one slot earlier
  Scenario: Give a spare lesson a purpose
    When I set a spare lesson's purpose to "Support activities"
    Then its card says "Spare lesson: support activities"
  Scenario: Unpin from the panel
    Given a pinned lesson
    When I unpin it from the pinned lessons panel and apply the preview
    Then the lesson is back in scheme order
  Scenario: A pin that cannot be honoured is listed with a way to remove it
    Given a pinned lesson whose slot was then cancelled
    Then the panel lists it first with "Remove this pin"
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS, with axe clean.
- [ ] **Step 5: Finish line and commit.** `feat(web): merge, homework, unpin and spare-lesson purpose from the board`

---

### Task 5.5: Day, week, month and unit views

> **Changed by M1b (24 Nov 2026).** The one-week view and the class filter (`?groups=`, `view=week`) were built read-only in M1b Task 1b.5. Reuse them; this task adds the day, month and unit views, editing in the week view, and keeps the filter in every view.

**Files:**
- Create: `packages/domain/src/views.ts`, `views.test.ts`
- Create: `apps/web/src/screens/board/DayView.tsx`, `WeekView.tsx`, `MonthView.tsx`, `UnitView.tsx`, `ViewSwitch.tsx`
- Create: `features/m5-views.feature`, `e2e/steps/views.steps.ts`
- Modify: `BoardScreen.tsx`, `routes.tsx`

**Interfaces:**
- Produces:

```ts
export interface ItemSpan { itemId: string; groupId: GroupId; from: IsoDate | null; to: IsoDate | null; lessons: number; delivered: number; declared: boolean }
export function itemSpans(snapshot: PlanSnapshot, slots: readonly Slot[], items: readonly SowItem[]): ItemSpan[];
export interface MonthCell { date: IsoDate; dayKind: DayKind; weekLabel: WeekLabel | null; lessons: { groupId: GroupId; count: number }[] }
export function monthCells(month: string /* "YYYY-MM" */, days: readonly CalendarDay[], slots: readonly Slot[]): MonthCell[];
```

The view is in the URL: `/board?view=fortnight|day|week|month|unit&date=YYYY-MM-DD&course=`. The fortnight is the default.

What each shows: **Day**: one day's lessons in period order with time, room, title and state. **Week**: one week's grid with larger cards. **Month**: a calendar month, each day marked with its week label and a count of lessons per group; days off are greyed with their reason. **Unit**: for one course, a table with a row per scheme item and a column per group, each cell showing the dates the item runs from and to, lessons taught of lessons planned, and "declared" for items before go-live.

- [ ] **Step 1: Write the failing tests**

```ts
test("an item's span runs from its first to its last lesson for each group", () =>
  expect(span("c2", "13 3")).toMatchObject({ from: "2026-11-17", to: "2026-11-19", lessons: 3, delivered: 0, declared: false }));
test("a declared item has no dates and is marked declared", () => {});
test("an item split across a break still has one span", () => {});
test("a month holds every day of the month, with the label and lesson counts", () => {
  const dec = monthCells("2026-12", days, slots);
  expect(dec).toHaveLength(31);
  expect(dec.find(c => c.date === "2026-12-22")).toMatchObject({ weekLabel: "W2", dayKind: "pupil" });
  expect(dec.find(c => c.date === "2026-12-23")).toMatchObject({ weekLabel: null, lessons: [] });
});
```

```gherkin
@e2e
Feature: Board views
  Scenario Outline: Each view opens and is accessible
    When I switch the board to the <view> view
    Then the address shows view <view>
    And the page has no serious accessibility violations
    Examples:
      | view  |
      | day   |
      | week  |
      | month |
      | unit  |
  Scenario: The unit view shows when each group covers a chapter
    When I open the unit view for the Year 13 course
    Then each chapter shows a date range for 13 1, 13 3 and 13 5
  Scenario: The view switch works by keyboard
    Then I can change view with the arrow keys
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The lesson menu and drawer work in every view.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagram 04.**
- [ ] **Step 6: Finish line and commit.** `feat(web): day, week, month and unit views of the plan`

---

### Task 5.6: The lesson drawer and "Why is this here?"

**Files:**
- Create: `packages/domain/src/explain.ts`, `explain.test.ts`
- Create: `apps/web/src/screens/board/LessonDrawer.tsx`, `apps/web/src/components/WhyPopover.tsx`
- Create: `features/m5-drawer.feature`, `e2e/steps/drawer.steps.ts`
- Modify: `apps/api/src/routes/plans.ts` (`GET /api/plans/:courseId/explain?groupId=&lessonId=`)

**Interfaces:**
- Consumes: `PlanSnapshot`, `PlanInputs`, `planWindows`, `eligibleAt`, `specPointsFor`.
- Produces:

```ts
export type PlacementRule = "pinned" | "frozen" | "scheme-order" | "brought-forward" | "spare" | "assessment-anchor" | "merged" | "cover" | "swapped-in" | "hl-eligible" | "history";
export interface Explanation { rule: PlacementRule; sentence: string; inputs: { label: string; value: string }[] }
export function explainPlacement(args: { snapshot: PlanSnapshot; inputs: PlanInputs; groupId: GroupId; lessonId: LessonId }): Explanation;
```

Sentences, one per rule:

| Rule | Sentence |
|---|---|
| `pinned` | "You put this lesson here." |
| `frozen` | "This is today or the next teaching day, so it does not move when other things change." |
| `scheme-order` | "This is the next lesson in your scheme of work, in this group's next free lesson." |
| `brought-forward` | "Everything due before the next assessment fits for every group, so the next lesson was brought forward." |
| `spare` | The explanation fixed in the index, followed by the count: "13 3 has 9 lessons before the assessment on 27 November; the group with the fewest has 8." |
| `assessment-anchor` | "The assessment is dated 27 November. This is this group's first lesson on or after that date." |
| `merged` | "You merged this lesson with the one before it." |
| `cover` | "You were absent. The class did this lesson as cover work." |
| `swapped-in` | "You chose this lesson for the cover slot." |
| `hl-eligible` | "This is the first HL topic in your order whose prerequisites IB S has finished." |
| `history` | "This is in the past." |

`inputs` always include the date with its week label "from the school calendar", the timetable cell, and the lesson's place in the scheme.

What the drawer shows: opened with Enter on a card or from its menu. Title, group, date, period, room, state; the specification points it covers, with their codes; the explanation; any assessment in the slot; the lesson's history from the log; the provenance of anything AI touched, in the provenance popover; and the menu's actions as buttons. Escape closes it and returns focus to the card.

- [ ] **Step 1: Write the failing tests** on `paceWorld()`

```ts
test("a lesson in scheme order", () => expect(explain("13 1", "c1#2").rule).toBe("scheme-order"));
test("a brought-forward lesson", () => expect(explain("13 1", "c3#1").rule).toBe("brought-forward"));
test("13 3's spare lesson gives both counts", () =>
  expect(explain("13 3", "flex:13 3:cp:a1#1").sentence).toContain("13 3 has 9 lessons before the assessment on 27 November; the group with the fewest has 8."));
test("a pinned lesson", () => {});
test("a frozen lesson", () => {});
test("an HL lesson", () => { /* ibWorld: h1#1 */ });
test("the inputs name the week label and say it comes from the calendar", () =>
  expect(explain("13 1", "c1#2").inputs).toContainEqual({ label: "Date", value: "Wednesday 11 November 2026, Week 2 (from the school calendar)" }));
test("every placement in the snapshot has an explanation", () => { /* loop over all placements: no throw, sentence not empty */ });
```

```gherkin
@e2e
Feature: Lesson drawer
  Scenario: Why is this here
    When I open a spare lesson and choose "Why is this here?"
    Then I see how many lessons this group has before the assessment and how many the tightest group has
  Scenario: The drawer shows the specification points
    When I open a teaching lesson
    Then I see its specification points with their codes
  Scenario: The drawer is usable by keyboard and accessible
    When I open a lesson with Enter and close it with Escape
    Then focus is back on the lesson
    And the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): lesson drawer with a traceable reason for every placement`

---

### Task 5.7: AI marking across the app

**Files:**
- Create: `e2e/steps/ai-marked.steps.ts` (browser steps for `features/13-ai-marked-reviewed.feature`)
- Modify: `apps/web/src/components/Legend.tsx`, `ActivityDrawer.tsx`, `LessonCard.tsx`, `SchemeTable.tsx`, `apps/web/src/screens/board/BoardScreen.tsx`
- Create: `apps/web/src/components/ai-marking.test.tsx`

**Interfaces:**
- Consumes: `AiBadge`, `ProvenancePopover`, `ReviewBar`, the export routes.

What changes: every place that shows something with AI origin uses the same badge and popover: scheme counts, the pack draft, event suggestions, the prerequisite map, the timetable suggestion. On the board, a lesson whose count came from an accepted AI suggestion shows the small sparkle in its drawer, not on the card, so the board stays calm. The legend is reachable from every screen's header. The activity drawer filters by "awaiting review" and links each run to where its items are reviewed. The export menu shows the warning before downloading when anything was left out.

- [ ] **Step 1: Write the failing tests**

```ts
// ai-marking.test.tsx
test.each(["suggested", "accepted", "edited"] as const)("the %s badge has an icon and a text alternative", (state) => {});
test("a rejected item shows no badge and is not rendered as content", () => {});
test("the three states differ by icon, not only by colour", () => { /* the rendered icons' names differ */ });
```

The browser steps for scenario 13: open the scheme with one unreviewed suggestion; check the sparkle icon, the text "AI suggestion, not reviewed" and the dashed outline (the element's computed `border-style` or `outline-style` is `dashed`); export the fortnight; check the warning "1 AI suggestion was left out because you have not reviewed it." is shown before the download. Then accept the suggestion, export again, and check there is no warning and the file's last row names one AI item and its review date.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS, including scenario 13 in the browser.
- [ ] **Step 5: Finish line and commit.** `feat(web): one way of marking AI everywhere, and export warnings`

---

### Task 5.8: M5 gate

**Files:**
- Create: `docs/design/ai-teacher-planner/screens/m5-move.png`, `m5-drawer.png`, `m5-month.png`, `m5-unit.png`
- Modify: both `CLAUDE.md` files, diagrams as needed, the PR description

- [ ] **Step 1: Run every scenario so far.** `pnpm test` and `pnpm e2e`. Expected: PASS.
- [ ] **Step 2: A keyboard-only pass.** With the `claude-in-chrome` skill, plan a fortnight on the synthetic data without using the pointer: move a lesson, merge two, rename a spare lesson, open a drawer, switch every view. Note anything that needed the pointer and fix it before the gate.
- [ ] **Step 3: Time it with Gemma on her real data.** Planning the next fortnight for all six groups should take under 15 minutes (spec section 2). Note the time and what slowed her in the PR.
- [ ] **Step 4: The gate.** Follow "Milestone gate" in the index.
- [ ] **Step 5: Commit and tag.** `docs(planner): M5 gate`, then `git tag planner-m5`.
