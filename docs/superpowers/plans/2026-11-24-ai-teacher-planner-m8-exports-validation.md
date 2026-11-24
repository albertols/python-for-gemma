# AI Teacher Planner M8: Exports, Offline, First Run and Full Validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything Gemma plans can leave the app in the formats she lives in: Excel, Word, PowerPoint and text for Teams. The app works with no internet except for AI, a first-time user is planning within ten minutes, every acceptance scenario has been walked through in Chrome, and the pull request is ready for review.

**Architecture:** Exporters are pure functions from a plain data model to file bytes, one file per format, each behind its library. The API assembles the data and applies the one rule every export shares: unreviewed AI items are left out with a warning, reviewed ones are named. Nothing is ever written into the resources folder.

**Tech Stack:** As the index. New and not proven by spike: `docx` and `pptxgenjs` as runtime dependencies of `packages/exporters`.

**Spec:** sections 12, 15, 16, 18 and 19 of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md).

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Start with the check described under "Before starting a milestone" in the index.

Two more for this milestone:

- **Every export states its AI content:** which items were drafted by AI and when she reviewed them, using `aiNote` from M2. Unreviewed items are left out and the warning says how many.
- **Exports cite, they do not republish.** A file that shows specification codes and titles names the board, the document and the date the pack was locked. No export contains specification text beyond a point's code and title.

## Review Focus

1. **Files that a library can read back but Office cannot open.** Each format is opened in the real application at the gate, on her Mac. Task 8.7.
2. **Titles with an ampersand, an accent, a slash or 200 characters.** The file opens, the text is intact, and the file name is safe. Tasks 8.1 to 8.3.
3. **Exporting while the plan is out of date or has stranded lessons.** The file says so on its first line. Task 8.4.
4. **Restoring a backup.** A restore brings back the plan exactly, and keeps a copy of what it replaced. Task 8.6.
5. **Any request to another host from the interface:** a web font, an icon set, a script from a CDN. There must be none. Task 8.5.

---

### Task 8.1: Excel: the scheme with dates, and the coverage checklist

**Files:**
- Create: `packages/exporters/src/xlsx/scheme.ts`, `scheme.test.ts`, `coverage.ts`, `coverage.test.ts`, `src/file-name.ts`, `file-name.test.ts`, `src/citation.ts`, `citation.test.ts`
- Modify: `apps/api/src/routes/export.ts`, `export.test.ts`

**Interfaces:**
- Consumes: `itemSpans`, `SpecCoverage`, `aiNote`, `CurriculumPack`.
- Produces:

```ts
export interface SchemeExport { courseTitle: string; groups: GroupId[]; rows: { title: string; kind: ItemKind; lessons: number; note: string | null; specCodes: string[]; spans: Record<GroupId, { from: IsoDate | null; to: IsoDate | null; declared: boolean }>; provenance: Provenance }[]; citation: string; generatedOn: IsoDate; planStatus: string | null }
export function exportSchemeXlsx(data: SchemeExport): Promise<{ file: Uint8Array; warning: string | null }>;
export interface CoverageExport { courseTitle: string; groupId: GroupId; rows: SpecCoverage[]; assessmentTitles: Record<string, string>; citation: string; generatedOn: IsoDate }
export function exportCoverageXlsx(data: CoverageExport): Promise<{ file: Uint8Array; warning: string | null }>;
export function exportFileName(kind: string, subject: string, date: IsoDate, ext: "xlsx" | "docx" | "pptx" | "txt"): string;
export function packCitation(pack: CurriculumPack): string;
```

Routes: `GET /api/export/scheme.xlsx?courseId=` and `GET /api/export/coverage.xlsx?courseId=&groupId=`.

- [ ] **Step 1: Write the failing tests.** Each reads the bytes back with exceljs.

```ts
test("the scheme sheet has a row per item and two date columns per group", async () => {
  // header: Topic, Kind, Lessons, Specification, then "13 1 from", "13 1 to", "13 3 from", ...
  expect(cell("B3")).toBe("teaching");
});
test("a declared item shows 'declared' instead of dates", async () => {});
test("the coverage sheet has a row per specification point with its state in words and its evidence", async () => {});
test("a flagged point reads 'Taught, never assessed'", async () => {});
test("the last rows carry the citation and the AI statement", async () => expect(lastRows).toContain("Specification codes and titles from: Synthetic Board, Synthetic Business (pack locked 2026-11-10)."));
test("a status line is the first row when the plan is out of date", async () => expect(cell("A1")).toBe("This plan was out of date on 2026-11-20: 2 lessons need a decision."));
test("a title with an ampersand, an accent and 200 characters survives", async () => {});
test("file names are lower case, with spaces and unsafe characters replaced", () =>
  expect(exportFileName("scheme", "IAL Business: Unit 4 / Global", "2026-11-20", "xlsx")).toBe("planner-scheme-ial-business-unit-4-global-2026-11-20.xlsx"));
test("the citation names the board, the subject and the lock date, and nothing else from the pack", () => {});
test("an export of a course with an unlocked pack is refused with a sentence", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(exporters): scheme of work and coverage as Excel`

---

### Task 8.2: Word: the weekly plan and the cover-lesson sheet

**Files:**
- Create: `packages/exporters/src/docx/weekly-plan.ts`, `weekly-plan.test.ts`, `cover-sheet.ts`, `cover-sheet.test.ts`
- Modify: `apps/api/src/routes/export.ts`, `export.test.ts`

**Interfaces:**
- Consumes: `ExportLesson`, `CoverLesson`, `aiNote`.
- Produces:

```ts
export interface WeeklyPlanExport { weekOf: IsoDate; weekLabel: WeekLabel; days: { date: IsoDate; lessons: (ExportLesson & { specCodes: string[]; assessment: string | null; note: string | null })[] }[]; reminders: { label: string; date: IsoDate }[]; generatedOn: IsoDate; planStatus: string | null }
export function exportWeeklyPlanDocx(data: WeeklyPlanExport): Promise<{ file: Uint8Array; warning: string | null }>;
export interface CoverSheetExport { groupId: GroupId; date: IsoDate; periods: Period[]; room: string | null; lesson: CoverLesson; provenance: Provenance; generatedOn: IsoDate }
export function exportCoverSheetDocx(data: CoverSheetExport): Promise<{ file: Uint8Array; warning: string | null }>;
```

Routes: `GET /api/export/week.docx?weekOf=` and `GET /api/export/cover-sheet.docx?groupId=&slotKey=`.

- [ ] **Step 1: Write the failing tests.** Each reads the text back with mammoth.

```ts
test("the weekly plan has a heading per day and a line per lesson with time, group, room and title", async () =>
  expect(text).toContain("Monday 23 November 2026"));
test("days with no lessons are left out; a day off inside the week says why", async () => {});
test("the week's reminders are listed at the end", async () => {});
test("the cover sheet has the group, date, periods and room at the top, then objectives, instructions for the cover teacher, timed tasks and success criteria", async () => {});
test("a cover lesson she has not reviewed cannot be exported", async () => { /* 409 with "Review this cover lesson before exporting it." */ });
test("the cover sheet's last line says it was drafted by AI and reviewed, with the date", async () => {});
test("the cover sheet contains no student names: it has a blank line for the cover teacher to note absentees", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with the `docx` library behind these two files. Use real headings and lists so the file is navigable with a screen reader.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(exporters): weekly plan and cover-lesson sheet as Word`

---

### Task 8.3: PowerPoint: accepted refresher slides

**Files:**
- Create: `packages/exporters/src/pptx/refresher-slides.ts`, `refresher-slides.test.ts`
- Modify: `apps/api/src/routes/export.ts`, `export.test.ts`, `apps/web/src/screens/resources/ChapterResources.tsx`

**Interfaces:**
- Consumes: `SlideSuggestion`, `Provenance`, `extractDeck` (in tests), `aiNote`.
- Produces:

```ts
export interface RefresherExport { chapterTitle: string; originalFileName: string; slides: { suggestion: SlideSuggestion; afterSlideTitle: string | null; review: ReviewState; reviewedOn: IsoDate }[]; generatedOn: IsoDate }
export function exportRefresherPptx(data: RefresherExport): Promise<{ file: Uint8Array; warning: string | null }>;
```

Route: `GET /api/export/refresher.pptx?courseId=&itemId=`. The file is sent to the browser as a download. Nothing is written into the resources folder, and the original PowerPoint is not opened for writing anywhere in the codebase.

The deck's first slide lists where each slide goes ("After slide 4, Shifts and movements: Tariffs on steel"). Then one slide per accepted or edited suggestion: the headline as the title and the bullets as text. Each slide's notes hold "Insert after slide N", why, the sources as titles and links, and "Drafted by AI, reviewed on" with the date.

- [ ] **Step 1: Write the failing tests.** Each reads the file back with `extractDeck`.

```ts
test("one index slide and one slide per accepted suggestion, in insertion order", async () => expect(deck.slides.map(s => s.title)).toEqual(["Where these slides go", "Tariffs on steel", "A retailer leaves a market"]));
test("rejected and unreviewed suggestions are not in the file, and the warning counts the unreviewed ones", async () => {});
test("every content slide has notes", async () => expect(deck.slides.slice(1).every(s => s.hasNotes)).toBe(true));
test("the notes name each source with its link, and mark one that could not be opened", async () => { /* read the notes XML directly in this test */ });
test("with nothing accepted the export is refused with a sentence", async () => {});
test("the gateway has no way to write, so the original cannot be changed", () => expect(Object.keys(createResourceGateway(tmp))).not.toContain("write"));
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with pptxgenjs behind this one file. Plain layout, dark text on a light background, so the slides paste cleanly into her own template.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(exporters): accepted refresher slides as a separate PowerPoint with sources in the notes`

---

### Task 8.4: Teams text, and one export menu everywhere

**Files:**
- Create: `packages/exporters/src/teams/task-post.ts`, `task-post.test.ts`, `apps/web/src/components/ExportMenu.tsx`, `apps/api/src/usecases/plan-status.ts`, and tests
- Create: `features/m8-exports.feature`, `e2e/steps/exports.steps.ts`
- Modify: `packages/exporters/src/teams/post.ts`, every screen with something to export, `apps/api/src/routes/export.ts`

**Interfaces:**
- Consumes: every exporter, `IndependentTask`, `strandedPlacements`.
- Produces:

```ts
export function teamsTaskText(args: { groupId: GroupId; task: IndependentTask; dueText: string | null }): { text: string; warning: string | null };
export function planStatusLine(args: { upToDate: boolean; stranded: number; today: IsoDate }): string | null;
// "This plan was out of date on 2026-11-20: 2 lessons need a decision." or null
```

`<ExportMenu items={...} />` appears on the board (fortnight as Excel, week as Word, Teams post per group), the scheme (Excel), coverage (Excel), a chapter's resources (PowerPoint), a cover lesson (Word) and an independent task (Teams text). Choosing an item shows any warning first, with "Export anyway" and "Cancel", then downloads the file or, for text, shows it with a "Copy" button.

- [ ] **Step 1: Write the failing tests**

```ts
test("a task post is plain text: title, instructions as numbered lines, the PBLT question, and how long it should take", () => {});
test("a task post never includes the note on why it is hard to hand to AI: that is for her", () => expect(text).not.toContain(task.whyHardToHandToAi));
test("an unreviewed task cannot be exported", async () => {});
test("the status line is null for an up-to-date plan with nothing stranded", () => expect(planStatusLine({ upToDate: true, stranded: 0, today: "2026-11-20" })).toBeNull());
test("every export route puts the status line first when there is one", async () => { /* fortnight, week, scheme: all three */ });
```

```gherkin
@e2e
Feature: Exports
  Scenario: The fortnight downloads as Excel
    When I export the fortnight as Excel
    Then a file named like "planner-fortnight-2026-11-16.xlsx" is downloaded
  Scenario: Teams text can be copied
    When I export this week's Teams post for 13 1
    Then I see the text and a "Copy" button
  Scenario: A warning is shown before the file
    Given one AI suggestion has not been reviewed
    When I export the scheme
    Then I see "1 AI suggestion was left out because you have not reviewed it." and can cancel
  Scenario: The export menu works by keyboard and is accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): Teams text for tasks and one export menu on every screen`

---

### Task 8.5: Offline, and AI unavailable

**Files:**
- Create: `apps/web/src/offline.test.ts`, `features/m8-offline.feature`, `e2e/steps/offline.steps.ts`, `e2e/support/no-external.ts`
- Modify: `apps/web/index.html`, `tokens.css`, any component that loads a remote asset, `apps/web/src/components/JobChip.tsx`

**Interfaces:**
- Produces: `trackExternalRequests(page): { hosts(): string[] }`, a test helper that records every request to a host other than `127.0.0.1` and `localhost`.

- [ ] **Step 1: Write the failing tests**

```ts
// offline.test.ts, on the built app
test("the built app references no other host", () => {
  for (const file of builtFiles("apps/web/dist")) expect(read(file), file).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.[a-z]{2,}/i);
});
```

An allowance for one known string is acceptable only when it is text she reads (a documentation link in the legend, for example) and not something the page loads; list each such string in the test with its reason.

```gherkin
@e2e
Feature: Works without the internet
  Scenario Outline: A screen makes no request to another host
    Given requests to other hosts are blocked and recorded
    When I open <screen>
    Then the screen shows its content
    And no request to another host was attempted
    Examples:
      | screen      |
      | Today       |
      | Board       |
      | Scheme      |
      | Parity      |
      | Slot audit  |
      | HL helper   |
      | Coverage    |
      | Assessments |
      | Resources   |
      | Setup       |
  Scenario: AI is unavailable
    Given Claude is signed out
    Then the header says why AI is unavailable
    And every AI button is unavailable with the same reason
    And I can still move a lesson and accept the change
  Scenario: A job fails halfway
    Given the AI provider fails with a timeout
    When I ask for lesson-count suggestions
    Then I see "Claude took too long and was stopped. Nothing was saved."
    And the scheme is unchanged
```

- [ ] **Step 2: Run them.** Expected: FAIL if any asset is remote; otherwise the offline scenarios pass and the AI ones may fail.
- [ ] **Step 3: Implement.** Fonts are system fonts or files in the build. Icons are in the build.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(web): no external requests, and clear behaviour when AI is unavailable`

---

### Task 8.6: First run, the teacher's guide, and restoring a backup

**Files:**
- Create: `apps/api/src/usecases/setup-progress.ts`, `routes/setup.ts`, and tests
- Create: `apps/web/src/screens/today/GettingStarted.tsx`, `apps/web/src/components/Tour.tsx`
- Create: `scripts/restore.ts`, `scripts/restore.test.ts` (root script `restore`)
- Create: `features/m8-first-run.feature`, `e2e/steps/first-run.steps.ts`
- Modify: `README.md` (in `prototypes/ai_teacher_planner/`), `TodayScreen.tsx`

**Interfaces:**
- Produces:

```ts
export type SetupStep = "import-calendar" | "confirm-timetable" | "review-pack" | "set-scheme" | "set-positions" | "accept-plan" | "confirm-events";
export interface SetupProgress { steps: { step: SetupStep; done: boolean; courseId: CourseId | null; link: string }[]; complete: boolean }
export function setupProgress(deps: AppDeps): Promise<SetupProgress>;
export function restoreBackup(args: { dataDir: string; backupFile: string; now: Date }): Promise<{ restored: string; previousSavedAs: string }>;
```

Route: `GET /api/setup/progress`.

What she sees: until setup is complete, Today leads with "Getting started": the steps in the order of the flow in spec section 12, each ticked or linked to where it is done, with the per-course steps repeated for each course. The first time the board has a plan on it, a three-step tour points at: the board ("Your timetable, with real dates"), a spare lesson (its explanation), and the legend (the sentence fixed in the index). The tour can be skipped, never returns once finished or skipped, and can be reopened from the header's help menu.

The README's section for Gemma covers, in plain language and under two pages: how to start and stop the app; the Monday routine (Today, check-in, the fortnight); what to do when a lesson is lost; what the sparkle means; what leaves her Mac and what never does; where backups are and how to restore one.

- [ ] **Step 1: Write the failing tests**

```ts
test("an empty data folder has every step to do, starting with the calendar", async () => expect(progress.steps[0]).toMatchObject({ step: "import-calendar", done: false }));
test("per-course steps appear once for each course", async () => {});
test("progress is complete when every course has an accepted plan and no event is unconfirmed", async () => {});
test("restore replaces the database with the backup and keeps the old one beside it", async () => {
  // plan A; backup; change to plan B; restore: the head is plan A again, and planner-before-restore-*.sqlite holds plan B
});
test("restore refuses a file that is not a planner backup", async () => {});
test("restore refuses to run while the app is running", async () => { /* a lock file or the port answering */ });
```

```gherkin
@e2e
Feature: First run
  Scenario: A new data folder leads with getting started
    Given an empty data folder
    When I open the app
    Then I see "Getting started" with "Import the school calendar" as the first step
  Scenario: The tour appears once
    Given a plan has just been accepted for the first time
    When I open the board
    Then I see the first step of the tour
    When I skip it and reload
    Then the tour does not appear
  Scenario: The tour is usable by keyboard and accessible
    Then the page has no serious accessibility violations
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): getting-started steps, a short tour, a teacher's guide and backup restore`

---

### Task 8.7: Full validation in Chrome

**Files:**
- Create: `docs/design/ai-teacher-planner/screens/v1-scenario-01.png` to `v1-scenario-16.png`, `docs/design/ai-teacher-planner/validation-v1.md`
- Create: `e2e/steps/a11y-sweep.steps.ts`, `features/m8-a11y-sweep.feature`, `packages/domain/src/speed.test.ts`
- Modify: `docs/design/ai-teacher-planner/README.md`

- [ ] **Step 1: Write the sweep and the speed check**

```gherkin
@e2e
Feature: Accessibility sweep
  Scenario Outline: <screen> in the <theme> theme has no serious violations
    Given the <theme> theme
    When I open <screen>
    Then the page has no serious accessibility violations
    Examples: every one of the ten screens, in dark and in light
```

```ts
// speed.test.ts: the engine must feel instant in the browser
test("a full year for three groups is sequenced in well under half a second", () => {
  const t0 = performance.now(); sequence(fullYearWorld()); expect(performance.now() - t0).toBeLessThan(500);
});
```

`performance.now()` is used only in this test file, which the purity check already excludes.

- [ ] **Step 2: Run them.** `pnpm test` and `pnpm e2e`. Expected: PASS. Fix anything that fails.

- [ ] **Step 3: Walk every scenario in Chrome** with the `claude-in-chrome` skill, on the synthetic data folder with the fake provider. For each of the sixteen scenarios in spec section 17: do what the scenario says as a user would, save one screenshot named for the scenario, and write one line in `validation-v1.md`: the scenario, pass or fail, and anything odd you saw that no test checks (a layout that jumps, a label that reads badly, focus that goes missing). Fix what fails and what reads badly, then walk it again.

- [ ] **Step 4: A keyboard-only pass and a 200 per cent zoom pass** over the ten screens. Note results in `validation-v1.md`.

- [ ] **Step 5: Open every export in its real application** on her Mac with Gemma: the fortnight, the scheme and coverage in Excel; the weekly plan and a cover sheet in Word; refresher slides in PowerPoint; a Teams post pasted into Teams. The fortnight must be in the shape of her timetable. Note each result.

- [ ] **Step 6: Check the footprint.** With the app, Chrome and PyCharm open, the API process stays under 300 MB. Note the figure.

- [ ] **Step 7: Gemma's own tests** (template Part 10): she starts the app on a Monday without help, finds today's lessons and this week's reminders, and plans the next fortnight. Record the time against the targets in spec section 2: a fortnight in under 15 minutes, "what can I teach IB H next" in under a minute, a replan after an absence in under 5 minutes, usable within 10 minutes of first opening.

- [ ] **Step 8: Finish line and commit.** `test(planner): full accessibility sweep, speed check and Chrome validation of every scenario`

---

### Task 8.8: Documentation true, pull request ready

**Files:**
- Modify: `docs/design/ai-teacher-planner/src/*.d2` and their SVGs, `docs/design/ai-teacher-planner/README.md`, `docs/adr/006` to `016` where reality differed, `CLAUDE.md` (root and planner), `docs/security.md`, `prototypes/ai_teacher_planner/README.md`, `docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md` (appendix D only), the PR description

- [ ] **Step 1: Diagrams.** With the `architecture-visual-docs` skill, walk every row of its table against the code as built. Change the `later` class on everything now built. Run `sh docs/design/render.sh --check`. Expected: "diagrams are up to date".

- [ ] **Step 2: Decisions.** For each ADR from 006 to 016, add a dated "As built" note where the build differs from the decision or settled something it left open: the API runtime (Task 1.6), how an image reaches the CLI or that it could not (Task 2.20), the drag library or its replacement (Task 5.3), the libraries pinned. Record what spec section 23 left to the builder where a later reader would look: routes in the OpenAPI document, table names in the migrations, the router and the group colours in the planner's `CLAUDE.md`.

- [ ] **Step 3: Both `CLAUDE.md` files.** The status line, the map and the commands must match the code. Run every command listed and correct any that is wrong.

- [ ] **Step 4: Repository checks.** Run each and confirm the result:

| Command | Expected |
|---|---|
| `uv run pytest` (repo root) | The Python suite still passes |
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e` | All pass |
| `sh docs/design/render.sh --check` | Diagrams are up to date |
| `git ls-files prototypes/resources prototypes/ai_teacher_planner/data` | Nothing |
| `git log --all --oneline -- prototypes/ai_teacher_planner/data` | Nothing |
| A search of the repository for the names of the denied folders' contents | Not performed: never list them. Instead confirm `.claude/settings.json` still has every deny rule from Phase A |

- [ ] **Step 5: A security review of the branch** with the `security-review` skill, then the `pr-review-toolkit:review-pr` skill. Fix what they find; note what you decline and why.

- [ ] **Step 6: The pull request.** Rewrite its description: what v1 does in five lines; a review guide by milestone tag (`planner-m1` to `planner-m8`); the sixteen scenarios as a ticked list with their screenshots; the ADR list; the open questions still unanswered from spec section 22 and appendix D; known limits (the `--bare` risk, the subscription sign-in being for personal local use only, libraries below 1.0); and Gemma's timings from Task 8.7. Mark it ready for review.

- [ ] **Step 7: Commit and tag.** `docs(planner): v1 documentation and pull request ready`, then `git tag planner-m8` and `git tag planner-v1`.
