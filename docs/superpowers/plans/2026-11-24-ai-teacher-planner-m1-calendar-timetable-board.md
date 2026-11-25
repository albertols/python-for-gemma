# AI Teacher Planner M1: Calendar, Timetable, Slots, Board

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemma starts the app with one command, imports the school calendar, sees an import report and a slot audit she can check against her timetable, and opens a fortnight board and a Today screen with real dates.

**Architecture:** The pure engine turns calendar rows, terms and a timetable into slots. The importer reads the workbook by header text and reports anything odd. A local Hono API stores imports in SQLite and serves the React app.

**Tech Stack:** As the index. New in this milestone and not proven by spike: `@hono/node-server`, `react-router`, `tailwindcss` 4, shadcn/ui, `@tanstack/react-query`, `@playwright/test`, `playwright-bdd`, `@axe-core/playwright`.

**Spec:** [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md) sections 8, 9, 10.1, 10.2, 12, 13, 14 and appendix A.

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Paths are relative to `prototypes/ai_teacher_planner/` unless they start with `.github/`, `.claude/` or `docs/`.

## Review Focus

1. **A calendar column is renamed or moved.** Task 1.4 tests both.
2. **Today is a weekend, a holiday, or outside every term.** Today shows the next teaching day and no error. Tasks 1.8 and 1.12.
3. **It is just after midnight.** The local date is used, not the UTC date. Task 1.6.
4. **First run with an empty data folder, and a run after a schema change.** The database is created; an existing one is backed up before it is migrated. Task 1.6.
5. **The timetable is edited into an impossible state** (two groups in one period, a group that does not exist). The save is refused with the reason. Tasks 1.3 and 1.10.

---

### Task 1.1: Workspace, toolchain and CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts`
- Create: `fixtures/package.json`, `fixtures/tsconfig.json`, `fixtures/src/index.ts`, `fixtures/src/domain-purity.test.ts`
- Modify: `.github/workflows/ci.yml` (add job `planner`)

**Interfaces:**
- Produces: the commands in the index; package `@planner/domain` exporting from `src/index.ts`; package `@planner/fixtures`.

- [ ] **Step 1: Create the workspace files**

`pnpm-workspace.yaml` lists `packages/*`, `apps/*`, `fixtures`, `e2e`. Root `package.json` is private, `"type": "module"`, with scripts `typecheck` (`pnpm -r typecheck`), `lint` (`biome check .`), `test` (`vitest run`), `build` (`pnpm -r --if-present build`). Install the proven dev tools at the exact versions in the index.

`tsconfig.base.json` is the spike's proven configuration plus two flags that let Node run the source directly:

```json
{
  "compilerOptions": {
    "target": "ES2023", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true, "erasableSyntaxOnly": true, "allowImportingTsExtensions": true,
    "skipLibCheck": true, "noEmit": true
  }
}
```

`packages/domain/tsconfig.json` extends it with `"lib": ["ES2023"]` and `"types": []`, so DOM and Node globals do not type-check there. `packages/domain/package.json` has no `dependencies`.

`vitest.config.ts` at the root runs every package's `src/**/*.test.ts` with one `pnpm test`.

- [ ] **Step 2: Write the failing purity test** in `fixtures/src/domain-purity.test.ts`

```ts
test("the engine imports nothing but itself", () => {
  for (const file of domainSourceFiles())            // packages/domain/src/**/*.ts, tests excluded
    for (const spec of importSpecifiers(read(file)))
      expect(spec.startsWith("./"), `${file} imports ${spec}`).toBe(true);
});
test("the engine has no clock and no randomness", () => {
  for (const file of domainSourceFiles())
    expect(read(file), file).not.toMatch(/Date\.now\(|new Date\(\s*\)|Math\.random\(/);
});
test("the purity check sees at least one file", () => expect(domainSourceFiles().length).toBeGreaterThan(0));
```

- [ ] **Step 3: Run it.** `pnpm test fixtures/src/domain-purity.test.ts`. Expected: FAIL, the helpers are not defined.

- [ ] **Step 4: Implement the helpers** in the test file's folder, add `export {};` content to `packages/domain/src/index.ts`, and run again. Expected: PASS. Then add `import "node:fs"` to `packages/domain/src/index.ts`, confirm the first test fails and `pnpm typecheck` fails, and remove it.

- [ ] **Step 5: Lint rule.** In `biome.json`, enable the recommended rules and, for `packages/domain/**`, the rule that forbids Node built-in imports (`noNodejsModules`; check the Biome 2.6 documentation for its group). Verify with the same temporary import that `pnpm lint` fails, then remove it.

- [ ] **Step 6: CI.** Add to `.github/workflows/ci.yml`, beside the existing jobs and without changing them:

```yaml
  planner:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: prototypes/ai_teacher_planner
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v5
        with:
          install_args: node pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

Later tasks append `pnpm build` (Task 1.9) and `pnpm e2e` (Task 1.9) to this job.

- [ ] **Step 7: Finish line and commit.** `chore(planner): scaffold the pnpm workspace with a purity guard on the engine`. Commit `pnpm-lock.yaml`.

---

### Task 1.2: Dates and calendar days

**Files:**
- Create: `packages/domain/src/dates.ts`, `dates.test.ts`, `calendar.ts`, `calendar.test.ts`
- Create: `fixtures/terms.2026-27.json`, `fixtures/src/synthetic-calendar-model.ts`
- Modify: `packages/domain/src/index.ts`, `fixtures/src/index.ts`

**Interfaces:**
- Produces: everything under `dates.ts` and `calendar.ts` in the index contract, and from `@planner/fixtures`: `SYNTHETIC_TERMS: Term[]` and `syntheticRows(): CalendarRow[]`.

The synthetic year is built by rule, not copied from the school's file. `syntheticRows()` returns one row per day from 2026-08-01 to 2027-06-30:

- Weekdays from 2026-08-31 to 2027-06-29 are labelled, except holidays. Weeks alternate, starting with `W1` in the week of 2026-08-31 and counting only weeks that contain a labelled day.
- Holidays have no label. `secondaryEvent` is "School Holiday" on 2026-11-02 to 06, 2026-12-23 to 2027-01-07, 2027-02-15 to 19 and 2027-03-22 to 2027-04-02, and "Official Holiday" on 2026-10-12 and 2027-05-17.
- `secondaryEvent` is "New staff induction" on 2026-08-31, "Staff training" on 2026-09-01 to 03, "First day of term for students" on 2026-09-04, "Staff training day" on 2027-05-04 and "Staff only" on 2027-06-29.
- `rawLabel` is `"x"` with `weekLabel` null on Saturday 2026-10-31.
- Year 11 and Year 13 `events` are "Mock exams" on 2027-01-11 to 15. Year 12 `events` is "Geography trip" on 2026-12-02.

`fixtures/terms.2026-27.json` and `SYNTHETIC_TERMS` both hold: T1 2026-09-04 to 2026-12-22, T2 2027-01-08 to 2027-03-19, T3 2027-04-05 to 2027-06-29.

- [ ] **Step 1: Write the failing tests**

```ts
// dates.test.ts
test("weekdayOf reads the weekday from the date", () => {
  expect(weekdayOf("2027-01-08")).toBe(5);
  expect(weekdayOf("2026-07-11")).toBe(6);
});
test("addDays crosses a month, a year and a leap day", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
});
test("mondayOf", () => expect(mondayOf("2027-01-08")).toBe("2027-01-04"));
test("isIsoDate rejects impossible dates", () => {
  expect(isIsoDate("2027-02-30")).toBe(false);
  expect(isIsoDate("27-02-01")).toBe(false);
});

// calendar.test.ts, with days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS)
test("the synthetic year has the real year's traps", () => {
  expect(label("2026-11-24")).toBe("W2");
  expect(label("2026-12-21")).toBe("W2");
  expect(label("2026-12-22")).toBe("W2");
  expect(label("2027-01-07")).toBeNull();
  expect(label("2027-01-08")).toBe("W1");
  expect(label("2027-02-12")).toBe("W2");
  expect(label("2027-02-22")).toBe("W1");
});
test("a labelled day before term is not a pupil day", () =>
  expect(day("2026-09-01")).toMatchObject({ weekLabel: "W1", kind: "outside-term", pupilDay: false }));
test("the first day of term is a pupil day", () =>
  expect(day("2026-09-04")).toMatchObject({ kind: "pupil", pupilDay: true }));
test("an unlabelled weekday in term is not a pupil day and keeps its text", () =>
  expect(day("2026-10-12")).toMatchObject({ kind: "unlabelled", pupilDay: false, text: "Official Holiday" }));
test("a weekend is never a pupil day, whatever its label cell says", () =>
  expect(day("2026-10-31")).toMatchObject({ weekLabel: null, kind: "weekend", pupilDay: false }));
test("checkLabels finds nothing wrong in the synthetic year", () => expect(checkLabels(days)).toEqual([]));
test("checkLabels reports a week with two labels", () => { /* flip 2026-09-09 to W1 */
  expect(checkLabels(changed)).toContainEqual(expect.objectContaining({ kind: "mixed-labels-in-week", weekOf: "2026-09-07" })); });
test("checkLabels reports two labelled weeks in a row with one label", () => { /* relabel the week of 2026-09-14 as W2 */
  expect(checkLabels(changed)).toContainEqual(expect.objectContaining({ kind: "labels-do-not-alternate", weekOf: "2026-09-14" })); });
test("teaching blocks split at a full week off and at term ends, not at a single day off", () =>
  expect(teachingBlocks(days, SYNTHETIC_TERMS).slice(0, 4)).toEqual([
    { id: "T1a", termId: "T1", from: "2026-09-04", to: "2026-10-30" },
    { id: "T1b", termId: "T1", from: "2026-11-09", to: "2026-12-22" },
    { id: "T2a", termId: "T2", from: "2027-01-08", to: "2027-02-12" },
    { id: "T2b", termId: "T2", from: "2027-02-22", to: "2027-03-19" },
  ]));
test("fortnights pair a Week 1 week with the Week 2 week after it", () => {
  const f = fortnights(days);
  expect(f).toContainEqual({ w1: "2026-12-14", w2: "2026-12-21", breakBefore: false });
  expect(f).toContainEqual({ w1: "2027-01-04", w2: "2027-01-11", breakBefore: true });
  expect(f).toContainEqual({ w1: "2027-02-22", w2: "2027-03-01", breakBefore: true });
});
test("a Week 2 week with no Week 1 before it stands alone", () => { /* days starting at a W2 week */
  expect(fortnights(fromW2)[0]).toMatchObject({ w1: null }); });
```

- [ ] **Step 2: Run them.** `pnpm test packages/domain/src/dates.test.ts packages/domain/src/calendar.test.ts`. Expected: FAIL, nothing is exported yet.

- [ ] **Step 3: Implement** the functions with the signatures in the index contract. Rules the tests do not fully pin:
  - `toCalendarDays`: `kind` is `weekend` for Saturday and Sunday; otherwise `outside-term` when the date is in no term; otherwise `unlabelled` when `weekLabel` is null; otherwise `pupil`. `text` is `secondaryEvent`, else `datesOfImportance`, else null. Output is sorted by date.
  - `teachingBlocks`: inside each term, a block is a maximal run of Monday-to-Friday weeks that each contain a pupil day. `from` and `to` are the block's first and last pupil days. Ids are the term id plus `a`, `b`, `c` in date order.
  - `fortnights`: walk the weeks that contain a pupil day, in order. A `W1` week opens a fortnight. A `W2` week closes the open fortnight if it has no `w2` yet, and otherwise stands alone with `w1: null`. `breakBefore` is true when at least one Monday-to-Friday week without a pupil day lies between this fortnight and the previous one.
  - Date arithmetic uses `Date.UTC` on the parsed parts only.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Finish line and commit.** `feat(domain): dates, calendar days, teaching blocks and fortnights`

---

### Task 1.3: Timetable seed, slots and the slot audit

**Files:**
- Create: `fixtures/timetable.2026-27.json`, `fixtures/groups.2026-27.json`
- Create: `packages/domain/src/timetable.ts`, `timetable.test.ts`, `slots.ts`, `slots.test.ts`, `slots.prop.test.ts`, `audit.ts`, `audit.test.ts`
- Create: `features/01-cycle-from-calendar.feature`, `02-two-day-week.feature`, `03-one-day-week.feature`, `04-staff-days.feature`, `packages/domain/src/cycle.steps.test.ts`
- Create: `fixtures/src/feature-file.ts`

**Interfaces:**
- Consumes: `CalendarDay`, `TeachingBlock`, `syntheticRows`, `SYNTHETIC_TERMS`.
- Produces: `timetable.ts` and `slots.ts` as in the index contract; `SEED_TIMETABLE: TimetableVersion` and `SEED_GROUPS: Group[]` from `@planner/fixtures`; `featureFile(name: string): string`; and:

```ts
// audit.ts
export interface AuditRow { block: TeachingBlock; perGroup: Record<GroupId, { open: number; cancelled: number; cover: number }> }
export interface DayOff { date: IsoDate; text: string | null; wouldHaveHad: { groupId: GroupId; period: Period }[] }
export interface SlotAudit { rows: AuditRow[]; lost: Slot[]; daysOff: DayOff[] }
export function auditSlots(input: { slots: readonly Slot[]; days: readonly CalendarDay[]; blocks: readonly TeachingBlock[]; timetables: readonly TimetableVersion[]; groups: readonly Group[] }): SlotAudit;
```

`fixtures/timetable.2026-27.json` is spec appendix A, cell for cell: `id` "2026-27", `validFrom` "2026-08-31", one entry per lesson cell with its room, one duty per `400` cell. Form time and lunch duties are left out. `fixtures/groups.2026-27.json`: `11D` (year 11, IGCSE, `igcse-business`, core), `IB H` (12, IB, `ib-business`, hl), `IB S` (12, IB, `ib-business`, core), `13 1`, `13 3`, `13 5` (13, A level, `ial-business-u4`, core). `colour` holds a token name `g1` to `g6`; Task 1.9 gives the tokens values.

- [ ] **Step 1: Write the four feature files** with the wording of spec section 17, scenarios 1 to 4, tagged `@engine`. Scenario 1 is also tagged `@e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
// timetable.test.ts
test("lessons per fortnight match her timetable", () =>
  expect(lessonsPerFortnight(SEED_TIMETABLE)).toEqual({
    "11D": { W1: 3, W2: 2, total: 5 }, "IB H": { W1: 2, W2: 2, total: 4 }, "IB S": { W1: 3, W2: 3, total: 6 },
    "13 1": { W1: 3, W2: 3, total: 6 }, "13 3": { W1: 3, W2: 3, total: 6 }, "13 5": { W1: 3, W2: 3, total: 6 } }));
test("the seed is valid", () => expect(validateTimetable(SEED_TIMETABLE, SEED_GROUPS)).toEqual([]));
test("two groups in one period are refused", () => expect(validateTimetable(withClash, SEED_GROUPS)).toHaveLength(1));
test("an unknown group is refused", () => expect(validateTimetable(withGhost, SEED_GROUPS)[0]).toContain("12X"));

// cycle.steps.test.ts: slots = buildSlots({ days, timetables: [SEED_TIMETABLE], groups: SEED_GROUPS, disruptions: [] })
// Scenario 1: every slot from 2027-02-22 to 2027-02-26 has weekLabel "W1"; counts are 11D 3, IB H 2, IB S 3, 13 1 3, 13 3 3, 13 5 3
// Scenario 2: 2026-12-21 to 2026-12-25 has exactly IB H 2, 13 1 1, 13 5 1, 11D 2, 13 3 1 and no IB S slot
// Scenario 3: 2027-01-04 to 2027-01-08 has exactly one slot, with key "13 1|2027-01-08|6"
// Scenario 4: no slot has date 2026-09-01

// slots.test.ts
test("a double is two joined units; periods 2 and 3 never join", () => {
  expect(slot("13 3|2026-11-19|3").doubleWith).toBe("13 3|2026-11-19|4");
  expect(slot("13 3|2026-11-19|4").doubleWith).toBe("13 3|2026-11-19|3");
  expect(slot("13 5|2026-11-24|2").doubleWith).toBeNull();
});
test("a school closure cancels every group's slots that day and keeps the reason", () => {
  const s = withDisruption({ id: "d1", scope: { kind: "school" }, from: "2026-11-19", to: "2026-11-19", periods: null, effect: "cancelled", reason: "Snow", source: "teacher" });
  expect(s.filter(x => x.date === "2026-11-19").every(x => x.status === "cancelled" && x.reasons[0]?.text === "Snow")).toBe(true);
});
test("a year-group event touches only that year", () => { /* scope year 13 on 2026-11-19: 13 3 and 13 5 cancelled, IB S open */ });
test("an absence gives cover, and cancelled wins over cover", () => { /* teacher scope cover + school scope cancelled on one day */ });
test("a periods list limits the disruption", () => { /* periods [3]: P3 cancelled, P4 open */ });
test("a later timetable version applies from its date only", () => { /* version 2 validFrom 2027-01-08 moves 13 1 to P5 on Fridays */ });
test("slots are sorted by date, then period, then group", () => expect(slots).toEqual([...slots].sort(bySlotOrder)));

// slots.prop.test.ts (fast-check; spec section 10.14)
// - no slot on a day whose pupilDay is false
// - an undisrupted Monday-to-Friday week of pupil days yields exactly lessonsPerFortnight()[g][label] slots per group
// - adding a disruption never changes the set of slot keys
// - shuffling the disruption list never changes the result

// audit.test.ts
test("each block row counts open slots per group", () => expect(audit.rows[0]?.perGroup["13 1"]?.open).toBeGreaterThan(0));
test("a day off inside a block is listed with what was lost", () =>
  expect(audit.daysOff).toContainEqual({ date: "2026-10-12", text: "Official Holiday", wouldHaveHad: [
    { groupId: "IB H", period: 1 }, { groupId: "IB H", period: 2 }, { groupId: "11D", period: 3 }, { groupId: "13 1", period: 5 }, { groupId: "13 5", period: 6 } ] }));
test("cancelled slots are listed as lost, with their reasons", () => expect(auditWithSnow.lost.length).toBe(5));
```

The snow day in the last test is 2026-11-19, a Week 1 Thursday: IB S P1 and P2, 13 3 P3 and P4, 13 5 P6.

- [ ] **Step 3: Run them.** Expected: FAIL, nothing is exported yet.

- [ ] **Step 4: Implement.** Rules the tests do not fully pin:
  - `buildSlots`: for each pupil day, use the timetable version with the latest `validFrom` on or before the date. A disruption applies to a slot when the date is in its range, the period is in its `periods` (null means all), and its scope matches: `school` and `teacher` match every group; `year` matches the group's `yearGroup`; `group` matches the id. Status is `cancelled` if any applying disruption cancels, else `cover` if any gives cover, else `open`. `reasons` lists every applying disruption, sorted by id.
  - `doubleWith` joins only period pairs 1+2, 3+4 and 5+6 of one group on one date.
  - `auditSlots.daysOff`: weekdays inside a block with `kind: "unlabelled"`. The week's label is read from the other days of that same week; if the week has no labelled day, the day is not listed.

- [ ] **Step 5: Run again.** Expected: PASS, including the four scenarios.

- [ ] **Step 6: Finish line and commit.** `feat(domain): timetable seed, slot builder with disruptions, slot audit`

---

### Task 1.4: Synthetic calendar workbook and the calendar importer

**Files:**
- Create: `fixtures/src/synthetic-calendar.ts`
- Create: `packages/importers/package.json`, `tsconfig.json`, `src/index.ts`, `src/resources-available.ts`
- Create: `packages/importers/src/calendar/read-calendar.ts`, `read-calendar.test.ts`, `read-calendar.golden.test.ts`

**Interfaces:**
- Consumes: `CalendarRow`, `syntheticRows`, `checkLabels`, `toCalendarDays`.
- Produces:

```ts
// fixtures: writes the synthetic model into a workbook laid out like the school's
export interface SyntheticWorkbookOptions { renameHeader?: { from: string; to: string }; insertBlankColumnAt?: number; assRepMismatchOn?: IsoDate }
export function buildSyntheticWorkbook(options?: SyntheticWorkbookOptions): Promise<Uint8Array>;

// importers
export type FindingKind = "missing-header" | "missing-sheet" | "unknown-label" | "label-on-weekend" | "weekday-mismatch" | "date-gap" | "unparseable-row" | "merged-cells" | "year-block-mismatch" | "label-issue" | "assrep-mismatch";
export interface ImportFinding { kind: FindingKind; severity: "error" | "warning" | "info"; sheetRow: number | null; date: IsoDate | null; message: string }
export interface CalendarImport { ok: boolean; academicYear: { start: number; end: number } | null; rows: CalendarRow[]; findings: ImportFinding[]; fileHash: string }
export function readCalendarWorkbook(data: Uint8Array): Promise<CalendarImport>;
export function resourcesAvailable(): boolean;   // true when PLANNER_RESOURCES_DIR (default ../resources) holds the calendar workbook
```

**The workbook layout to reproduce** (checked against the school's file on 24 Nov 2026):

- Sheet `Calendar 2026-27`. Row 1 has the title `Calendar 2026/27` in column C and the year-group names `Year 7` to `Year 13`, each above the middle of its block. Row 2 is the header: an empty column A, then `Month`, `Date`, `Day`, `Week1/2`, `After school meetings`, `DATES OF IMPORTANCE`, `SECONDARY EVENT`, then per year group `Events`, `Communication`, `Assessments` (for Years 12 and 13: `Events`, `Communication`, `Assessments A level`, `Assessments IB`), then a mirrored `Week1/2`, `Day`, `Date`, `Month`.
- Data rows: `Month` is text (`Jul`, `Aug`, `Sept`, `Oct`, `Nov`, `Dec`, `Jan`, `Feb`, `Mar`, `April`, `May`, `June`), `Date` is a number, `Day` is two letters (`Mo` to `Su`), the label is `Week 1`, `Week 2` or empty.
- The builder adds the July noise before the model's rows: rows for 5 to 11 Jul 2026 with the 11th given `Day` `Mo` (it is a Saturday), then 14 Jul, then 29 Jul with no `Day`, then a row with only `Day` `Fr`.
- It merges the `SECONDARY EVENT` cells of 2027-02-15 to 19 into one cell holding "School Holiday".
- It adds a sheet `AssRep 26_27` with header `Month`, `Day`, `Date`, `Week`, `Holidays` and one row per Monday: full month name, `Mon`, day number, `1` or `2`, or an empty `Week` and "Half term" in a holiday week.
- Other sheets with unrelated names are added, so the reader has to pick the right one.

- [ ] **Step 1: Write the failing tests** in `read-calendar.test.ts`

```ts
const imp = await readCalendarWorkbook(await buildSyntheticWorkbook());
test("reads every model row with the same date and label", () => {
  const want = syntheticRows();
  expect(imp.ok).toBe(true);
  for (const w of want) expect(byDate(imp, w.date)).toMatchObject({ weekLabel: w.weekLabel, secondaryEvent: w.secondaryEvent });
});
test("reads the academic year from the title", () => expect(imp.academicYear).toEqual({ start: 2026, end: 2027 }));
test("builds dates from month and day, with the year from the title", () => {
  expect(byDate(imp, "2026-12-22")).toBeDefined();
  expect(byDate(imp, "2027-01-08")).toBeDefined();
});
test("reads year-group cells into the right year", () => {
  expect(byDate(imp, "2027-01-11")?.byYear[13]?.events).toBe("Mock exams");
  expect(byDate(imp, "2026-12-02")?.byYear[12]?.events).toBe("Geography trip");
  expect(byDate(imp, "2026-12-02")?.byYear[11]?.events).toBeNull();
});
test("reports the stray x and does not treat it as a label", () => {
  expect(byDate(imp, "2026-10-31")).toMatchObject({ rawLabel: "x", weekLabel: null });
  expect(findings("unknown-label")).toEqual([expect.objectContaining({ date: "2026-10-31", severity: "warning" })]);
});
test("reports the wrong weekday and trusts the date", () =>
  expect(findings("weekday-mismatch")).toEqual([expect.objectContaining({ date: "2026-07-11" })]));
test("reports each break in the run of dates", () => {
  expect(findings("date-gap")).toHaveLength(3);
  expect(findings("unparseable-row")).toHaveLength(1);
});
test("reports the merged range and applies its value to each row it spans", () => {
  expect(findings("merged-cells")).toHaveLength(1);
  expect(byDate(imp, "2027-02-17")?.secondaryEvent).toBe("School Holiday");
});
test("a renamed header stops the import and names the header", async () => {
  const bad = await readCalendarWorkbook(await buildSyntheticWorkbook({ renameHeader: { from: "Week1/2", to: "Cycle" } }));
  expect(bad.ok).toBe(false);
  expect(bad.rows).toEqual([]);
  expect(bad.findings).toContainEqual(expect.objectContaining({ kind: "missing-header", severity: "error", message: expect.stringContaining("Week1/2") }));
});
test("a moved column is still found by its header", async () => {
  const moved = await readCalendarWorkbook(await buildSyntheticWorkbook({ insertBlankColumnAt: 3 }));
  expect(moved.ok).toBe(true);
  expect(byDate(moved, "2027-02-22")?.weekLabel).toBe("W1");
});
test("a disagreement with the AssRep tab is a warning", async () => {
  const x = await readCalendarWorkbook(await buildSyntheticWorkbook({ assRepMismatchOn: "2026-11-09" }));
  expect(x.findings).toContainEqual(expect.objectContaining({ kind: "assrep-mismatch", date: "2026-11-09", severity: "warning" }));
});
test("the same bytes give the same row hashes; a changed cell changes one hash", async () => { /* compare two imports */ });
test("a workbook with no calendar sheet stops with missing-sheet", async () => { /* workbook with one unrelated sheet */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL, `readCalendarWorkbook` is not defined.

- [ ] **Step 3: Implement** `buildSyntheticWorkbook` and `readCalendarWorkbook` with exceljs. Rules:
  - The calendar sheet is the one whose name matches `/^Calendar \d{4}-\d{2}$/`. The header row is the first row that contains `Month`, `Date`, `Day` and `Week1/2`; columns are located by header text, using the first occurrence of each. A missing required header is an error and no rows are returned.
  - Year blocks: each `Events` header starts a block. Blocks are matched, left to right, to the year names in the row above the header. If the counts differ, that is a `year-block-mismatch` error.
  - Dates: month token by its first three letters, case-insensitive; July to December take the start year, January to June the end year. A row without a usable month and day is `unparseable-row`. A row that is not the previous row's date plus one is a `date-gap`, reported and kept.
  - Label: `Week 1` gives `W1`, `Week 2` gives `W2`, empty gives null, anything else is `unknown-label` with `weekLabel` null. A valid label on a Saturday or Sunday is `label-on-weekend`.
  - `checkLabels` findings on the result are added as `label-issue` warnings.
  - Cell text is trimmed; empty text is null. `hash` is the first 16 hex characters of the SHA-256 of the row's normalised values.
  - Severity: `missing-header`, `missing-sheet` and `year-block-mismatch` are errors. Findings dated outside every labelled day's range are `info`. The rest are warnings.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Write the golden test** in `read-calendar.golden.test.ts`. It runs only on Gemma's Mac.

```ts
describe.skipIf(!resourcesAvailable())("the school's real calendar", () => {
  test("label counts", () => { expect(count("W1")).toBe(91); expect(count("W2")).toBe(94); });
  test("the dates that break a simple alternation", () => {
    expect(label("2027-02-12")).toBe("W2"); expect(label("2027-02-22")).toBe("W1");
    expect(label("2026-12-21")).toBe("W2"); expect(label("2026-12-22")).toBe("W2");
    expect(label("2027-01-07")).toBeNull(); expect(label("2027-01-08")).toBe("W1");
  });
  test("known oddities are reported, and nothing else is", () => {
    expect(findings("unknown-label").map(f => f.date)).toEqual(["2026-10-31"]);
    expect(findings("weekday-mismatch").map(f => f.date)).toEqual(["2026-07-11"]);
    expect(findings("date-gap").length + findings("unparseable-row").length).toBe(4);
    expect(findings("merged-cells")).toEqual([]);
    expect(imp.findings.filter(f => f.severity === "error")).toEqual([]);
  });
  test("the labels alternate", () => expect(findings("label-issue")).toEqual([]));
});
```

Run `pnpm test packages/importers/src/calendar/read-calendar.golden.test.ts`. Expected: PASS on this Mac. If "the labels alternate" fails, stop and report the finding: it is either a bug or a real oddity Gemma should see. Do not change the expectation to make it pass.

- [ ] **Step 6: Finish line and commit.** `feat(importers): read the school calendar by header, with an import report`

---

### Task 1.5: Report deadlines, parents' evenings and reminders

**Files:**
- Create: `packages/importers/src/loose-date.ts`, `loose-date.test.ts`, `reports/read-reports.ts`, `reports/read-reports.test.ts`
- Create: `packages/domain/src/reminders.ts`, `reminders.test.ts`, `reminders.steps.test.ts`
- Create: `features/15-report-reminder.feature`
- Modify: `fixtures/src/synthetic-calendar.ts` (add the two sheets)

**Interfaces:**
- Produces:

```ts
// importers
export type LooseDateIssue = "weekday-mismatch" | "year-outside-academic-year" | "no-year" | "unparseable";
export interface LooseDate { date: IsoDate | null; issues: LooseDateIssue[]; raw: string }
export function parseLooseDate(text: string, academicYear: { start: number; end: number }): LooseDate;
export interface ImportedReportWindow { yearGroup: YearGroup; programme: "A level" | "IB" | null; name: string; columns: string | null; dataDeadline: LooseDate; hodReview: LooseDate; sentHome: LooseDate }
export interface ImportedParentsEvening { yearGroup: YearGroup | null; label: string; term: 1 | 2 | 3; date: LooseDate }
export function readReportDeadlines(data: Uint8Array, academicYear: { start: number; end: number }): Promise<ImportedReportWindow[]>;
export function readParentsEvenings(data: Uint8Array, academicYear: { start: number; end: number }): Promise<ImportedParentsEvening[]>;

// domain
export interface ReportWindow { id: string; yearGroup: YearGroup; programme: "A level" | "IB" | null; name: string; dataDeadline: IsoDate | null; hodReview: IsoDate | null; sentHome: IsoDate | null }
export interface ParentsEvening { id: string; yearGroup: YearGroup | null; label: string; date: IsoDate | null }
export interface Reminder { kind: "report-data-deadline" | "parents-evening"; date: IsoDate; daysLeft: number; label: string; groupIds: GroupId[] }
export function reminders(input: { today: IsoDate; windows: readonly ReportWindow[]; evenings: readonly ParentsEvening[]; groups: readonly Group[]; horizonDays: number }): Reminder[];
```

**The two sheets' layout** (checked on 24 Nov 2026):

- `Report deadlines`: columns are year or programme, report name, SIMS columns, data deadline, HoD review, sent home, explanation. Blocks are separated by empty rows. A block's first row has the year (`Year 11`, sometimes with a trailing space) in the first column. For Years 12 and 13 the block's second row has `A level` or `IB` in the first column, and that programme applies to the whole block. Dates are free text.
- `Parents eves`: a header row `Term 1`, `Term 2`, `Term 3`, then one row per year (`Year 7` to `Year 13`, or `Other`) with cells such as `Parent Meeting: Nov 12`.

Synthetic content to add: Year 11 `Report 2: Long` with "Monday 30th November 2026", "Friday 4th December 2026", "Thursday 11th December 2026"; a Year 12 block marked `IB` and one marked `A level`, each with one report dated "Wednesday 10th March 2027"; a Year 7 report; and parents' evenings `Parent Meeting: Nov 26` for Year 13 and `Parent Meeting: Oct 29` for Year 11.

- [ ] **Step 1: Write the feature file** for scenario 15, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
// loose-date.test.ts, with ay = { start: 2026, end: 2027 }. These strings are the forms found in the school's file.
test.each([
  ["Monday 30th November 2026", "2026-11-30", []],
  ["Tuesday, April 6th 2027", "2027-04-06", []],
  ["Thursday June 10th 2027", "2027-06-10", []],
  ["Friday, June 25th June 2027", "2027-06-25", []],
  ["Monday  26th April 2027", "2027-04-26", []],
  ["Thursday 11th December 2026", "2026-12-11", ["weekday-mismatch"]],
  ["Thursday 4th February GCSE Mock report", "2027-02-04", ["no-year"]],
  ["Parent Meeting: Nov 12", "2026-11-12", ["no-year"]],
  ["Mop Up Parent Meeting: June 24", "2027-06-24", ["no-year"]],
  ["KS5 Curric Open eve (Year 11)  Nov 10", "2026-11-10", ["no-year"]],
  ["Thursday 17th December 2025", null, ["year-outside-academic-year"]],
  ["to be confirmed", null, ["unparseable"]],
])("parseLooseDate(%s)", (text, date, issues) => expect(parseLooseDate(text, ay)).toMatchObject({ date, issues, raw: text }));

// read-reports.test.ts
test("a Year 12 block takes its programme from its second row", () =>
  expect(windows.filter(w => w.yearGroup === 12).map(w => w.programme).sort()).toEqual(["A level", "IB"]));
test("Year 11 has no programme", () => expect(y11.programme).toBeNull());
test("the Year 11 long report's data deadline is 30 Nov 2026", () => expect(y11.dataDeadline.date).toBe("2026-11-30"));
test("a wrong weekday is kept as an issue, not fixed silently", () => expect(y11.sentHome.issues).toEqual(["weekday-mismatch"]));
test("parents' evenings take their year from the term's months", () => expect(eveningFor(13).date.date).toBe("2026-11-26"));

// reminders.test.ts
test("a deadline ten days ahead is shown with the days left, for her group in that year", () =>
  expect(reminders({ today: "2026-11-20", windows: [y11Window], evenings: [], groups: SEED_GROUPS, horizonDays: 14 }))
    .toEqual([{ kind: "report-data-deadline", date: "2026-11-30", daysLeft: 10, label: "Year 11 Report 2: Long: data deadline", groupIds: ["11D"] }]));
test("a deadline for a year she does not teach is not shown", () => expect(remindersFor(y7Window)).toEqual([]));
test("a Year 12 IB deadline is for IB S and IB H; a Year 12 A level deadline is for nobody", () => {
  expect(remindersFor(y12Ib)[0]?.groupIds).toEqual(["IB H", "IB S"]);
  expect(remindersFor(y12ALevel)).toEqual([]);
});
test("past deadlines and those beyond the horizon are not shown; today's is shown with 0", () => { /* -1, 0, 14, 15 days */ });
test("a deadline with no date is never shown", () => expect(remindersFor({ ...y11Window, dataDeadline: null })).toEqual([]));
test("reminders are sorted by date, then label", () => { /* two windows and an evening */ });
```

- [ ] **Step 3: Run them.** Expected: FAIL, nothing is exported yet.

- [ ] **Step 4: Implement.** Rules:
  - `parseLooseDate` looks for a day number beside a month name, in either order, with an optional ordinal suffix, and ignores every other number in the text. A four-digit year is used when present; if it is outside the academic year the date is null. With no year, July to December take the start year and January to June the end year, and `no-year` is recorded. A weekday name in the text that disagrees with the date records `weekday-mismatch` and keeps the date.
  - `reminders`: a report window belongs to a group when the year matches and the window's programme is null or equals the group's. `groupIds` are sorted. A window with no matching group gives no reminder. Parents' evenings follow the same year rule; an evening with `yearGroup` null is not shown.

- [ ] **Step 5: Run again.** Expected: PASS, including scenario 15.

- [ ] **Step 6: Finish line and commit.** `feat(planner): report deadlines, parents' evenings and reminders`

---

### Task 1.6: API foundation: configuration, database, backups, today

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`
- Create: `apps/api/src/config.ts`, `today.ts`, `app.ts`, `main.ts`, and their tests
- Create: `apps/api/src/db/connection.ts`, `migrate.ts`, `backup.ts`, `schema.ts`, `migrations/0001_calendar_timetable.sql`, and their tests

**Interfaces:**
- Produces:

```ts
export interface Config { dataDir: string; resourcesDir: string; port: number; host: "127.0.0.1"; ai: "claude" | "fake" | "off"; fixedToday: IsoDate | null; timeZone: string }
export function loadConfig(env: Record<string, string | undefined>): Config;
export function localIsoDate(now: Date, timeZone: string): IsoDate;
export function openDatabase(file: string): Database;                      // ":memory:" in tests
export function migrate(db: Database, opts: { migrationsDir: string; beforeMigrating: () => void }): { applied: string[] };
export function backupDatabase(db: Database, dataDir: string, reason: "pre-migration" | "daily", now: Date): Promise<string>;
export function pruneBackups(dataDir: string, keep: number): string[];      // returns the files removed
export function describeStartupError(err: unknown, dataDir: string): string;
export interface AppDeps { config: Config; db: Database; now: () => Date }
export function createApp(deps: AppDeps): OpenAPIHono;
export type AppType = ReturnType<typeof createApp>;
```

Routes: `GET /api/health` returns `{ ok: true }`. `GET /api/config` returns `{ today, timeZone, ai: { mode, available: boolean, reason: string | null } }`; until Task 2.9, `available` is false with reason "not built yet" unless the mode is `off`. `GET /openapi.json`. Errors are JSON: `{ error: { code: string, message: string } }`.

Migration `0001` creates: `settings`, `calendar_imports`, `calendar_rows` (keyed by date), `terms`, `groups`, `timetable_versions`, `report_windows`, `parents_evenings`. Column names are the builder's; JSON columns hold `byYear`, `entries`, `duties` and findings.

- [ ] **Step 1: Write the failing tests**

```ts
test("local date just after midnight in Madrid is the new day", () => {
  expect(localIsoDate(new Date("2026-11-23T23:13:00Z"), "Europe/Madrid")).toBe("2026-11-24");
  expect(localIsoDate(new Date("2026-11-23T22:30:00Z"), "Europe/Madrid")).toBe("2026-11-23");
});
test("the host is always loopback", () => expect(loadConfig({ HOST: "0.0.0.0", PLANNER_HOST: "0.0.0.0" }).host).toBe("127.0.0.1"));
test("defaults", () => expect(loadConfig({})).toMatchObject({ port: 4319, ai: "claude", fixedToday: null }));
test("an invalid PLANNER_FIXED_TODAY is refused", () => expect(() => loadConfig({ PLANNER_FIXED_TODAY: "tomorrow" })).toThrow());
test("migrating an empty database creates the tables and records the version", () => { /* applied = ["0001_calendar_timetable"] */ });
test("migrating twice applies nothing the second time", () => expect(second.applied).toEqual([]));
test("an existing database is backed up before a new migration runs", () => { /* beforeMigrating called once, before the SQL; not called on an empty database */ });
test("a failing migration leaves the database as it was", () => { /* bad SQL in a temp migrations folder: throws, version table unchanged */ });
test("backup writes a readable copy and prune keeps the newest seven", () => { /* ten backups in a temp folder: three removed, oldest first */ });
test("health", async () => expect(await (await app.request("/api/health")).json()).toEqual({ ok: true }));
test("config reports the fixed today when set, otherwise the local date", async () => { /* fixedToday "2026-11-20"; then now = 2026-11-23T23:13Z */ });
test("an unexpected error is JSON without a stack", async () => { /* a route that throws: status 500, body.error.code "internal", no "at " in the text */ });
test("a corrupt database gives one readable line naming the file and the newest backup", () =>
  expect(describeStartupError(sqliteCorruptError, dataDir)).toMatch(/planner\.sqlite.*backups\//s));
```

- [ ] **Step 2: Run them.** Expected: FAIL, nothing is exported yet.

- [ ] **Step 3: Implement.** Rules:
  - `openDatabase` turns on WAL mode and foreign keys.
  - `migrate` reads `NNNN_name.sql` files in order, runs each in its own transaction, and records it in `schema_migrations`. It calls `beforeMigrating` once, only when at least one migration is pending and the database already has a recorded version.
  - Backups are `backups/planner-YYYYMMDD-HHmmss-<reason>.sqlite`, made with SQLite's own backup so an open database copies safely. `main.ts` makes a `daily` backup when none exists for today's date, then prunes to seven.
  - `main.ts` creates the data folder when missing, opens the database, migrates, and serves with `@hono/node-server` on `127.0.0.1`. On a start-up failure it prints `describeStartupError` and exits with code 1.
  - Nothing reads the clock except through `deps.now`.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Prove the runtime.** Run `PLANNER_DATA_DIR=$(mktemp -d) node apps/api/src/main.ts &` then `curl -s http://127.0.0.1:4319/api/health`. Expected: `{"ok":true}`. Stop the server. If Node refuses to run the TypeScript of a workspace package (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), add `tsx` with `--save-exact`, start with `node --import tsx apps/api/src/main.ts`, and say so in the commit message.

- [ ] **Step 6: Finish line and commit.** `feat(api): configuration, SQLite with migrations and backups, health and config routes`

---

### Task 1.7: ResourceGateway

**Files:**
- Create: `apps/api/src/gateway/allowlist.ts`, `resource-gateway.ts`, `resource-gateway.test.ts`, `allowlist.steps.test.ts`
- Create: `features/14-allowlist.feature`

**Interfaces:**
- Produces:

```ts
export class ResourceDenied extends Error { readonly path: string }
export interface ResourceEntry { name: string; kind: "file" | "dir"; modifiedAt: string; size: number }
export interface ResourceGateway {
  isAllowed(relPath: string): boolean;
  read(relPath: string): Promise<Uint8Array>;                 // throws ResourceDenied
  list(relDir: string): Promise<ResourceEntry[]>;             // only entries that are themselves allowed, or lead to something allowed
  find(pattern: "calendar-workbook" | "timetable-image"): Promise<string[]>;
}
export function createResourceGateway(rootDir: string): ResourceGateway;
```

**The allowlist**, relative to the resources root, matched without regard to letter case. Everything else is denied.

| Pattern | What it is |
|---|---|
| `*Secondary Calendar*.xlsx` at the root | The calendar workbook |
| `timetable.png` at the root | The timetable image |
| `{ial,ibdp,igcse}/Planning/**` | Planning sheets |
| `{ial,ibdp,igcse}/1. Content/**/Planning/**` | Unit planning folders |
| `{ial,ibdp,igcse}/1. Content/**/PP/**` | Chapter PowerPoints |
| `{ial,ibdp,igcse}/1. Content/**/Exam Practice/**` | Per-topic exam practice |
| `ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf` | Specification |
| `ibdp/ibdp Textbook & Guide/Business Management Guide.pdf` | Specification |
| `ibdp/ibdp Textbook & Guide/Business Management Syllabus.pdf` | Specification |
| `igcse/igcse Textbook and Specification/IGCSE spec.pdf` | Specification |

Textbooks in those last three folders are not on the list, so they cannot be read.

- [ ] **Step 1: Write the feature file** for scenario 14, tagged `@engine`.

- [ ] **Step 2: Write the failing tests.** They build a temporary folder tree with invented file names; they never touch `prototypes/resources/`.

```ts
test.each([
  "2026-27 Secondary Calendar ALL STAFF.xlsx", "timetable.png",
  "ial/Planning/Y13 Unit 4 Planning.xlsx",
  "ial/1. Content/Y13 Content/Unit 4 Global Business/PLANNING/notes.docx",
  "ial/1. Content/Y13 Content/Unit 4 Global Business/Content/26 Topic/PP/26 TEACHER.pptx",
  "igcse/1. Content/Y11 Content/Unit 3/30/Exam Practice/q1.docx",
  "ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf",
])("allows %s", (p) => expect(gw.isAllowed(p)).toBe(true));
test.each([
  "ibdp/IA/IA 2026/student1/draft.docx",
  "ibdp/Scanned exams/paper.pdf",
  "ial/1. Content/Y13 Content/Unit 4 Global Business/Unit 4 Assessments/marks.xlsx",
  "ial/ial Specification & Textbook/IAL Business Student Book 1 Edexcel.pdf",
  "ial/Planning/../ial Mocks/mock.pdf",
  "../outside.txt", "/etc/hosts", "calendar_tabs_1.png", "",
])("refuses %s", async (p) => {
  expect(gw.isAllowed(p)).toBe(false);
  await expect(gw.read(p)).rejects.toBeInstanceOf(ResourceDenied);
});
test("a symlink inside an allowed folder that points outside is refused", async () => { /* PP/link -> ../../../secret.txt */ });
test("list hides what is not allowed", async () =>
  expect((await gw.list("ibdp")).map(e => e.name).sort()).toEqual(["1. Content", "Planning", "ibdp Textbook & Guide"]));
test("find returns the calendar workbook, and every match when there are two", async () => { /* one file, then two */ });
test("the denial message does not echo file contents or siblings", async () => { /* message contains the asked path only */ });
// allowlist.steps.test.ts, scenario 14: "a path inside a student-work folder" -> refused
```

- [ ] **Step 3: Run them.** Expected: FAIL, `createResourceGateway` is not defined.

- [ ] **Step 4: Implement.** Normalise the path, refuse absolute paths and any `..` segment, match against the patterns, then resolve the real path and check it is still inside the root and still matches. `read` checks before opening. Nothing else may read from the resources folder: add a test to `fixtures/src/domain-purity.test.ts` asserting that the only non-test source files containing `resourcesDir` or `PLANNER_RESOURCES_DIR` are `apps/api/src/config.ts`, `apps/api/src/main.ts`, files under `apps/api/src/gateway/`, and `packages/importers/src/resources-available.ts` (the golden-test helper).

- [ ] **Step 5: Run again.** Expected: PASS.

- [ ] **Step 6: Finish line and commit.** `feat(api): ResourceGateway with a tested allowlist`

---

### Task 1.8: Import and read routes

**Files:**
- Create: `apps/api/src/repos/ports.ts`, `repos/sqlite/calendar-repo.ts`, `timetable-repo.ts`, `settings-repo.ts`, and tests
- Create: `apps/api/src/usecases/import-calendar.ts`, `first-run.ts`, `today-view.ts`, and tests
- Create: `apps/api/src/routes/calendar.ts`, `timetable.ts`, `slots.ts`, `today.ts`, and `routes.test.ts`
- Create: `scripts/seed-synthetic.ts`
- Modify: `apps/api/src/app.ts`, root `package.json` (script `seed:synthetic`)

**Interfaces:**
- Consumes: `ResourceGateway`, `readCalendarWorkbook`, `readReportDeadlines`, `readParentsEvenings`, the engine functions of Tasks 1.2 to 1.5, `SEED_TIMETABLE`, `SEED_GROUPS`, `fixtures/terms.2026-27.json`.
- Produces: `AppDeps` gains `gateway: ResourceGateway`. Routes, all JSON:

| Route | Returns or does |
|---|---|
| `POST /api/calendar/import` | Finds the workbook through the gateway, reads all three sheets, stores them when `ok`. Returns `{ ok, findings, counts: { W1, W2 }, reportIssues, importedAt }`. With no workbook, or more than one: 422 naming what was found |
| `GET /api/calendar/import` | The latest import's summary, or `null` |
| `GET /api/calendar/days?from&to` | `CalendarDay[]` |
| `GET /api/terms`, `PUT /api/terms` | The three terms. A term whose first day is after its last, or terms that overlap, is refused with 422 |
| `GET /api/timetable` | `{ versions: TimetableVersion[], groups: Group[] }` |
| `PUT /api/timetable/:id` | Replaces a version's entries and duties. `validateTimetable` issues give 422 with the list |
| `POST /api/timetable/versions` | Body `{ validFrom, copyOf }`. Adds a version that applies from a date, for a timetable that changes mid-year. A second version with the same date is refused |
| `GET /api/slots?from&to&groupId` | `Slot[]` |
| `GET /api/fortnights` | `Fortnight[]` |
| `GET /api/audit` | `SlotAudit` |
| `GET /api/today` | `{ date, kind, weekLabel, lessons: { slot, start, end }[], nextTeachingDay: IsoDate \| null, reminders: Reminder[] }` |

Mutating routes go through `requireAccess(resource, action)`, added in Task 1.13; until then they are open.

- [ ] **Step 1: Write the failing tests** against `createApp` with an in-memory database, a fake gateway that serves `buildSyntheticWorkbook()`, and `fixedToday`.

```ts
test("first run seeds the timetable, groups and terms", async () => { /* GET /api/timetable: one version, six groups */ });
test("import stores the rows and returns the counts", async () => { /* POST import: ok true; then GET days for 2027-02-22: W1 pupil */ });
test("importing a workbook with a renamed header stores nothing", async () => { /* 200 with ok false; GET /api/calendar/import still null */ });
test("no workbook gives 422 with a message she can act on", async () => { /* fake gateway find() -> [] */ });
test("two workbooks give 422 listing both names", async () => {});
test("slots for the week of 22 Feb 2027 are Week 1 slots", async () => { /* 17 slots, all W1 */ });
test("today on a teaching day lists that day's lessons with times", async () => {
  // fixedToday 2026-11-19 (Week 1 Thursday): IB S P1 08:45 and P2 09:40, 13 3 P3 11:15 and P4 12:10, 13 5 P6 15:30
});
test("today on a Saturday has no lessons and names the next teaching day", async () => { /* 2026-11-21 -> nextTeachingDay 2026-11-23 */ });
test("today in the winter holiday names the lone Friday", async () => { /* 2026-12-28 -> nextTeachingDay 2027-01-08 */ });
test("today after the last day of the year has no next teaching day", async () => { /* 2027-07-10 -> null, status 200 */ });
test("today before any import says so instead of failing", async () => { /* kind "no-calendar", lessons [] */ });
test("today carries the reminder ten days ahead", async () => { /* fixedToday 2026-11-20: Year 11 data deadline, daysLeft 10 */ });
test("saving a timetable with two groups in one period is refused", async () => { /* 422, body lists the clash; GET still returns the old grid */ });
test("saving terms that overlap is refused", async () => {});
test("the OpenAPI document lists every route above", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL, the routes do not exist.

- [ ] **Step 3: Implement** repositories behind the ports in `repos/ports.ts`, the use cases, and the routes with `@hono/zod-openapi` schemas. `GET /api/today` gains `kind: "no-calendar"` when nothing has been imported. `seed-synthetic.ts` fills a data folder by calling the same use cases with the synthetic workbook, so browser tests and the real app share one code path.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Finish line and commit.** `feat(api): calendar import, timetable, slots, audit and today routes`

---

### Task 1.9: Web shell, theme and the browser-test harness

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/routes.tsx`, `src/api/client.ts`, `src/api/queries.ts`, `src/theme/tokens.css`, `src/theme/group-colours.ts`, `src/theme/contrast.test.ts`, `src/components/AppShell.tsx`, `src/components/ui/*`
- Create: `e2e/package.json`, `playwright.config.ts`, `e2e/support/axe.ts`, `e2e/support/server.ts`, `e2e/steps/shell.steps.ts`, `features/00-shell.feature`
- Modify: `apps/api/src/app.ts` (serve `apps/web/dist` with a fallback to `index.html`), root `package.json` (script `e2e`), `.github/workflows/ci.yml` (append `pnpm build` and `pnpm e2e`)

**Interfaces:**
- Consumes: `AppType` for the typed client (`hc<AppType>`), `GET /api/config`.
- Produces: `<AppShell>` with a navigation landmark and an outlet; routes `/` (Today), `/board`, `/audit`, `/setup`; `useConfig()`; `groupColour(token: string): { bg: string; fg: string }`; `expectNoSeriousViolations(page: Page): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```ts
// contrast.test.ts: every group colour pair and every text token, in both themes
test.each(allColourPairs())("%s has contrast of at least 4.5 to 1", (_name, fg, bg) => expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5));
```

```gherkin
# features/00-shell.feature
@e2e
Feature: The app opens
  Scenario: The shell loads and is accessible
    When I open the app
    Then I see the navigation with "Today", "Board", "Slot audit" and "Setup"
    And the page has no serious accessibility violations
  Scenario: Theme
    When I open the app
    Then the theme is dark
    When I switch to the light theme and reload
    Then the theme is light
  Scenario: The API is not running
    Given the API does not answer
    When I open the app
    Then I see "The planner is not running" and how to start it
```

- [ ] **Step 2: Run them.** `pnpm test apps/web/src/theme/contrast.test.ts` and `pnpm e2e`. Expected: FAIL, nothing exists.

- [ ] **Step 3: Implement.**
  - Tailwind 4 and shadcn/ui, with colours as CSS variables in `tokens.css`. Dark is the default; the choice is kept in `localStorage` and applied before first paint. The six group colours start from the colours on her timetable image and are adjusted until the contrast test passes in both themes.
  - `AppShell`: a skip link, one `<nav>`, one `<main>`, visible focus on everything.
  - TanStack Query for server state. Every screen has a loading state, an error state with the API's message, and an empty state.
  - Playwright: `channel: "chrome"`, one worker, `webServer` that runs `pnpm seed:synthetic` into a temporary folder and starts the API with `PLANNER_AI=fake`, `PLANNER_FIXED_TODAY=2026-11-20` and `PLANNER_TEST_ROUTES=1`. playwright-bdd generates tests from features tagged `@e2e`. `expectNoSeriousViolations` runs axe and fails on `serious` or `critical`.
  - Every scenario starts from the seed. With `PLANNER_TEST_ROUTES=1` the API adds `POST /api/test/reset`, which empties the open database and seeds it again; the harness calls it before each scenario. Add an API test that the route answers 404 when the variable is not set. "The API does not answer" is simulated by blocking `/api/*` in the browser, not by stopping the server.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Finish line and commit.** `feat(web): app shell, theme and browser-test harness with axe`

---

### Task 1.10: Setup screen: calendar import, terms, timetable grid

**Files:**
- Create: `apps/web/src/screens/setup/SetupScreen.tsx`, `CalendarImportCard.tsx`, `ImportReport.tsx`, `TermsCard.tsx`, `TimetableEditor.tsx`
- Create: `features/m1-setup.feature`, `e2e/steps/setup.steps.ts`

**Interfaces:**
- Consumes: `POST /api/calendar/import`, `GET /api/calendar/import`, `GET/PUT /api/terms`, `GET /api/timetable`, `PUT /api/timetable/:id`.
- Produces: the `/setup` screen. Later milestones add sections to it.

What the screen shows:

- **Calendar.** An "Import the school calendar" button, the time of the last import, the Week 1 and Week 2 day counts, and the import report: findings grouped by severity, each with its date and a plain sentence. Errors come first and say that nothing was imported. `info` findings are collapsed under "Outside the school year".
- **Report dates that need her.** Report windows whose date could not be read are listed with the original text and a date field.
- **Terms.** Three rows of two date fields. Saving shows the API's refusal when there is one.
- **Timetable.** Two grids, Week 1 and Week 2, laid out as in spec appendix A: columns Monday to Friday, rows P1 to P6 with their times. Each cell is a control: a group, a duty label, or empty, plus a room. The lessons-per-fortnight totals update as she edits. Save is refused with the API's reasons shown beside the grid. "My timetable changes from a date" copies the grid into a new version starting on the date she gives; a version chooser appears once there are two.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Setup
  Scenario: Importing the calendar shows the report
    When I import the school calendar
    Then I see the Week 1 and Week 2 day counts
    And the report lists the stray "x" on 31 October 2026 as a warning
    And the report says the wrong weekday on 11 July 2026 is outside the school year
  Scenario: Editing the timetable updates the totals
    When I clear 11D from Week 1 Monday period 3
    Then the fortnight total for 11D is 4
    When I save the timetable
    Then the slot audit shows 11D with fewer lessons
  Scenario: A clash is refused
    When I put 13 1 where 13 5 already is and save
    Then I see why the timetable was not saved
    And the timetable is unchanged after a reload
  Scenario: Setup is usable by keyboard and accessible
    Then I can reach every timetable cell with the keyboard
    And the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL, the screen is empty.

- [ ] **Step 3: Implement** the screen. The timetable grid is a `<table>` with row and column headers; each cell's control has an accessible name such as "Week 1, Monday, period 3".

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Finish line and commit.** `feat(web): setup screen with calendar import report and timetable editor`

---

### Task 1.11: Fortnight board, read-only

**Files:**
- Create: `apps/web/src/screens/board/BoardScreen.tsx`, `FortnightGrid.tsx`, `WeekGrid.tsx`, `SlotCell.tsx`, `board-model.ts`, `board-model.test.ts`
- Create: `e2e/steps/board.steps.ts` (steps for `features/01-cycle-from-calendar.feature`), `features/m1-board.feature`

**Interfaces:**
- Consumes: `GET /api/fortnights`, `GET /api/calendar/days`, `GET /api/slots`, `GET /api/timetable`, `GET /api/config`.
- Produces: `/board?w1=YYYY-MM-DD` and:

```ts
// board-model.ts: pure, so it is unit-tested
export interface BoardCell { period: Period; date: IsoDate; kind: "lesson" | "duty" | "empty" | "no-school"; slot: Slot | null; label: string | null; joinsNext: boolean }
export interface BoardWeek { monday: IsoDate | null; label: WeekLabel; days: { date: IsoDate; dayKind: DayKind; text: string | null; cells: BoardCell[] }[]; shortWeek: boolean }
export function boardFor(fortnight: Fortnight, days: CalendarDay[], slots: Slot[], timetable: TimetableVersion): { w1: BoardWeek | null; w2: BoardWeek | null };
export function fortnightContaining(fortnights: Fortnight[], date: IsoDate): Fortnight | null;   // the one holding the date, else the next one
```

What the board shows: Week 1 and Week 2 side by side, each laid out like her timetable with the real date under each weekday. A lesson cell shows the group, in its colour, and the room. Double periods are drawn joined. Duty cells are muted. A day that is not a pupil day is greyed and shows why. A week with one or two pupil days has a "Short week" chip. A thin "Break" divider appears when `breakBefore` is true. Controls: previous fortnight, next fortnight, "This fortnight", and a date field. In M1 a lesson cell shows no lesson content; M2 fills it.

- [ ] **Step 1: Write the failing tests**

```ts
// board-model.test.ts
test("the fortnight of 14 December has a two-day Week 2", () => {
  const b = boardFor({ w1: "2026-12-14", w2: "2026-12-21", breakBefore: false }, days, slots, SEED_TIMETABLE);
  expect(b.w2?.shortWeek).toBe(true);
  expect(b.w2?.days.filter(d => d.dayKind === "pupil").map(d => d.date)).toEqual(["2026-12-21", "2026-12-22"]);
});
test("the lone Friday is a short Week 1 with one lesson", () => { /* w1 2027-01-04: one lesson cell, 13 1 P6 on 2027-01-08 */ });
test("a double is marked as joining the next period", () => { /* 13 3 Thursday P3 joinsNext true, P4 false */ });
test("a duty cell is a duty, not a lesson", () => { /* Week 1 Friday P1: kind duty, label "400" */ });
test("with no Week 1 the left side is null", () => expect(boardFor({ w1: null, w2: "2026-09-07", breakBefore: false }, days, slots, SEED_TIMETABLE).w1).toBeNull());
test("fortnightContaining falls forward from a holiday", () => expect(fortnightContaining(all, "2026-12-28")?.w1).toBe("2027-01-04"));
test("fortnightContaining after the last fortnight is null", () => expect(fortnightContaining(all, "2027-08-01")).toBeNull());
```

```gherkin
# features/m1-board.feature
@e2e
Feature: Fortnight board
  Scenario: The board opens on the current fortnight
    When I open the board
    Then Week 1 starts on 16 November 2026 and Week 2 on 23 November 2026
  Scenario: A short week is marked
    When I go to the fortnight of 14 December 2026
    Then Week 2 shows lessons on Monday and Tuesday only
    And Week 2 is marked "Short week"
  Scenario: The board is accessible
    Then the page has no serious accessibility violations
```

The browser steps for scenario 1 go to 22 February 2027 with the date field and check that the left grid is headed "Week 1" and that 13 1 has three lessons in it.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Each week grid is a `<table>` with headers. A lesson cell's accessible name is, for example, "13 1, Friday 8 January, period 6, room 206".

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Update diagram 04** if a shared piece was added or renamed, using the `architecture-visual-docs` skill.

- [ ] **Step 6: Finish line and commit.** `feat(web): read-only fortnight board in the shape of her timetable`

---

### Task 1.12: Today and slot audit screens

**Files:**
- Create: `apps/web/src/screens/today/TodayScreen.tsx`, `RemindersList.tsx`, `apps/web/src/screens/audit/AuditScreen.tsx`
- Create: `e2e/steps/today.steps.ts` (steps for `features/15-report-reminder.feature`), `features/m1-today-audit.feature`

**Interfaces:**
- Consumes: `GET /api/today`, `GET /api/audit`.
- Produces: `/` and `/audit`.

**Today** shows the date, the week label, today's lessons in period order with start time, group and room, and the reminders with days left ("Year 11 Report 2: Long: data deadline in 10 days"). On a day without lessons it says why and names the next teaching day with a link to the board. Before any import it shows one action: "Import the school calendar". M2 adds the weekly check-in and M3 the "a lesson was lost" shortcut.

**Slot audit** shows a table of lessons per group per teaching block, with the block's dates, and totals for the year. Under it: every day off inside a block with the calendar's text and what each group would have had, and every cancelled lesson with its reason. A sentence at the top says what to check: "Compare these counts with your own timetable. If one is wrong, a date is wrong."

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Today and slot audit
  Scenario: Today on a teaching day
    When I open the app
    Then I see "Friday 20 November 2026" and "Week 1"
    And I see the lesson "13 1" at 15:30 in room 206
  Scenario: The slot audit explains a day off
    When I open the slot audit
    Then I see lessons per group for each teaching block
    And I see that Monday 12 October 2026 was "Official Holiday" and what each group missed
  Scenario: Both screens are accessible
    Then the page has no serious accessibility violations
```

The steps for scenario 15 open the app and check for the Year 11 data-deadline reminder with "10 days".

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement** both screens.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Finish line and commit.** `feat(web): Today with reminders, and the slot audit`

---

### Task 1.13: Permission matrix

**Files:**
- Create: `packages/domain/src/permissions.ts`, `permissions.test.ts`
- Create: `apps/api/src/routes/require-access.ts`, `require-access.test.ts`
- Modify: the mutating routes of Task 1.8

**Interfaces:**
- Produces:

```ts
export type Role = "teacher" | "student" | "parent" | "admin" | "head-of-department";
export type Resource = "scheme-of-work" | "lesson-plans" | "chapter-powerpoints" | "independent-tasks" | "assessment-calendar" | "report-calendar" | "exam-practice-questions" | "mark-schemes" | "parity-and-coverage" | "cover-lessons" | "accounts-and-roles";
export type Access = "edit" | "view" | "none";
export function accessFor(role: Role, resource: Resource): Access;
export function can(role: Role, resource: Resource, action: "view" | "edit", context?: { ownGroup: boolean }): boolean;
export const TEACHER_PRINCIPAL: { role: "teacher" };
// api
export function requireAccess(resource: Resource, action: "view" | "edit"): MiddlewareHandler;
```

- [ ] **Step 1: Write the failing tests.** One table-driven test holds all 55 cells of the table in spec section 13, written out as `[role, resource, access]`, and asserts `accessFor` for each. Also:

```ts
test("a student sees independent tasks for their own group only", () => {
  expect(can("student", "independent-tasks", "view", { ownGroup: true })).toBe(true);
  expect(can("student", "independent-tasks", "view", { ownGroup: false })).toBe(false);
});
test("a head of department never sees cover lessons", () => expect(can("head-of-department", "cover-lessons", "view")).toBe(false));
test("edit implies view", () => expect(can("teacher", "scheme-of-work", "view")).toBe(true));
test("a parent can do nothing", () => { /* every resource, both actions: false */ });
test("a route guarded for edit answers 403 for a role without it", async () => { /* app built with a student principal */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement** the matrix as one constant table, and guard `PUT /api/terms` and `PUT /api/timetable/:id` (resource `lesson-plans`, action `edit`) and `POST /api/calendar/import` (resource `report-calendar`, action `edit`). `AppDeps` gains `principal`, which `main.ts` sets to `TEACHER_PRINCIPAL`.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Finish line and commit.** `feat(domain): role and permission matrix with a fixed teacher principal`

---

### Task 1.14: One-command start, the run-and-verify skill, and the M1 gate

**Files:**
- Create: `scripts/start.ts`, `scripts/start.test.ts`
- Create: `.claude/skills/planner-run-and-verify/SKILL.md`
- Modify: root `package.json` (script `start`), `README.md`, `CLAUDE.md` (both in `prototypes/ai_teacher_planner/`), `docs/design/ai-teacher-planner/src/09-tech-stack.d2` and its SVG, `docs/design/ai-teacher-planner/README.md`
- Create: `docs/design/ai-teacher-planner/screens/m1-setup.png`, `m1-board.png`, `m1-today.png`, `m1-audit.png`

**Interfaces:**
- Produces: `pnpm start`; and `needsBuild(webDir: string): boolean`, true when `dist/index.html` is missing or older than any file under `src/`.

- [ ] **Step 1: Write the failing test** for `needsBuild` with a temporary folder: no `dist` gives true; a fresh `dist` gives false; touching a source file gives true.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement `scripts/start.ts`.** Build the web app when `needsBuild`, start the API, wait for `/api/health`, open `http://127.0.0.1:4319` in the default browser, and print one line saying how to stop it. If the port is taken by a running planner, open the browser and exit; if taken by something else, say so.

- [ ] **Step 4: Run again, then try it for real.** `pnpm start` with the real resources folder. Import the calendar in Setup. Expected: 91 Week 1 days and 94 Week 2 days, the same findings as the golden test, and a slot audit whose fortnight of 16 November shows 5, 4, 6, 6, 6, 6.

- [ ] **Step 5: Write the `planner-run-and-verify` skill** by the writing-skills loop. Baseline: ask a fresh agent to "start the planner and check the board works" with no skill, and note what it gets wrong (for example starting a dev server, skipping axe, using the real data folder for tests). Then write the skill to fix those: the commands in the index, the fixed-today and fake-AI settings for tests, the `claude-in-chrome` pass, and where screenshots go. Run the same request with the skill and confirm the difference.

- [ ] **Step 6: The gate.** Follow "Milestone gate" in the index. Screenshots use the synthetic data folder, never the real one. Update diagram 09 with the libraries pinned in this milestone, and both `CLAUDE.md` files: the status line, and the commands that now exist. Add a short "How to start it" section for Gemma to `README.md`. Tick M1 in the PR description.

- [ ] **Step 7: Ask Gemma to click through** Setup, the board and Today on her real calendar, and note in the PR what she said.

- [ ] **Step 8: Commit and tag.** `feat(planner): one-command start and M1 gate`, then `git tag planner-m1`.
