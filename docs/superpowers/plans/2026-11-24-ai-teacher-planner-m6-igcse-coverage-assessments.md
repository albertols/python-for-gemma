# AI Teacher Planner M6: IGCSE, Coverage and the Assessment Calendar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 11D is planned against the department's assessment dates. For every course Gemma sees each specification point as taught, partly taught or not started, on what evidence, and whether it has been assessed. One screen shows every group's assessments with clash and two-per-term warnings, beside report deadlines and parents' evenings.

**Architecture:** Coverage is a pure function of the locked pack, the scheme and one group's plan. The assessment calendar and its warnings are pure functions over every plan's assessments, the terms and the confirmed calendar events. 11D reuses the single-group sequencer; its "other group" is the department's dates.

**Tech Stack:** As the index. Nothing new.

**Spec:** sections 10.6, 10.11 and 12 of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md); template section 5.2 for the two-per-term rule.

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Start with the check described under "Before starting a milestone" in the index.

## Review Focus

1. **A chapter she removed from her scheme.** Its specification points say "not in your scheme", which is different from "not started". Task 6.3.
2. **Groups at different places.** Coverage is always for one named group; it is never averaged across groups. Tasks 6.3 and 6.5.
3. **An assessment with no date.** It is listed as "no date yet", is not counted towards the term's two, and does not break the calendar. Task 6.4.
4. **A mock week confirmed after assessments were planned.** The warning appears the next time the screen loads; nothing is moved. Task 6.4.
5. **A course whose pack is still a draft.** Coverage says the pack must be reviewed and locked first, instead of showing numbers built on unreviewed links. Task 6.5.

## The test world

`coverageWorld()`, added to `@planner/fixtures`, uses the synthetic pack and scheme with the three Year 13 groups.

The synthetic pack (Task 2.6) is fixed as: unit `u1`, in scope, with spec points `s1` to `s5` (`s5` is HL-only) and chapters `ch1` → `s1`, `s2`; `ch2` → `s2`; `ch3` → `s3`; `ch4` → `s4`, `s5`. Unit `u2`, out of scope, with `s6` to `s8` and chapters `ch5` → `s6`, `s7`; `ch6` → `s8`. If Task 2.6 built it differently, change the fixture to this in the first commit of this milestone.

The scheme: `ch1` 3 lessons, `ch2` 4, `a-ch2` (covers `ch1` and `ch2`, dated 2026-11-27), `ch3` 4, `a-ch3` (covers `ch3`, dated 2026-12-11, in-lesson), `ch4` 2. Nothing assesses `ch4`.

---

### Task 6.1: The IGCSE course

**Files:**
- Modify: `packages/importers/src/planning/read-planning.ts`, `to-items.ts`, and tests
- Create: `packages/importers/src/planning/read-planning-igcse.golden.test.ts`
- Modify: `fixtures/src/synthetic-planning.ts` (a three-column variant with a revision row)

**Interfaces:**
- Consumes: `readPlanningSheet`, `planningToItems`, `SowItem.note`.
- Produces: no new functions. `planningToItems` now also turns a row that has a count but no chapter number into a `revision` item, and adds a chapter's third-column text to its `note`, after any count note, joined with "; ".

Her IGCSE Year 11 sheet has three columns (`Y11 Content`, `Number of Classes`, `9/12 Exam Practice`), sections named by unit in her teaching order ("Unit 3 (34 classes)", then Unit 2, then Unit 5), and an "Exam Practice & Revision" row. Several chapters map to one specification point; the pack already allows that.

- [ ] **Step 1: Write the failing tests**

```ts
test("a third column is kept as the item's note", () => expect(item("ch1").note).toBe("9 mark / Quiz"));
test("a row with a count and no chapter number becomes a revision item she can re-label", () =>
  expect(items.find(i => i.title === "Exam Practice & Revision")).toMatchObject({ kind: "revision", lessons: 5, packRefs: [] }));
test("a revision item is not reported as 'not linked to the specification'", () => {});
test("sections named by unit keep the sheet's order, which is her teaching order", () => {});

// read-planning-igcse.golden.test.ts, on her real sheet through the gateway
test("the first section is Unit 3 with chapters 25 to 32 summing to its stated 34", () => {
  expect(firstSection.title).toMatch(/^Unit 3/);
  expect(firstSection.statedSectionTotal).toBe(34);
  expect(chaptersOf(firstSection).map(c => c.number)).toEqual(["25", "26", "27", "28", "29", "30", "31", "32"]);
  expect(sum(chaptersOf(firstSection))).toBe(34);
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(importers): IGCSE planning sheet with notes and revision rows`

---

### Task 6.2: 11D against the department's dates

**Files:**
- Modify: `packages/domain/src/parity.ts`, `parity.test.ts`, `catchup.ts`, `catchup.test.ts`
- Modify: `apps/api/src/routes/parity.ts`, `apps/web/src/screens/parity/ParityScreen.tsx`, `features/m3-parity.feature`

**Interfaces:**
- Consumes: `parity`, `catchUpOptions`.
- Produces: `parity` gains an argument `againstDepartment: boolean`. For a pace set of one group with `againstDepartment` true it returns one report: `groupIds` is that group alone, `jitter` is 0, `gapToday` is null, and `checkpoints` holds only dated assessments. Here slack is the group's slots before the assessment minus the lessons due before it, so a positive number is her cushion and a negative one is how many lessons she is short. `ParityReport` gains `against: "groups" | "department"`.

The department's dates are the dated assessments in the IGCSE scheme, imported from the Year 11 assessment schedule. 11D is "level with the department" when it has taught everything due before each of them.

- [ ] **Step 1: Write the failing tests**

```ts
test("a single group measured against the department has slack before each dated assessment", () => {
  // paceWorld cut down to 13 1, with againstDepartment: 8 slots before a1 and 6 lessons due
  expect(report.against).toBe("department");
  expect(report.checkpoints.map(c => c.checkpoint.id)).toEqual(["cp:a1"]);
  expect(report.checkpoints[0]?.slack).toEqual({ "13 1": 2 });
});
test("when the group cannot finish what is due before the department's assessment, it is short", () => { /* c1 with 7 lessons: 10 due, 8 slots: 2 short */
  expect(shortAt("cp:a1")["13 1"]).toHaveLength(2); });
test("catch-up options for a single group leave out 'hold-others'", () => expect(options.map(o => o.kind)).toEqual(["condense", "homework", "wait"]));
test("without againstDepartment a single group still has no report", () => expect(parity({ ...args, againstDepartment: false })).toEqual([]));
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The API passes `againstDepartment: true` for the IGCSE course; the parity screen then heads the column "11D" and says "Compared with the department's assessment dates." Add a browser scenario to `features/m3-parity.feature` that opens parity for the IGCSE course and reads that sentence.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): measure 11D against the department's assessment dates`

---

### Task 6.3: Coverage

**Files:**
- Create: `packages/domain/src/coverage.ts`, `coverage.test.ts`, `coverage.prop.test.ts`, `coverage.steps.test.ts`
- Create: `features/11-coverage.feature`, `fixtures/src/coverage-world.ts`

**Interfaces:**
- Consumes: `CurriculumPack`, `SowItem.packRefs`, `AssessmentSpec.covers`, `PlanSnapshot`, `delivered`.
- Produces:

```ts
export type CoverageState = "out-of-scope" | "unmapped" | "not-in-scheme" | "not-started" | "partial" | "taught";
export type TaughtBasis = "declared" | "assumed" | "logged" | "cover" | "homework";
export interface SpecCoverage { specPointId: string; code: string; title: string; unitId: string; level: "core" | "hl-only"; state: CoverageState; linkedItems: string[]; deliveredItems: string[]; basis: TaughtBasis[]; assessedBy: { itemId: string; confirmed: boolean }[]; flag: "taught-never-assessed" | null }
export function coverage(args: { pack: CurriculumPack; items: readonly SowItem[]; snapshot: PlanSnapshot; slots: readonly Slot[]; groupId: GroupId; today: IsoDate }): SpecCoverage[];
export function coverageSummary(rows: readonly SpecCoverage[]): Record<CoverageState, number> & { flagged: number };
```

Rules (spec section 10.11):

- A point in a unit that is out of scope is `out-of-scope`.
- An in-scope point that no chapter links to is `unmapped`.
- Its linked items are the teaching items whose `packRefs` include a chapter that links to it. With none, it is `not-in-scheme`.
- An item is delivered for the group when every one of its lessons is delivered. The point is `taught` when all linked items are delivered, `not-started` when no lesson of any linked item is delivered, and `partial` otherwise.
- `basis` lists how the delivered lessons were delivered: `declared`, `assumed`, `logged` (state `taught`), `cover`, `homework`. Sorted, no repeats.
- `assessedBy` lists assessments whose `covers` include a linked item and that have been sat. An assessment is sat when its status is `sat` (`confirmed: true`), or when this group's slot for it is before `today` (`confirmed: false`).
- The flag `taught-never-assessed` is raised only when the point is `taught`, `assessedBy` is empty, and every teaching item of the point's unit in the scheme is delivered for the group: the unit has ended.

- [ ] **Step 1: Write the feature file** for scenario 11, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests** on `coverageWorld()`

```ts
test("before anything is taught, in-scope points are not started and out-of-scope ones say so", () => {
  expect(state("s1")).toBe("not-started"); expect(state("s6")).toBe("out-of-scope");
});
test("a point linked to two chapters is partial when one is taught", () => {
  // today after ch1 is delivered for 13 1 and before ch2 ends
  expect(row("s2")).toMatchObject({ state: "partial", linkedItems: ["ch1", "ch2"], deliveredItems: ["ch1"] });
});
test("the basis says how it was taught", () => { /* ch1 declared by position, ch2 assumed: s2 basis ["assumed", "declared"] */ });
test("a lesson delivered as cover shows cover in the basis", () => {});
test("an assessment counts once it is sat, and says whether she confirmed it", () => {
  expect(row("s1").assessedBy).toEqual([{ itemId: "a-ch2", confirmed: false }]);      // its slot has passed
});
test("scenario 11: the unit has ended and nothing assessed chapter 4", () => {
  // today after ch4 is delivered for 13 1
  expect(row("s4")).toMatchObject({ state: "taught", assessedBy: [], flag: "taught-never-assessed" });
  expect(row("s1").flag).toBeNull();
});
test("the flag is not raised before the unit ends", () => { /* ch3 taught, a-ch3 not yet sat, ch4 still to teach: s3.flag is null */ });
test("a chapter removed from the scheme leaves its points 'not in your scheme'", () => { /* drop ch3: s3 is not-in-scheme */ });
test("an unlinked point in a draft pack is unmapped, never not-started", () => {});
test("coverage differs by group", () => { /* 13 3 one lesson behind: s2 is partial for 13 3 and taught for 13 1 on the same day */ });
test("the summary adds up to the number of points", () => {});

// coverage.prop.test.ts (spec section 10.14)
// - every spec point appears exactly once and has exactly one state
// - deliveredItems is a subset of linkedItems
// - moving `today` later never turns "taught" back into "partial" unless the log skipped a lesson
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run again.** Expected: PASS, including scenario 11.
- [ ] **Step 6: Finish line and commit.** `feat(domain): specification coverage per group, with its evidence`

---

### Task 6.4: The assessment calendar and its warnings

**Files:**
- Create: `packages/domain/src/assessments.ts`, `assessments.test.ts`
- Create: `apps/api/src/usecases/assessment-calendar.ts`, `routes/assessments.ts`, and tests
- Modify: `apps/api/src/usecases/check-in.ts`, `routes/checkin.ts`

**Interfaces:**
- Consumes: every plan's head snapshot, `Term`, `EventCandidate`, `EventClassification`, `ReportWindow`, `ParentsEvening`.
- Produces:

```ts
export interface AssessmentEntry { courseId: CourseId; groupId: GroupId; itemId: string; title: string; type: string; marks: number | null; date: IsoDate | null; slotKey: SlotKey | null; slotUse: "whole" | "in-lesson"; status: "planned" | "sat"; termId: Term["id"] | null }
export type AssessmentWarning =
  | { kind: "same-week"; groupId: GroupId; weekOf: IsoDate; itemIds: string[] }
  | { kind: "in-exam-week"; groupId: GroupId; itemId: string; date: IsoDate; eventText: string }
  | { kind: "too-few-in-term"; groupId: GroupId; termId: Term["id"]; count: number; needed: 2 }
  | { kind: "no-date"; groupId: GroupId; itemId: string }
  | { kind: "no-slot"; groupId: GroupId; itemId: string; date: IsoDate };
export function assessmentEntries(plans: readonly { snapshot: PlanSnapshot; items: readonly SowItem[]; groups: readonly Group[] }[], slots: readonly Slot[], terms: readonly Term[]): AssessmentEntry[];
export function assessmentWarnings(args: { entries: readonly AssessmentEntry[]; groups: readonly Group[]; terms: readonly Term[]; examEvents: readonly { yearGroup: YearGroup; dates: IsoDate[]; text: string; category: "mock-exams" | "external-exam" }[] }): AssessmentWarning[];
```

Routes: `GET /api/assessments` returns `{ entries, warnings, reportWindows, parentsEvenings }`. `POST /api/assessments/:courseId/:itemId/status` with `{ status }` sets `sat` or `planned`. The check-in now also lists planned assessments whose slot has passed, with "Did this assessment happen?"; confirming sets `sat`.

Rules:

- One entry per assessment per group. An entry's date is the date of that group's slot for it, or the assessment's own date when it has no slot.
- `same-week`: one group has two or more assessments in one Monday-to-Friday week.
- `in-exam-week`: the date she gave the assessment in the scheme is covered by a confirmed mock or external exam event for that group's year. The warning carries that date; if the lessons that week are cancelled, the entry itself shows the later slot the assessment moved to.
- `too-few-in-term`: Gemma's rule is at least two assessments per group per term. A confirmed mock-exam event for the group's year in that term counts as one. Term 3 is not checked for Year 11 and Year 13, whose term 3 is external exams.
- `no-date` for an undated planned assessment; `no-slot` for the engine's `assessment-no-slot` conflict.
- Warnings are sorted by date, then group.

- [ ] **Step 1: Write the failing tests**

```ts
test("one entry per assessment per group, dated by that group's own slot", () =>
  expect(dates("a1")).toEqual({ "13 1": "2026-11-27", "13 3": "2026-12-01", "13 5": "2026-11-27" }));
test("two assessments for one group in one week are a warning for that group only", () => {});
test("an assessment in the confirmed mock week is a warning naming the event", () =>
  expect(warnings).toContainEqual({ kind: "in-exam-week", groupId: "13 1", itemId: "a2", date: "2027-01-13", eventText: "Mock exams" }));
test("an unconfirmed mock week gives no warning", () => {});
test("a group with one assessment in term 1 is told it needs two", () =>
  expect(warnings).toContainEqual({ kind: "too-few-in-term", groupId: "IB S", termId: "T1", count: 1, needed: 2 }));
test("a confirmed mock week counts as one of the two in its term", () => { /* Year 13, term 2: mock + one assessment: no warning */ });
test("term 3 is not checked for Year 11 and Year 13, and is checked for Year 12", () => {});
test("an undated assessment is a no-date warning and is not counted in any term", () => {});
test("marking an assessment as sat is stored and shows in coverage as confirmed", async () => {});
test("the check-in asks about an assessment whose slot has passed", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The API builds `examEvents` from confirmed event classifications in the `mock-exams` and `external-exam` categories.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): assessment calendar with clash and two-per-term warnings`

---

### Task 6.5: Coverage screen

**Files:**
- Create: `apps/api/src/routes/coverage.ts`, and its test
- Create: `apps/web/src/screens/coverage/CoverageScreen.tsx`, `CoverageTree.tsx`, `CoverageSummary.tsx`
- Create: `e2e/steps/coverage.steps.ts` (browser steps for `features/11-coverage.feature`), `features/m6-coverage.feature`
- Modify: `routes.tsx`, `AppShell.tsx`, `scripts/seed-synthetic.ts`

**Interfaces:**
- Consumes: `coverage`, `coverageSummary`.
- Produces: `GET /api/coverage/:courseId?groupId=` returning `{ rows: SpecCoverage[]; summary; pack: { locked: boolean; lockedAt: string | null } }`; 409 with a sentence when the pack is not locked. Screen `/coverage/:courseId`.

What it shows: a course and group chooser; a summary line ("Taught 12, partly 3, not started 9, not in your scheme 1"); the specification as a tree of units and points. Each point has its code, title, state in words with an icon, the evidence ("declared", "assumed taught", "logged", "cover work"), and for assessed points "Assessed at chapter level by" with the assessment's title and whether she confirmed it. A point flagged `taught-never-assessed` says "Taught, never assessed". Filters: everything, gaps only, flagged only. Out-of-scope units are collapsed and labelled "Taught in another year". With a draft pack the screen shows one message and a link to the pack review.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Coverage
  Scenario: Coverage is for one group and says on what evidence
    When I open coverage for the Year 13 course and choose 13 1
    Then each specification point shows a state in words and its evidence
  Scenario: Gaps only
    When I filter to gaps only
    Then I see only points that are not started, partly taught or not in my scheme
  Scenario: A draft pack
    Given the course's pack is not locked
    Then coverage says the pack must be reviewed and locked first
  Scenario: The screen is accessible
    Then the page has no serious accessibility violations
```

The steps for scenario 11 seed a plan whose first unit has ended with nothing assessing its last chapter, and check for "Taught, never assessed" on that chapter's points and not on the others.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): coverage screen with states, evidence and gaps`

---

### Task 6.6: Assessments and reports screen

**Files:**
- Create: `apps/web/src/screens/assessments/AssessmentsScreen.tsx`, `AssessmentTable.tsx`, `WarningsPanel.tsx`, `ReportsPanel.tsx`
- Create: `features/m6-assessments.feature`, `e2e/steps/assessments.steps.ts`
- Modify: `routes.tsx`, `AppShell.tsx`

**Interfaces:**
- Consumes: `GET /api/assessments`, `POST /api/assessments/:courseId/:itemId/status`.
- Produces: screen `/assessments`.

What it shows: a table with one row per week of the year and one column per group; each cell lists that group's assessments that week with type, marks and whether it takes a whole lesson. Weeks with a confirmed mock or exam event for a year are marked for that year's groups. A warnings panel lists every warning as a sentence ("13 1 has two assessments in the week of 23 November", "IB S has 1 assessment in term 1; you need 2", "13 3: 'Unit 4 mock review' has no date yet"), each linking to the scheme item. A second panel lists every report window for her groups with all three dates, and every parents' evening, with the ones in the next 14 days first. Each past assessment has a "Sat" checkbox.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Assessments and reports
  Scenario: Every group's assessments on one screen
    When I open assessments
    Then I see a column for each of my six groups and a row for each week
    And each Year 13 group shows its assessment in its own week
  Scenario: Warnings are sentences
    Then I see a warning that a group has too few assessments in a term, naming the group and the term
  Scenario: Report deadlines and parents' evenings
    Then I see the Year 11 long report's three dates
    And I see the Year 13 parents' evening on 26 November 2026
  Scenario: The screen is accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagram 04.**
- [ ] **Step 6: Finish line and commit.** `feat(web): assessments and reports on one screen, with warnings`

---

### Task 6.7: M6 gate

**Files:**
- Create: `docs/design/ai-teacher-planner/screens/m6-coverage.png`, `m6-assessments.png`
- Modify: both `CLAUDE.md` files, diagrams as needed, the PR description

- [ ] **Step 1: Run every scenario so far.** `pnpm test` and `pnpm e2e`. Expected: PASS.
- [ ] **Step 2: Build the real IGCSE pack with Gemma.** `pnpm pack:draft --course igcse-business --spec "igcse/igcse Textbook and Specification/IGCSE spec.pdf"`, with only the units she teaches in Year 11 in scope (3, 2 and 5). She reviews and locks it. This is the pack where several chapters share a specification point, so read those links with her.
- [ ] **Step 3: Go live for 11D.** Import her Year 11 planning sheet and assessment schedule. Enter the position from spec appendix D: Unit 3 is in progress at chapter 30, about halfway, and the finance assessment of 24 November is sat. She picks the exact next lesson. Read the proposal with her before she accepts.
- [ ] **Step 4: Read coverage with her for one course.** The success measure is that she checks a course's mapping once, in one sitting. Note how long it took and what she corrected.
- [ ] **Step 5: The gate.** Follow "Milestone gate" in the index.
- [ ] **Step 6: Commit and tag.** `docs(planner): M6 gate`, then `git tag planner-m6`.
