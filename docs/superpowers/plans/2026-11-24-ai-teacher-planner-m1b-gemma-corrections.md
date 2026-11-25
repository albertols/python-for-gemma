# AI Teacher Planner M1b: Gemma's Corrections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After clicking through M1, Gemma asked for these. Before any lesson is planned, the slots must be right:
- She can correct a day's week label.
- She can settle the import report's uncertain days and confirm which calendar events cancel lessons (study leave, mocks, Extended Essay days).
- She can record lessons cancelled for reasons the calendar does not give.
- The slot audit, board and Today show all of this, with the official exam dates.
- She gets a class filter and a one-week view on the board, and a to-do list on Today.

**Architecture:** Corrections, resolutions, event confirmations and disruptions she enters are stored as her decisions, in their own tables, apart from the imported calendar rows, so re-importing the calendar keeps them. The engine's existing `buildSlots(… disruptions)` does the cancelling. Nothing cancels a lesson until she confirms it.

**Tech Stack:** As the index. Nothing new.

**Spec:** [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md) appendix E (her answers and the calls made from them), sections 10.1, 10.5, 12. Her words: `prototypes/ai_teacher_planner/answers_after_M1.md`.

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Paths are relative to `prototypes/ai_teacher_planner/` unless they start with `.github/`, `.claude/` or `docs/`. Also:

- Every new write route is guarded with `guard(<resource>, "edit")` and needs `x-access`. Calendar corrections, resolutions, event confirmations, disruptions and exams use `report-calendar`; to-do notes use `lesson-plans`.
- Free text she types (reasons, notes) is at most 200 characters, stored as given, always rendered as text (never as HTML), and its input shows the hint "No student names". It never reaches a model.
- Every UI task is clicked through in Chrome with Claude in Chrome (see `planner-run-and-verify`), as well as by Playwright with axe.
- Golden tests on the real calendar print dates and counts only.

## Review Focus

1. **Re-import.** Importing the calendar again keeps her label corrections, resolutions, event confirmations and disruptions. A correction for a date the new calendar no longer has is reported in the import report, never dropped silently. Tasks 1b.1, 1b.2, 1b.3.
2. **A disruption over a weekend, a holiday or outside term.** Only real slots are cancelled and counted; a range with no slots in it says "No lessons fall in these dates" and is not stored. Task 1b.1.
3. **Undoing a decision.** Removing a correction, resolution, confirmation or disruption puts the slots back exactly as before. Each repository test checks this round trip.
4. **Overlapping decisions.** Two confirmations of one wording that cover the same date are refused with the reason. A slot cancelled by two disruptions shows both reasons and counts once. Tasks 1b.1, 1b.3.
5. **Hostile or odd text.** `<script>`, 500 characters, or an empty reason: refused or shown as text, never run. Tasks 1b.1, 1b.6.

---

### Task 1b.1: Stored disruptions and "Lessons were cancelled"

**Files:**
- Create: `apps/api/src/db/migrations/0003_disruptions.sql`, `apps/api/src/repos/sqlite/disruption-repo.ts`, `apps/api/src/routes/disruptions.ts`, and their tests
- Create: `apps/web/src/screens/today/CancelLessonsDialog.tsx`, `apps/web/src/screens/setup/DisruptionsCard.tsx`, `features/m1b-cancelled.feature`, `e2e/steps/cancelled.steps.ts`
- Modify: `apps/api/src/repos/ports.ts`, `apps/api/src/usecases/planning.ts` (pass stored disruptions to `buildSlots`; the "No disruptions exist before M3" comment goes), `apps/api/src/routes/router.ts`, `TodayScreen.tsx`, `SetupScreen.tsx`, `apps/web/src/api/queries.ts`

**Interfaces:**
- Consumes: `Disruption`, `DisruptionScope`, `buildSlots`, `slotKey`, `guard`.
- Produces (API, all under `/api`):

| Route | Does |
|---|---|
| `GET /disruptions` | Every stored disruption, sorted by `from`, then `id` |
| `POST /disruptions/preview` | Body `{ scope: "school" \| "year" \| "groups", yearGroup?, groupIds?, from, to, periods: Period[] \| null, reason }`. Stores nothing. Returns `{ hits: { groupId, date, period }[] }` in slot order |
| `POST /disruptions` | Same body. Stores one disruption per group for `groups`, or one for school or year, with `effect: "cancelled"`, `source: "teacher"`, ids `t:<uuid>` sharing one `batchId`. Returns the stored rows. 422 when `to < from`, the reason is empty or over 200 characters, or no slot falls in the range |
| `DELETE /disruptions/batch/{batchId}` | Removes the batch |

The repository's port: `list(): StoredDisruption[]`, `add(rows: StoredDisruption[]): void`, `removeBatch(batchId: string): number`, where `StoredDisruption = Disruption & { batchId: string; createdAt: string }`.

What it shows. Today has a "Lessons were cancelled" button that opens a dialog:
- **Who:** the whole school, a year, or chosen groups (checkboxes with group colours).
- **When:** from and to dates (default today), and the periods ("All day" or chosen periods).
- **Reason:** for example "School photos".

The dialog lists the lessons hit, live from the preview, then "Cancel these lessons" or "Close". Setup gets "Lessons you cancelled", listing each batch with its reason, dates and lesson count, and a "Remove" button. The slot audit and the board show the lessons as cancelled with her reason, through the existing code.

- [ ] **Step 1: Write the failing tests.** Repository round trip; the route's 422 cases; enumeration test still passes (new routes carry `x-access`); planning uses stored disruptions; and the browser feature:

```gherkin
@e2e
Feature: Lessons were cancelled
  Scenario: Photo day takes one lesson
    When I record that 11D's period 3 on 24 November 2026 was cancelled for "School photos"
    Then the dialog listed 1 lesson before I confirmed
    And the board shows 11D period 3 on 24 November 2026 as cancelled with "School photos"
    And the slot audit counts 1 cancelled lesson for 11D in that half-term
  Scenario: Removing it puts the lesson back
    When I remove "School photos" in Setup
    Then the board shows 11D period 3 on 24 November 2026 as a lesson again
  Scenario: A range with no lessons is refused
    When I try to cancel lessons on 21 November 2026 for "Saturday"
    Then I see "No lessons fall in these dates" and nothing is stored
  Scenario: The dialog is accessible
    Then the page has no serious accessibility violations
```

Check that 11D really has period 3 on Tue 24 Nov 2026 in the seeded timetable; if not, use a period it has and say so in the report.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The dialog is an in-page dialog (no `window.confirm`), keyboard-usable, and focus returns to the button.
- [ ] **Step 4: Run again.** Expected: PASS. Click through in Chrome.
- [ ] **Step 5: Finish line and commit.** `feat(planner): record lessons cancelled for reasons the calendar does not give`

---

### Task 1b.2: Correcting a day, settling the import report

**Files:**
- Create: `packages/domain/src/corrections.ts`, `corrections.test.ts`; `packages/importers/src/calendar/tidy-findings.ts`, `tidy-findings.test.ts`
- Create: `apps/api/src/db/migrations/0004_calendar_corrections.sql`, `apps/api/src/repos/sqlite/correction-repo.ts`, routes in `apps/api/src/routes/calendar.ts`, and tests
- Create: `apps/web/src/screens/setup/FindingActions.tsx`, `features/m1b-corrections.feature`, `e2e/steps/corrections.steps.ts`
- Modify: `packages/domain/src/calendar.ts`, `apps/web/src/screens/board/board-model.ts`, `ImportReport.tsx`, `apps/api/src/usecases/import-calendar.ts`, `planning.ts`, the golden test, `features/m1-board.feature`

**Interfaces:**
- Produces:

```ts
// corrections.ts
export interface LabelCorrection { date: IsoDate; weekLabel: WeekLabel; note: string | null }
export type ResolutionDecision = "teaching-day" | "no-lessons";
export interface FindingResolution { date: IsoDate; decision: ResolutionDecision; reason: string | null }
// calendar.ts: CalendarDay gains `labelSource: "calendar" | "teacher"`
export function toCalendarDays(rows: readonly CalendarRow[], terms: readonly Term[], corrections?: readonly LabelCorrection[]): CalendarDay[];
// tidy-findings.ts
export interface TidyReport { shown: ImportFinding[]; outsideYear: ImportFinding[]; resolved: { finding: ImportFinding; resolution: FindingResolution }[] }
export function tidyFindings(findings: readonly ImportFinding[], terms: readonly Term[], resolutions: readonly FindingResolution[]): TidyReport;
```

Rules:
- A label correction replaces that date's label wherever days are built, and sets `labelSource: "teacher"`. It applies only to a weekday in term; the API refuses others. Removing it brings back the calendar's label.
- A resolution settles the `possible-day-off` or `labelled-holiday` finding on its date.
  - `teaching-day` only clears the warning.
  - `no-lessons` also stores a whole-school cancelled disruption through Task 1b.1's repository: id `day:<date>`, batch `day:<date>`, reason = her reason, or "No lessons (your correction)". Removing the resolution removes it.
- `tidyFindings`:
  - A finding whose date is outside every term, or on a Saturday or Sunday, goes to `outsideYear` with severity `info`. That covers July and August, 31 Oct 2026, and the weekday mismatch on 11 Jul 2026.
  - A resolved finding goes to `resolved`.
  - Findings with no date stay in `shown`.
- A week is "mixed" (board `mixed`, `checkLabels` "mixed-labels-in-week") only when its pupil days disagree. Holidays and other non-teaching days do not count.
- The board's "Short week" marker is removed, with its scenario in `features/m1-board.feature` (her answer to question 17).
- On re-import, a correction or resolution whose date is no longer in the calendar becomes an `error` finding: "Your correction for <date> no longer matches a day in the calendar". It is kept until she removes it.

Routes:
- `GET /api/calendar/corrections` returns `{ labels: LabelCorrection[], resolutions: FindingResolution[] }`.
- `PUT /api/calendar/corrections/labels/{date}`, body `{ weekLabel, note }`.
- `DELETE /api/calendar/corrections/labels/{date}`.
- `PUT /api/calendar/corrections/resolutions/{date}`, body `{ decision, reason }`.
- `DELETE /api/calendar/corrections/resolutions/{date}`.
- The import summary returns the `TidyReport` parts.

What it shows. In the import report:
- Each warning has two buttons, "I have lessons that day" and "No lessons that day" (with an optional reason). Every labelled pupil day listed has "Change week label".
- The outside-year findings collapse into one line, "Outside the school year: N notes (not needed for planning)", which opens on click.
- "Resolved" lists her decisions, each with "Undo".
- The board shows a small "corrected" mark on a day whose label she changed.

- [ ] **Step 1: Write the failing tests**

```ts
test("a label correction wins over the calendar and says so", () =>
  expect(dayOn(toCalendarDays(rows, terms, [{ date: "2027-05-04", weekLabel: "W1", note: null }]), "2027-05-04")).toMatchObject({ weekLabel: "W1", labelSource: "teacher" }));
test("removing the correction brings back the calendar label", () => {});
test("a week whose holiday has another label is not mixed", () => { /* holiday W2 on Monday, W1 Tuesday-Friday */ });
test("findings in August, on a Saturday, or outside every term go to outsideYear as info", () => {});
test("a resolved finding is listed as resolved, not as a warning", () => {});
test("'no lessons' stores a school disruption day:<date> and removing it restores the slots", async () => {});
test("a correction for a date missing from a re-imported calendar is an error finding", async () => {});
// golden, local only: with her corrections applied in the test (2027-05-04 -> W1; no lessons on 2027-03-19 and 2027-06-29;
// 2027-05-04 teaching day): W1 92 and W2 93 labels; the week of 2027-05-03 is not mixed; no possible-day-off warnings remain;
// all of 13 1's slots on 2027-03-19 are cancelled; the fortnight of 16 Nov 2026 still gives 5, 4, 6, 6, 6, 6
```

```gherkin
@e2e
Feature: Correcting the calendar
  Scenario: A day off is confirmed from the import report
    When I import the synthetic calendar
    And I choose "No lessons that day" for 19 March 2027 with the reason "Staff training"
    Then the slot audit lists 19 March 2027 lessons as cancelled with "Staff training"
  Scenario: A week label is corrected
    When I change the week label of 4 May 2027 to Week 1
    Then the board shows 4 May 2027 as Week 1, marked corrected
  Scenario: Notes outside the school year are folded away
    Then the import report shows one line "Outside the school year" and no warning dated in August
  Scenario: The report is accessible
    Then the page has no serious accessibility violations
```

The synthetic year already has a labelled 19 March 2027 ("HOLIDAY?????", Task 1.14b). Add a labelled weekday on 4 May 2027 if it lacks one, and a stray note dated in August. Update the counts that change and list them in the report.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS. Click through in Chrome.
- [ ] **Step 5: Finish line and commit.** `feat(planner): correct a day's week label and settle the import report`

---

### Task 1b.3: Calendar events she confirms

This brings forward the engine and screen of M3 Tasks 3.2 and 3.8, without the AI suggestions and without the plan preview (there are no plans yet). M3 adds both on top of this.

**Files:**
- Create: `packages/domain/src/events.ts`, `events.test.ts`; `apps/api/src/db/migrations/0005_event_classifications.sql`, `repos/sqlite/event-repo.ts`, `routes/events.ts`, `usecases/calendar-events.ts`, and tests
- Create: `apps/web/src/screens/setup/EventsCard.tsx`, `EventRow.tsx`, `features/m1b-events.feature`, `e2e/steps/events.steps.ts`
- Modify: `planning.ts` (slots use stored disruptions plus `disruptionsFromEvents`), `fixtures/src/synthetic-calendar-model.ts`, `SlotCell.tsx`, `TodayScreen.tsx`

**Interfaces:**
- Produces: the types and functions of M3 Task 3.2, with `EventClassification` changed to this shape:

```ts
export type EventCategory = "staff-only" | "mock-exams" | "external-exam" | "study-leave" | "coursework" | "half-day" | "trip" | "assembly" | "meeting" | "other";
export interface EventClassification {
  id: string; wordingKey: string; yearGroup: YearGroup | null;
  onlyDates: IsoDate[] | null;     // null: every date of the candidate
  decision: "cancels" | "no-effect";
  groupIds: GroupId[] | null; periods: Period[] | null;
  until: IsoDate | null;           // each kept date cancels from that date through `until`
  provenance: Provenance;          // "teacher" in M1b
}
export function classificationConflicts(candidates: readonly EventCandidate[], classifications: readonly EventClassification[]): { a: string; b: string; date: IsoDate }[];
```

Rules, beyond Task 3.2's:
- One wording may have several classifications when their kept dates do not overlap. The API refuses an overlap with 409 and names the date.
- `until` must not be before the kept date; when set, the disruption runs `from: date, to: until`. Disruption ids are `ev:<classificationId>:<date>:<scopeKey>`.
- The pre-sort table gains two rows, placed after `mock`: `half day` → half-day, unsure; `extended essay`, or `ee` as a whole word → coursework, cancels.
- A candidate's date is kept when she has a slot that day in the year concerned, or, for a whole-school candidate, any slot that day.
- Routes:
  - `GET /api/events` returns each candidate with its pre-sort, its classifications and the number of her lessons it would hit.
  - `PUT /api/events/classifications/{id}` upserts.
  - `DELETE /api/events/classifications/{id}` removes.

What it shows. Setup gets "Calendar events that may affect your lessons", with three lists: "Suggested: cancels lessons", "Not sure" and "Suggested: no effect". Each row shows:
- the event text, the year (or "Whole school"), its dates and how many of her lessons fall on them;
- two buttons, "Cancels my lessons" and "Does not affect my lessons".

"Cancels my lessons" opens the details:
- which of her groups (default: the groups in that year, or all for a whole-school event);
- which dates (checkboxes, default all);
- "Lasts until" (optional, for study leave);
- periods (default all day).

The lesson count updates as she chooses. A confirmed row shows what it does, with "Change" and "Undo". On the board and on Today, a lesson on a date with an unconfirmed candidate shows "Possible disruption: <event text>".

- [ ] **Step 1: Write the failing tests:** Task 3.2's engine tests, minus the AI ones, plus:

```ts
test("study leave confirmed with 'until' cancels every 13 1 slot from that date to the end", () => {});
test("one wording confirmed for Year 11 on one date and Year 13 on another gives two separate disruptions", () => {});
test("two confirmations covering the same date conflict", () => expect(classificationConflicts(c, [a, b])).toHaveLength(1));
test("'Extended essay day' is pre-sorted as coursework, cancels; 'half day' as not sure", () => {});
test("'Employee' does not match 'ee'", () => {});
```

```gherkin
@e2e
Feature: Calendar events
  Scenario: Nothing is cancelled until I confirm
    Then the Year 13 lessons on 11 January 2027 show "Possible disruption: Mock exams"
    And the slot audit counts no cancelled lessons that week
  Scenario: Confirming the Year 13 mock week
    When I confirm that "Mock exams" cancels my Year 13 lessons
    Then the Year 13 lessons that week show as cancelled with the reason "Mock exams"
    And IB S lessons that week are unchanged
  Scenario: Study leave lasts until the end of the year
    When I confirm "Study leave starts" for 13 1, 13 3 and 13 5 lasting until 29 June 2027
    Then the slot audit shows no Year 13 lessons after 7 May 2027
  Scenario: Undo puts the lessons back
    When I undo the mock week confirmation
    Then the Year 13 lessons on 11 January 2027 show "Possible disruption: Mock exams" again
  Scenario: The events list is accessible
    Then the page has no serious accessibility violations
```

Add to the synthetic year whatever these need that it lacks: a whole-school "Study leave starts" on 5 May 2027 and on 11 May 2027, and a Year 12 "Extended essay day". Say which in the report.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS. Click through in Chrome.
- [ ] **Step 5: Finish line and commit.** `feat(planner): calendar events cancel lessons only once she confirms them`

---

### Task 1b.4: Official exams, and the audit says what does not run

**Files:**
- Create: `fixtures/external-exams.2026-27.json`, `apps/api/src/db/migrations/0006_external_exams.sql`, `repos/sqlite/exam-repo.ts`, `routes/exams.ts`, `packages/domain/src/exams.ts`, and tests
- Create: `apps/web/src/screens/setup/ExamsCard.tsx`, `features/m1b-exams-audit.feature`, `e2e/steps/exams.steps.ts`
- Modify: `packages/domain/src/audit.ts`, `reminders.ts`, `first-run.ts`, `AuditScreen.tsx`, `RemindersList.tsx`

**Interfaces:**
- Produces:

```ts
export interface ExternalExam { id: string; code: string; title: string; date: IsoDate; session: "morning" | "afternoon"; durationMinutes: number; groupIds: GroupId[]; source: string | null }
// audit.ts additions
export interface LostByReason { reason: string; perGroup: Record<GroupId, number> }
export interface SlotAudit { rows: AuditRow[]; lost: Slot[]; daysOff: DayOff[]; lostByReason: LostByReason[]; lastLesson: Record<GroupId, IsoDate | null> }
// reminders.ts: a reminder kind "exam", "<code> <title>" on its date, in the same look-ahead window as reports
```

The fixture holds the three public rows from spec appendix E. `source` is Pearson's timetable URL for each. First run seeds them, as it seeds the timetable. Routes:
- `GET /api/exams`
- `PUT /api/exams/{id}`
- `POST /api/exams`
- `DELETE /api/exams/{id}`

`lostByReason` is sorted by total, largest first, then by reason. `lastLesson` is each group's last open slot.

What it shows. The slot audit gets two new sections:
- "Lessons that will not run": reasons, with counts per group.
- "Last lesson and official exams": per group, the last lesson date and its exams.

Today's "Coming up" lists an exam within the window. Setup gets "Official exams": she can edit, add or remove them, and each shows its source link.

- [ ] **Step 1: Write the failing tests**

```ts
test("lost lessons are grouped by reason with counts per group", () => {});
test("lastLesson is the last open slot of each group", () => {});
test("an exam twelve days ahead is not in Coming up; seven days ahead it is", () => {});
test("first run seeds the three exams once", async () => {});
```

```gherkin
@e2e
Feature: What does not run
  Scenario: The audit groups lost lessons by reason
    Given "Mock exams" is confirmed for Year 13
    Then the slot audit lists "Mock exams" under lessons that will not run, with a count for 13 1
  Scenario: Exams are listed with the last lesson
    Then the slot audit shows "WBS14 01" on Tuesday 1 June 2027 for 13 1, 13 3 and 13 5
  Scenario: The audit is accessible in both themes
    Then the page has no serious accessibility violations
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS. Click through in Chrome.
- [ ] **Step 5: Finish line and commit.** `feat(planner): official exams, last lessons and lost lessons by reason`

---

### Task 1b.5: Board: filter by class, one week, last day before the holiday

**Files:**
- Create: `packages/domain/src/breaks.ts`, `breaks.test.ts`, `apps/web/src/screens/board/GroupFilter.tsx`, `features/m1b-board.feature`, `e2e/steps/board-views.steps.ts`
- Modify: `BoardScreen.tsx`, `FortnightGrid.tsx`, `WeekGrid.tsx`, `board-model.ts`, `TodayScreen.tsx`

**Interfaces:**
- Produces: `export function lastDaysBeforeBreaks(days: readonly CalendarDay[], minWeekdays?: number): IsoDate[]`. It returns each pupil day followed by at least `minWeekdays` (default 5) weekdays in a row without a pupil day, in date order.

What it shows:
- **"Show" filter:** one toggle per group, in its colour, plus "All". The address keeps it as `?groups=13%201,13%203`. Filtered-out lessons leave their cell empty, so the grid keeps its shape.
- **"Fortnight / Week" switch:** the address keeps it as `view=week`. The week view shows the week holding `w1` (or today), with "Previous week" and "Next week".
- **Holiday marker:** the day header says "Last day before the holiday" on each date from `lastDaysBeforeBreaks`, and so does Today.

- [ ] **Step 1: Write the failing tests**

```ts
test("the synthetic year's last days before half-term, winter and Easter are found; a single holiday is not a break", () => {});
```

```gherkin
@e2e
Feature: Board views
  Scenario: Filtering to one class
    When I show only 13 1 on the board
    Then every lesson on the board is 13 1
    And the address keeps the filter after a reload
  Scenario: One week at a time
    When I switch the board to Week
    Then I see one week, and "Next week" moves by seven days
  Scenario: The last day before the winter holiday is marked
    When I open the board on 22 December 2026
    Then that day says "Last day before the holiday"
  Scenario: Both views are accessible
    Then the page has no serious accessibility violations
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS. Click through in Chrome.
- [ ] **Step 5: Finish line and commit.** `feat(web): filter the board by class, one-week view, last day before the holiday`

---

### Task 1b.6: Today: to-do notes

**Files:**
- Create: `apps/api/src/db/migrations/0007_todos.sql`, `repos/sqlite/todo-repo.ts`, `routes/todos.ts`, `apps/web/src/screens/today/TodoNotes.tsx`, `features/m1b-todos.feature`, `e2e/steps/todos.steps.ts`, and tests
- Modify: `TodayScreen.tsx`

**Interfaces:**
- Produces: `interface TodoNote { id: string; text: string; scope: "day" | "week"; date: IsoDate; done: boolean; createdAt: string }`. For `week` notes, `date` is the Monday. Routes:
  - `GET /api/todos?date=` returns that day's notes, that week's notes, and earlier undone notes under "Still to do".
  - `POST /api/todos`
  - `PATCH /api/todos/{id}` (`text`, `done`)
  - `DELETE /api/todos/{id}`

What it shows. Beside today's lessons (below them on a narrow screen) is a column of sticky notes with "Today", "This week" and "Still to do". There is an "Add a note" box with a Today/This week choice and the hint "No student names", a tick box on each note, and a Remove button. Notes have a soft paper colour from theme tokens, with AA contrast in both themes. The look is the planner's own.

- [ ] **Step 1: Write the failing tests.** Repository and route tests, including the "Still to do" carry-over and the 200-character and `<script>` cases, and:

```gherkin
@e2e
Feature: To-do notes
  Scenario: A note for today
    When I add the note "Print the Unit 4 case study" for today
    Then it shows under "Today"
    When I tick it
    Then it shows as done
  Scenario: An undone note carries over
    Given an undone note from 19 November 2026
    Then it shows under "Still to do"
  Scenario: Notes are accessible in both themes
    Then the page has no serious accessibility violations
```
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS. Click through in Chrome.
- [ ] **Step 5: Finish line and commit.** `feat(web): to-do notes on Today`

---

### Task 1b.7: M1b gate

- [ ] Finish line: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`. Golden tests pass locally, and `uv run pytest` passes.
- [ ] Diagrams, through the `architecture-visual-docs` skill: domain model (disruptions, corrections, event classifications, exams, to-do notes), backend components (new routes and repositories), frontend components (new cards and dialogs). Then `sh docs/design/render.sh --check`.
- [ ] Follow `planner-run-and-verify`. Click through every M1b scenario in Chrome with Claude in Chrome and record `m1b-corrections.gif`. Commit `screens/m1b-setup.png`, `m1b-audit.png`, `m1b-board-week.png` and `m1b-today.png`, from synthetic data.
- [ ] The planner `CLAUDE.md` status line says M1b is built. The index scenario map lists the M1b features.
- [ ] Tag `planner-m1b`, push the branch and tag, and update PR #2's description. Add a short list for Gemma: in Setup, confirm the events, correct 4 May, settle 19 March, 4 May and 29 June, and check the exam dates.
