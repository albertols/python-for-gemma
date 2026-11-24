# AI Teacher Planner M7: Resource Refresher, Cover Lesson, Independent Task

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For a chapter, Gemma asks for current-event slides and gets suggestions with sources the app has opened, each saying where it fits, while her PowerPoint is never touched. From a missed lesson she gets cover work aimed at what was planned. For any lesson she gets an independent task that fits the year group's policy and practises PBLT paragraphs. Everything is marked as AI and reviewed before it can be used.

**Architecture:** A separate package, `packages/content-creator`, holds the three features so they can be lifted into their own prototype later (ADR-015). Each builds a text-only input, calls a skill through the AI port, validates the output, and returns reviewable items. Files are read through the gateway; the model never sees a path or a file.

**Tech Stack:** As the index. New and not proven by spike: `fflate`, `fast-xml-parser`, `pptxgenjs` (test fixtures in this milestone).

**Spec:** sections 11, 12 and 14 of [`2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md). The year-group policy for independent tasks is Gemma's, from section 6B of `template_prompt.md`.

## Global Constraints

The index's [Global Constraints](2026-11-24-ai-teacher-planner-v1.md#global-constraints), [Conventions](2026-11-24-ai-teacher-planner-v1.md#conventions) and [Shared contract](2026-11-24-ai-teacher-planner-v1.md#shared-contract) apply to every task here. Start with the check described under "Before starting a milestone" in the index.

Three more for this milestone:

- **Speaker notes are never sent to a model.** They are where a teacher writes reminders about students. Only slide titles and slide text are sent.
- **Every factual claim has a source, and every source is fetched by the app before the suggestion is shown.** One that cannot be opened is shown as "could not be opened", never hidden.
- **Generic output is a defect** (spec section 3, anti-goals). Each skill names the exam board, uses its command words, and is judged by Gemma at the gate.

## Review Focus

1. **A deck that cannot be read:** an old `.ppt`, a damaged file, a password-protected one. She is told which and why before any job starts. Task 7.2.
2. **A source that is dead, slow, blocked, or the laptop is offline.** The suggestion is kept and the source is marked; offline, every source is marked "not checked" and a banner says why. Task 7.3.
3. **The model points past the end of the deck, or gives a suggestion with no source.** That suggestion is dropped and the run says how many were dropped and why. Task 7.4.
4. **A second refresh of the same chapter.** Nothing suggested before, accepted or rejected, is suggested again. Task 7.4.
5. **A very large deck.** The text sent is capped, and the run says it was capped and at which slide. Task 7.4.

---

### Task 7.1: The resource index and the teaching file

**Files:**
- Create: `packages/importers/src/resources/index-resources.ts`, `index-resources.test.ts`
- Create: `apps/api/src/db/migrations/0005_content.sql`, `repos/sqlite/content-repo.ts`, `usecases/resource-index.ts`, `routes/resources.ts`, and tests

**Interfaces:**
- Consumes: `ResourceGateway.list`, `SowItem.packRefs`, `PackChapter.number`.
- Produces:

```ts
export interface ResourceFile { path: string; fileName: string; chapterNumber: string | null; kind: "pptx" | "ppt" | "other"; variant: "teacher" | "student" | "unknown"; modifiedAt: string; size: number }
export function indexResources(gateway: ResourceGateway, courseRoot: string): Promise<ResourceFile[]>;
export function chapterNumberOf(path: string): string | null;                // from the nearest folder or file name that starts with a number
export function pickTeachingFile(files: readonly ResourceFile[]): ResourceFile | null;
```

Routes: `GET /api/resources/:courseId` returns each teaching item with its files, the file picked, and whether she overrode the pick. `PUT /api/resources/:courseId/:itemId/file` with `{ path }` sets her choice; a path the gateway refuses, or one for another chapter, is refused.

Rules: only files under `PP` folders are indexed. `variant` is `teacher` when the file name contains "teacher" in any case, `student` when it contains "student". `pickTeachingFile` takes `.pptx` files only, prefers `teacher`, then the most recently modified. ASSUMPTION (spec open question 6): the TEACHER file is the one she teaches from.

- [ ] **Step 1: Write the failing tests** on a temporary folder tree with invented names

```ts
test("the chapter number comes from the folder above PP", () => expect(chapterNumberOf("ial/1. Content/Y13 Content/U4/Content/26 Topic/PP/slides TEACHER.pptx")).toBe("26"));
test("a file name that starts with a number also gives the chapter", () => {});
test("the TEACHER file wins over a newer student file", () => {});
test("among TEACHER files the newest wins", () => {});
test("an old .ppt is listed and never picked", () => expect(pickTeachingFile([oldPpt])).toBeNull());
test("files outside PP folders are not indexed", () => {});
test("each item gets the files of its pack chapter's number", async () => {});
test("her own choice is kept and reported as hers", async () => {});
test("choosing a file the gateway refuses is refused", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(planner): index chapter PowerPoints and pick the teaching file`

---

### Task 7.2: Reading the text of a PowerPoint

**Files:**
- Create: `packages/importers/src/pptx/extract.ts`, `slide-xml.ts`, `extract.test.ts`, `slide-xml.test.ts`
- Create: `fixtures/src/synthetic-deck.ts`

**Interfaces:**
- Produces:

```ts
export interface DeckSlide { index: number; title: string | null; text: string[]; tableText: string[]; hasNotes: boolean }
export interface Deck { slideCount: number; slides: DeckSlide[] }
export class DeckUnreadable extends Error { reason: "old-format" | "not-a-deck" | "protected" | "damaged" }
export function extractDeck(data: Uint8Array, fileName: string): Promise<Deck>;
export function parseSlideXml(xml: string): { title: string | null; text: string[]; tableText: string[] };
export function buildSyntheticDeck(): Promise<Uint8Array>;    // fixtures: 5 slides, one with a table, one with speaker notes
```

`DeckSlide` has no field for the notes' text, by design: the reader records only whether notes exist.

- [ ] **Step 1: Write the failing tests**

```ts
test("slides come out in presentation order, not file order", async () => {});
test("the title placeholder is the title; other text keeps its order", async () =>
  expect(deck.slides[1]).toMatchObject({ index: 2, title: "Demand", text: ["Why demand curves slope down", "Shifts and movements"] }));
test("table cells are read row by row", async () => expect(deck.slides[2]?.tableText).toEqual(["Price", "Quantity", "10", "40"]));
test("text inside grouped shapes is read", () => {
  expect(parseSlideXml(GROUPED_XML).text).toEqual(["Outer", "Inner one", "Inner two"]);       // GROUPED_XML is an inline snippet with nested p:grpSp
});
test("speaker notes are noticed and their text is nowhere in the result", async () => {
  expect(deck.slides[3]?.hasNotes).toBe(true);
  expect(JSON.stringify(deck)).not.toContain("NOTE-CANARY");                                  // the fixture's notes contain this word
});
test("an old .ppt is refused as old-format", async () => await expect(extractDeck(bytes, "x.ppt")).rejects.toMatchObject({ reason: "old-format" }));
test("a zip that is not a deck is refused as not-a-deck", async () => {});
test("an encrypted file is refused as protected", async () => { /* starts with the OLE header D0 CF 11 E0 */ });
test("a truncated file is refused as damaged", async () => {});
test("a slide with no text gives empty arrays, not an error", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with fflate to unzip and fast-xml-parser to read, both behind these two files. Slide order comes from `ppt/presentation.xml` and its relationships.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Finish line and commit.** `feat(importers): read slide text from a PowerPoint without its notes`

---

### Task 7.3: Opening sources

**Files:**
- Create: `apps/api/src/usecases/check-sources.ts`, `check-sources.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SourceCheck { url: string; opened: boolean; status: number | null; problem: "not-found" | "timeout" | "blocked" | "refused-address" | "offline" | null; checkedAt: string }
export type FetchLike = (url: string, init: { signal: AbortSignal; redirect: "follow"; headers: Record<string, string> }) => Promise<{ status: number }>;
export function checkSources(sources: readonly Source[], deps: { fetch: FetchLike; now: () => Date; timeoutMs: number }): Promise<{ sources: Source[]; checks: SourceCheck[] }>;
```

`AppDeps` gains `fetch: FetchLike`; `main.ts` passes the real one, tests pass a fake.

- [ ] **Step 1: Write the failing tests**

```ts
test("a source that answers 200 is opened", async () => {});
test("404 is not-found, a timeout is timeout, 403 is blocked; each stays in the list with opened false", async () => {});
test("only http and https are fetched; file:, localhost and private addresses are refused without a request", async () => {
  expect(calls).toEqual([]);                                   // for "file:///etc/hosts", "http://127.0.0.1:4319/api/config", "http://192.168.1.1/"
});
test("when every request fails to connect, all are marked offline", async () => {});
test("at most 20 sources are checked; the rest are marked not checked", async () => {});
test("checks run with a generic client name and send nothing about the user", async () => expect(sentHeaders["user-agent"]).toBe("ai-teacher-planner"));
test("a duplicate URL is fetched once", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Timeout 8 seconds each, four at a time.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagram 08** with the `architecture-visual-docs` skill: the app now opens public web pages to check sources, and sends them nothing.
- [ ] **Step 6: Finish line and commit.** `feat(api): open every cited source before showing it`

---

### Task 7.4: Resource refresher

**Files:**
- Create: `packages/content-creator/package.json`, `tsconfig.json`, `src/index.ts`, `src/refresher.ts`, `refresher.test.ts`, `refresher.steps.test.ts`
- Create: `features/12-resource-refresher.feature`
- Create: `packages/ai/src/skills/content-refresh-resource.ts`, `.claude/skills/content-refresh-resource/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/refresh-resource.ts`, and its test; `routes/resources.ts` gains `POST /api/resources/:courseId/:itemId/refresh`

**Interfaces:**
- Consumes: `extractDeck`, `checkSources`, `startJob`, `registerItemHandler`, `specPointsFor`.
- Produces:

```ts
export interface SlideSuggestion { headline: string; bullets: string[]; insertAfterSlide: number; why: string; eventDate: string | null; sources: Source[] }
export interface RefreshInput { board: string; yearGroup: YearGroup; chapterTitle: string; specPoints: { code: string; title: string }[]; slides: { index: number; title: string | null; text: string[] }[]; cappedAtSlide: number | null; alreadySuggested: { headline: string; url: string }[]; today: IsoDate }
export function buildRefreshInput(args: { board: string; yearGroup: YearGroup; chapterTitle: string; specPoints: SpecPoint[]; deck: Deck; alreadySuggested: { headline: string; url: string }[]; today: IsoDate; maxChars: number }): RefreshInput;
export function vetSuggestions(output: { suggestions: SlideSuggestion[] }, deck: Deck, alreadySuggested: readonly { url: string }[]): { kept: SlideSuggestion[]; dropped: { headline: string; reason: string }[] };
```

Rules:

- The input holds slide titles and slide text, up to `maxChars` (12,000) in slide order; when cut, `cappedAtSlide` is the last slide included. It never holds notes, a file name or a path.
- A suggestion is dropped when `insertAfterSlide` is below 0 or above the slide count, when it has no source, or when any of its source URLs was suggested before.
- Kept suggestions have their sources checked, then become items of kind `refresher-slide`, one per suggestion, awaiting review. Accepted ones are stored for the PowerPoint export in M8. Every suggestion ever made, kept or not, accepted or not, is remembered per chapter so it is not suggested again.
- The skill runs with `WebSearch` and `WebFetch` and is the only skill so far that does.

- [ ] **Step 1: Write the feature file** for scenario 12, tagged `@engine @e2e`.

- [ ] **Step 2: Write the failing tests**

```ts
test("the input has titles and text, never notes, file names or paths", () => {
  const input = buildRefreshInput(args);
  expect(JSON.stringify(input)).not.toMatch(/NOTE-CANARY|\.pptx|1\. Content/);
});
test("a long deck is capped in slide order and says where", () => expect(buildRefreshInput({ ...args, maxChars: 200 }).cappedAtSlide).toBe(2));
test("a suggestion that points past the last slide is dropped with the reason", () =>
  expect(vetSuggestions(out, deck, []).dropped).toContainEqual({ headline: "Too far", reason: "It points after slide 9, but the deck has 5 slides." }));
test("a suggestion with no source is dropped", () => {});
test("a suggestion whose source was suggested before is dropped", () => {});
test("inserting after slide 0 means before the first slide and is allowed", () => {});
// refresher.steps.test.ts, scenario 12, with the fake provider and a fake fetch
// - three suggestions come back; one source answers 404
// - each kept suggestion has an insertion point within the deck and at least one source
// - the suggestion with the dead link is kept and its source has opened false
// - every item has origin "ai" and review "suggested"
// - the SHA-256 of the deck file is the same before and after
test("a second refresh sends what was suggested before and stores no repeats", async () => {});
test("a deck that cannot be read starts no job and returns the reason as a sentence", async () => {});
test("the run records how many suggestions were dropped and why", async () => {});
test("offline: suggestions are kept, every source is marked not checked", async () => {});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement** the package functions, the use case and the item handler.
- [ ] **Step 5: Write the skill** by the writing-skills loop. Baseline: a bare instruction on the synthetic deck through `pnpm ai:try`; note what is wrong, typically undated or old examples, claims without a link, generic "a company" examples, no insertion point, the wrong exam vocabulary. Then write `SKILL.md` to fix what you saw. It must say: use events from the twelve months before `today` where possible, and give the event's date; name the real organisation; open each page before citing it and cite the page itself, not a search result; say after which slide it fits and why there; use the named board's command words and the listed specification points; give two or three suggestions, not a list of ten; never repeat anything in `alreadySuggested`; never rewrite her slides.
- [ ] **Step 6: Run again.** Expected: PASS, including scenario 12 in the engine.
- [ ] **Step 7: Try it live once** on the synthetic deck: `pnpm ai:try content-refresh-resource fixtures/ai/refresh.input.json`. Expected: schema-valid output in about 30 seconds, with sources that open.
- [ ] **Step 8: Finish line and commit.** `feat(content): resource refresher with checked sources and insertion points`

---

### Task 7.5: Cover lesson

**Files:**
- Create: `packages/content-creator/src/cover-lesson.ts`, `cover-lesson.test.ts`
- Create: `packages/ai/src/skills/content-cover-lesson.ts`, `.claude/skills/content-cover-lesson/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/draft-cover-lesson.ts`, and its test; `routes/content.ts` with `POST /api/content/cover-lesson`

**Interfaces:**
- Consumes: `PlanSnapshot`, `Slot`, `specPointsFor`, `Deck`, `startJob`.
- Produces:

```ts
export interface CoverLessonInput { board: string; yearGroup: YearGroup; periodMinutes: 55; planned: { itemTitle: string; lessonIndex: number; of: number; specPoints: { code: string; title: string }[] }[]; slideTitles: string[]; doublePeriod: boolean }
export interface CoverLesson { title: string; objectives: string[]; forTheCoverTeacher: string[]; tasks: { minutes: number; instruction: string }[]; materials: string[]; extension: string; successCriteria: string[] }
export function buildCoverInput(args: { snapshot: PlanSnapshot; slots: readonly Slot[]; items: readonly SowItem[]; pack: CurriculumPack; group: Group; slotKeys: SlotKey[]; deck: Deck | null; board: string }): CoverLessonInput;
export function vetCoverLesson(c: CoverLesson, input: CoverLessonInput): string[];
```

Rules: the input is built from what the plan had in the missed slot or slots (template 6A, feature 6). `vetCoverLesson` refuses a draft whose task minutes do not add up to between 45 and 55 for a single period (90 and 110 for a double), that has no objective, or that needs the absent teacher ("ask your teacher"). A refused draft is stored as a failed run with the reasons. Items have kind `cover-lesson`, target `<groupId>|<slotKey>`.

- [ ] **Step 1: Write the failing tests**

```ts
test("the input names what was planned in the missed slot, with its specification points", () => {});
test("a double period is one request for 110 minutes", () => expect(input.doublePeriod).toBe(true));
test("a slot with a spare lesson asks for revision of the last topic taught", () => {});
test("the input holds no group name, date or room", () => expect(JSON.stringify(input)).not.toMatch(/13 3|2026-|"room"/));
test("tasks that add up to 30 minutes for a 55-minute lesson are refused", () => expect(vetCoverLesson(short, input)[0]).toContain("30"));
test("a draft that tells students to ask their teacher is refused", () => {});
test("an accepted draft is stored against the group and slot and shows in the lesson drawer", async () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Write the skill** by the writing-skills loop. It must say: aim at the planned lesson's objectives; everything doable without the subject teacher and with what a cover teacher can hand out or show; plain instructions for a non-specialist; timed tasks that fill the lesson; at least one task that is written and can be collected; the board's command words; no student names.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Finish line and commit.** `feat(content): cover lesson drafted from what was planned`

---

### Task 7.6: Independent task

**Files:**
- Create: `packages/content-creator/src/independent-task.ts`, `independent-task.test.ts`
- Create: `packages/ai/src/skills/content-independent-task.ts`, `.claude/skills/content-independent-task/SKILL.md`, `schema.json`
- Create: `apps/api/src/usecases/draft-independent-task.ts`, and its test; `routes/content.ts` gains `POST /api/content/independent-task`

**Interfaces:**
- Produces:

```ts
export type TaskMode = "check-understanding" | "flipped-preview" | "review-and-connect";
export function taskMode(yearGroup: YearGroup, timing: "before" | "after"): TaskMode;
export interface IndependentTaskInput { board: string; yearGroup: YearGroup; mode: TaskMode; itemTitle: string; specPoints: { code: string; title: string }[]; minutes: number; today: IsoDate }
export interface IndependentTask { title: string; mode: TaskMode; instructions: string[]; pblt: { question: string; point: string; because: string; leadsTo: string; therefore: string }; whyHardToHandToAi: string; estimatedMinutes: number; successCriteria: string[] }
export function vetIndependentTask(t: IndependentTask, input: IndependentTaskInput): string[];
```

The policy is Gemma's (template 6B, feature 8): Years 11 and 12 get tasks that check understanding, whatever the timing. Year 13 before a lesson gets a preview of the new content that ends with students bringing their own questions. Year 13 after a lesson gets a review that asks for their own real-world connections. Every task practises a PBLT paragraph (Point, Because, Leads to, Therefore): the `pblt` fields are prompts for the student, not model answers.

`vetIndependentTask` refuses a task whose mode differs from the input's, whose `pblt.question` is empty, whose `whyHardToHandToAi` is empty, or whose PBLT fields contain a finished paragraph (more than 25 words each). Items have kind `independent-task`, target `<groupId>|<lessonId>`.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([[11, "before", "check-understanding"], [11, "after", "check-understanding"], [12, "after", "check-understanding"], [13, "before", "flipped-preview"], [13, "after", "review-and-connect"]] as const)
  ("year %i, %s the lesson: %s", (year, timing, mode) => expect(taskMode(year, timing)).toBe(mode));
test("a task in the wrong mode is refused", () => {});
test("a PBLT field that is a finished paragraph is refused: these are prompts, not answers", () => {});
test("a task that does not say why it is hard to hand to AI is refused", () => {});
test("the input holds no group name and no student name", () => {});
test("a task can be asked for from a lesson, from a spare lesson, and from the homework catch-up option", async () => { /* three entry points give the same item kind */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Write the skill** by the writing-skills loop. It must say: ask for judgement, a local or recent example the student finds, or the student's own question, never plain recall or a summary of the textbook; state the mode's purpose; include the PBLT question and four short prompts; say in one sentence why a chatbot's answer would not be enough; use the board's command words; fit the minutes given.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Finish line and commit.** `feat(content): independent task by year-group policy with a PBLT prompt`

---

### Task 7.7: The Resources screen, and reviewing drafts

**Files:**
- Create: `apps/web/src/screens/resources/ResourcesScreen.tsx`, `ChapterResources.tsx`, `SuggestionCard.tsx`, `DraftsPanel.tsx`, `CoverLessonView.tsx`, `IndependentTaskView.tsx`
- Create: `e2e/steps/resources.steps.ts` (browser steps for `features/12-resource-refresher.feature`), `features/m7-content.feature`
- Modify: `LessonDrawer.tsx`, `LostLessonDialog.tsx`, `CatchUpOptions.tsx`, `routes.tsx`, `AppShell.tsx`, `scripts/seed-synthetic.ts`

**Interfaces:**
- Consumes: the resources and content routes, the AI job routes, `ReviewBar`, `ProvenancePopover`.
- Produces: screen `/resources/:courseId`.

What it shows:

- **Resources:** one row per chapter: its PowerPoint (the picked file's name, and a way to choose another), when it was last refreshed, and how many suggestions await review. "Refresh this chapter" starts the job; the header chip shows progress, since this one takes about half a minute. A chapter with no readable PowerPoint says why.
- **A suggestion:** the headline and bullets as a slide preview; "Insert after slide 4: Shifts and movements"; why it fits there; the event's date; each source as a link marked "opened" or "could not be opened"; the AI badge and review bar. Editing lets her change the text and the insertion point. A line states: "Your PowerPoint is not changed. Accepted slides are exported as a separate file."
- **Drafts awaiting review:** cover lessons and independent tasks in one list, each opening its full view with a review bar.
- **Entry points elsewhere:** "Draft cover work" beside each cover slot in the lost-lesson dialog and in the lesson drawer; "Draft an independent task" (before or after the lesson) in the lesson drawer, on a spare lesson, and on the homework catch-up option. Each is unavailable, with the reason, when AI is off.

- [ ] **Step 1: Write the failing browser tests**

```gherkin
@e2e
Feature: Content drafts
  Scenario: A cover lesson is drafted from the missed lesson and awaits review
    When I draft cover work for a cover slot
    Then the draft names the planned lesson's objectives and has timed tasks
    And it has the "AI suggestion, not reviewed" badge
  Scenario: An independent task follows the year group's policy
    When I draft an independent task before a Year 13 lesson
    Then the task is a preview that asks students to bring their own questions
    And it has a PBLT question with four prompts
  Scenario: AI is off
    Given AI is switched off
    Then "Refresh this chapter" is unavailable and says why
    And the list of PowerPoints still loads
  Scenario: The screens are accessible
    Then the page has no serious accessibility violations
```

The steps for scenario 12: open Resources, refresh the synthetic chapter, and check that each suggestion has an insertion point, a source marked opened, the AI badge, that the one with a dead link says "could not be opened", and that the sentence about her PowerPoint not being changed is shown.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Update diagrams 02, 04 and 07** with the `architecture-visual-docs` skill: the content-creator package is built, and the AI flow now has a source-checking step.
- [ ] **Step 6: Finish line and commit.** `feat(web): resources screen and review of refresher slides, cover lessons and tasks`

---

### Task 7.8: M7 gate

**Files:**
- Create: `docs/design/ai-teacher-planner/screens/m7-resources.png`, `m7-suggestion.png`, `m7-cover-lesson.png`
- Modify: both `CLAUDE.md` files, diagrams as needed, the PR description, the three `content-*` skills

- [ ] **Step 1: Run every scenario so far.** `pnpm test` and `pnpm e2e`. Expected: PASS.
- [ ] **Step 2: One live run of each content skill with Gemma, on her real data.** She picks a chapter she is about to teach and refreshes it; she drafts cover work for one lesson and an independent task for one. For each she answers three questions, and her answers go in the PR: Is it at the right level for this group? Is it specific, or could it be about any business? Would you use it?
- [ ] **Step 3: Fix what she marks down.** Each fix is a change to a skill, made by the writing-skills loop: reproduce the weak output on a synthetic input, change the skill, run again.
- [ ] **Step 4: Check the boundary.** In the activity drawer, open the three runs and confirm that no input held a file path, speaker notes, a group name or a student's name. Check `git status` shows nothing from `data/` or `prototypes/resources/`.
- [ ] **Step 5: The gate.** Follow "Milestone gate" in the index.
- [ ] **Step 6: Commit and tag.** `docs(planner): M7 gate`, then `git tag planner-m7`.
