# AI Teacher Planner v1 Implementation Plan (index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local web app that turns Gemma's calendar, timetable and schemes of work into a dated lesson plan per group, with AI help that is labelled and reviewed.

**Architecture:** A pnpm workspace under `prototypes/ai_teacher_planner/`. A pure TypeScript engine (`packages/domain`) is imported by both a local Hono API (SQLite, file access through one gateway, AI through one port) and a React app. Plans are immutable revisions derived from stored facts and decisions; every change is a proposal she accepts.

**Tech Stack:** Node 26, pnpm 12, TypeScript 7.0, Biome, React 19, Vite 8, Tailwind 4, shadcn/ui, TanStack Query, Hono 4 + `@hono/zod-openapi`, Zod 4, better-sqlite3 + Drizzle, Vitest 5, `@amiceli/vitest-cucumber`, fast-check, Playwright on the installed Chrome, playwright-bdd, axe.

**Spec:** [`docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md`](../specs/2026-11-19-ai-teacher-planner-design.md), approved 24 Nov 2026. Read it before any task; section numbers below refer to it. Its appendix D lists what changed after approval.

## The plan set

This file holds what every task shares. Each milestone has its own file, and each milestone leaves working, tested software behind.

| File | Milestone | Proves (spec section 17) |
|---|---|---|
| [`…-m1-calendar-timetable-board.md`](2026-11-24-ai-teacher-planner-m1-calendar-timetable-board.md) | M1: workspace, calendar, slots, Today, read-only board | Scenarios 1 to 4, 14, 15 |
| [`…-m1b-gemma-corrections.md`](2026-11-24-ai-teacher-planner-m1b-gemma-corrections.md) | M1b: her corrections after M1: day labels, import report, cancelled lessons, calendar events, exams, board filter and week view, to-do notes (added 24 Nov 2026, spec appendix E) | Scenario 4 extended; appendix E |
| [`…-m2-ial-sequencing.md`](2026-11-24-ai-teacher-planner-m2-ial-sequencing.md) | M2: IAL Unit 4 end to end, AI layer | Scenario 5 |
| [`…-m3-disruptions-reflow-parity.md`](2026-11-24-ai-teacher-planner-m3-disruptions-reflow-parity.md) | M3: disruptions, reflow, parity | Scenarios 6, 7, 8, 16 |
| [`…-m4-ib-hl-helper.md`](2026-11-24-ai-teacher-planner-m4-ib-hl-helper.md) | M4: IB tracks and the HL helper | Scenario 10 |
| [`…-m5-board-editing.md`](2026-11-24-ai-teacher-planner-m5-board-editing.md) | M5: moving lessons, views, AI marking | Scenarios 9, 13 |
| [`…-m6-igcse-coverage-assessments.md`](2026-11-24-ai-teacher-planner-m6-igcse-coverage-assessments.md) | M6: IGCSE, coverage, assessment calendar | Scenario 11 |
| [`…-m7-content-creator.md`](2026-11-24-ai-teacher-planner-m7-content-creator.md) | M7: resource refresher, cover lesson, independent task | Scenario 12 |
| [`…-m8-exports-validation.md`](2026-11-24-ai-teacher-planner-m8-exports-validation.md) | M8: exports, offline, tour, full validation | All |

Work the milestones in order. Inside a milestone, work the tasks in order unless a task says it is independent.

**Before starting a milestone after M1:** run the finish line (below) on the current branch, then compare the contract in this file with the code. If they differ, the code wins: correct this file in the first commit of the milestone, then carry on.

## Global Constraints

Every task's requirements include this section.

**Hard rules (spec section 4). If a task conflicts with one, stop and say so.**

- No credentials, passwords or tokens in anything a model sees or in git.
- No real student names or student work in prompts, fixtures, tests, screenshots or commits. No student personal data is stored.
- Every AI-generated item is reviewed by Gemma before it can be exported.
- No change to a plan is applied without a preview she accepts.
- A model never writes to disk or to the database. It returns data; the app validates and stores it.
- School files are read only through `ResourceGateway` and its allowlist.
- Never weaken the deny rules in `.claude/settings.json`. Never open, list or name the denied folders under `prototypes/resources/`.
- Board material may be read locally and cited, never republished: curriculum packs stay in `data/`, tests use the synthetic curriculum.

**Engine rules (spec section 9)**

- `packages/domain` is pure: dates are `YYYY-MM-DD` strings, `today` is an argument, no clock, randomness, disk, network, DOM or Node APIs, and no runtime dependencies.
- The week label is read per date and never computed.
- The same inputs always give the same plan. Sort explicitly; never rely on object key order or input order.
- Bad data is reported, never guessed.

**Toolchain (proven by spike on 19 Nov 2026; pin exactly, no `^` or `~`)**

- Node 26 and pnpm 12 through mise (`mise.toml` at the repo root). If `node` or `pnpm` is not found, prefix the command with `~/.local/bin/mise exec --`.
- `typescript` 7.0.2, `vitest` 5.1.0, `@amiceli/vitest-cucumber` 8.0.1, `fast-check` 4.10.2, `@biomejs/biome` 2.6.8, `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0, `@types/node` 26.6.6, `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@types/better-sqlite3` 9.6.0.
- `react` and `react-dom` 19.3.1, `hono` 4.13.19, `@hono/zod-openapi` 1.6.3, `zod` 4.6.7, `drizzle-orm` 0.45.4, `better-sqlite3` 13.2.0, `exceljs` 4.4.0.
- The npm package `xlsx` is forbidden (two unpatched high advisories).
- Any other library a task names was **not** proven. Install its current release with `pnpm add --save-exact`, read its current documentation before using it, keep it behind the one adapter file the task names, and note the pinned version in the commit message.

**Machine (spec section 5):** 8 GB RAM. No Docker, no database server, no long-running dev server in tests, one Playwright worker, the installed Chrome (`channel: 'chrome'`), no browser download.

**AI (spec section 11)**

- Tests and CI use `FakeAiProvider`. CI has no access to Claude or to `prototypes/resources/`.
- The Claude adapter uses exactly this flag set, with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` removed from the child environment, and never `--bare`:
  `claude -p "<prompt>" --model <alias> --tools "" --setting-sources "" --strict-mcp-config --disallowedTools "mcp__*" --permission-mode dontAsk --output-format stream-json --verbose --json-schema '<schema>' --no-session-persistence < /dev/null`
- Task 2.8 tests exactly this flag set, plus `--tools "WebSearch,WebFetch"` for a web skill (ADR-007), and no `--allowedTools`. Every task that runs a headless skill passes `--model <alias>` from its `SkillDefinition.model`. Attachments are refused until Task 2.20 proves an image path.
- Every stored item has an origin: `engine`, `ai`, `teacher` or `import`. AI items also carry provider, model, skill, time, sources and a review state: `suggested`, `accepted`, `edited` or `rejected`.

**Interface (spec section 12)**

- Dark by default with a light option. Contrast at least 4.5 to 1. Everything reachable by keyboard, with visible focus. No meaning carried by colour alone.
- AI awaiting review: sparkle icon and dashed outline. Accepted: small sparkle. Edited by her: sparkle and pencil. Engine output has no badge.
- Legend text, verbatim: "Everything without the sparkle is calculated from your calendar and timetable."
- A flex lesson is called a "spare lesson" in every label she sees. Its explanation, verbatim: "A lesson this group has before the next checkpoint that the other groups do not. Use it for exam practice, support activities or independent study."
- Group ids are written exactly as on her timetable: `11D`, `IB H`, `IB S`, `13 1`, `13 3`, `13 5`.
- Every free-text note field carries the hint "No student names."
- House palette for diagrams and accents: blue `#4F86C6`, green `#59A96A`, amber `#F4A259`, AI purple `#8E6BAF`.

**Repo**

- The Python scaffold (`src/ai_teacher_planner/*.py`, `tests/`, `mock_data/`) is left alone. `template_prompt.md` is Gemma's and is not edited. ADR-005 is hers to write.
- `prototypes/resources/` and `prototypes/ai_teacher_planner/data/` are git-ignored. Check `git status` before every `git add`; never `git add -A`.
- A change to modules, ports, routes, the data model, the AI flow or the stack updates its diagram in the same commit, using the `architecture-visual-docs` skill.
- Conventional commits. End each message with the attribution lines your own session specifies.

## Review Focus

Conditions the spec implies and a person will meet, which no scenario in section 17 exercises. Each has a test in the task named.

1. **The school renames or moves a calendar column.** The import stops with a report naming the missing header; it never maps a column by position. Task 1.4.
2. **The app is opened on a day with no lessons, or just after midnight.** Today shows the next teaching day; "today" is the local date in the school's time zone, not the UTC date. Tasks 1.6, 1.8 and 1.12.
3. **She does not open the app for three weeks.** Past lessons become `assumed`, the check-in offers them week by week, and the plan still starts from the right lesson. Tasks 2.4 and 2.18.
4. **A proposal is accepted after the plan changed elsewhere** (a second tab, or an older preview). The accept is refused with a clear message and nothing is applied. Tasks 2.12 and 3.3.
5. **Claude is missing, signed out, slow or returns invalid data.** The job fails with a reason she can read, nothing is stored, and every engine screen still works. Tasks 2.8 and 2.9.

Each milestone file adds its own.

## Calls made while planning

Recorded in spec appendix D as well. Say so if any is wrong.

| Topic | Call |
|---|---|
| Staff-only days inside term | A whole-school disruption she confirms, so lost lessons show in the audit. Days outside term dates never have slots |
| Pace line | Exact rule in Task 2.3. A group that cannot fit the content due before an assessment is short alone |
| "Not after" deadlines | Checked and reported as a conflict when missed. They never reorder lessons |
| Assessments | A length in minutes and a "takes the whole lesson" choice, defaulted to yes when the length with 25% extra time is over 27 minutes (half of 55); a warning when the length with extra time is over 55. Undated assessments are streamed in scheme order. (Was a fixed 30-minute line; changed by her answer to question 16, spec appendix E) |
| Milestone M1b | Inserted before M2 after her M1 click-through, so plans never land in study leave, mocks or days she says have no lessons (spec appendix E) |
| Freeze horizon | Per plan: today through the next date on which any group of that plan has a usable slot |
| Timetable image upload | Moved from M1 to M2, with the AI layer |
| Router | `react-router`, declarative routes. The spec left it to the builder |
| Database migrations | Numbered SQL files and a small runner; Drizzle is used for typed queries only |
| API runtime | Node 26 runs the TypeScript source directly (type stripping). Task 1.6 proves it and names the fallback |
| "Today" | Comes from the API (`GET /api/config`), which uses the local date; `PLANNER_FIXED_TODAY` pins it in tests |
| Jitter | Measured at the end of each day over one undisrupted fortnight. For 13 1, 13 3 and 13 5 it is 1 |
| "Hold the leading groups" | A choice she makes (a `PaceHold`): the lesson a group is short of is taught after the assessment by every group, and the others gain a spare lesson |
| Her IAL sheet's total | It lists 70 classes across chapters 22 to 37 and states 65, because chapter 22's five were taught in Year 12. The import keeps both numbers |
| Speaker notes | Never sent to a model: that is where notes about students are written |
| Assessment in an exam week | Judged by the date she gave it in the scheme, not by the slot it moved to |
| Browser tests | Run with today fixed at 20 November 2026 and re-seed before every scenario. `POST /api/test/reset` takes an optional `{ state }`: `"m1b"` (default, what every M1 and M1b scenario expects), `"m2-draft-pack"`, `"m2-no-positions"`, `"m2-planned"` (Task 2.12) |
| Revision block | A group's last `revisionWeeks` Monday-to-Sunday weeks that hold a usable slot, counted back from the week of its last usable slot before the plan's first official exam (or its last usable slot when there is no exam). All usable slots in them are spare lessons. 0 turns it off (M2 pre-flight, 25 Nov 2026) |
| Official exam | Each exam of the plan's groups is a checkpoint, and the latest is the plan's last. Block ends after it are dropped. Slots after a group's exam get no lesson and no spare lesson; the proposal says "N lessons after the official exam" |
| Past spare lessons | A spare lesson dated before today is dropped from the new snapshot. It is not history and not in the check-in, unless she edited it (`FlexEdit`), when it stays as `assumed` |
| Her M1b actions after a plan exists | Confirming an event or cancelling lessons still changes slots at once. The plan is then out of date (also when a head placement sits on a slot that is no longer usable) and moves only when she accepts a preview |
| Web tools | No M2 skill uses web tools. M7, the first web skill, records a live run and adds `--allowedTools` only if it needs it, updating this file, ADR-007 and the planner `CLAUDE.md` together |
| Images to the CLI | Task 2.8 refuses every attachment. Task 2.20 Step 1 is a spike; if it works it amends ADR-007 and the flag set here in the same commit |
| Live Claude | Tests and CI never spawn `claude`. Steps that need it run locally, by the controller with Alberto, and say so |

## File structure

Everything below is under `prototypes/ai_teacher_planner/`.

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  biome.json  vitest.config.ts
scripts/start.ts                 build if stale, start the API, open the browser
packages/domain/src/             the engine (pure)
  dates.ts calendar.ts timetable.ts slots.ts audit.ts reminders.ts permissions.ts
  provenance.ts                                                                        M1 (M2 extends it)
  corrections.ts events.ts exams.ts breaks.ts todos.ts                                 M1b
  scheme.ts lessons.ts plan.ts sequence.ts pace.ts history.ts revisions.ts pack.ts
  fit.ts timetable-diff.ts                                                             M2
  disruptions.ts reflow.ts parity.ts catchup.ts reimport.ts                            M3 (events.ts exists)
  hl.ts hl-sequence.ts hl-helper.ts pack-to-items.ts                                   M4
  moves.ts views.ts explain.ts                                                         M5
  coverage.ts assessments.ts                                                           M6
  index.ts                       re-exports the public surface
packages/importers/src/
  calendar/ (read-calendar, day-off-findings, tidy-findings)  reports/  loose-date.ts
  sha256.ts resources-available.ts                                                     M1, M1b
  pack/  planning/  assessment-schedule/                                               M2
  resources/  pptx/                                                                    M7
packages/exporters/src/          xlsx/ teams/ (M2)  docx/ pptx/ (M8)
packages/ai/src/                 port.ts fake.ts claude-cli.ts registry.ts skills/     M2
packages/content-creator/src/    refresher.ts cover-lesson.ts independent-task.ts      M7
apps/api/src/
  main.ts app.ts config.ts today.ts errors.ts test-support.ts
  db/ (connection.ts migrate.ts backup.ts schema.ts migrations/NNNN_name.sql)
  repos/ (ports.ts sqlite/*.ts)
  gateway/resource-gateway.ts
  routes/ (router.ts require-access.ts schemas.ts test-reset.ts ...)
  usecases/ (planning.ts first-run.ts reset-to-seed.ts today-view.ts ...)
  jobs/queue.ts  materials/ (M2)
apps/web/src/
  main.tsx routes.tsx
  api/ (client.ts queries.ts)
  lib/ (dates.ts possible.ts utils.ts)
  theme/ (tokens.css group-colours.ts)
  components/ui/                 shadcn components (states.tsx)
  components/                    AppShell, GroupBadge (M1); LessonCard, ProposalDiff, AiBadge, ProvenancePopover,
                                 WhyPopover, ActivityDrawer, JobChip, Legend (M2 on)
  screens/                       today/ board/ audit/ setup/ (M1), scheme/ (M2), parity/ hl/ coverage/
                                 assessments/ resources/ (later)
features/                        NN-name.feature (spec section 17), m1-*.feature, m1b-*.feature, m2-*.feature
fixtures/                        package @planner/fixtures
  timetable.2026-27.json  terms.2026-27.json  groups.2026-27.json  external-exams.2026-27.json
  courses.2026-27.json (M2)  ai/ (M2)
  src/ (synthetic-calendar-model.ts synthetic-calendar.ts seed.ts domain-source.ts feature-file.ts
        pace-world.ts synthetic-pack.ts synthetic-planning.ts synthetic-spec-pdf.ts fake-ai.ts)
  deny-canary/                   exists already; do not touch
e2e/                             Playwright, playwright-bdd steps, axe helper
data/                            git-ignored: planner.sqlite, backups/, packs/, uploads/, materials/
```

Package names: `@planner/domain`, `@planner/importers`, `@planner/exporters`, `@planner/ai`, `@planner/content-creator`, `@planner/api`, `@planner/web`, `@planner/fixtures`, `@planner/e2e`. Each exports its source: `"exports": { ".": "./src/index.ts" }`. Relative imports carry the `.ts` or `.tsx` extension.

Dependency direction: `domain` imports nothing. `importers`, `exporters`, `ai` and `content-creator` import `domain`. `api` imports all of them. `web` imports `domain` and the API's types only.

## Conventions

**Commands** (run in `prototypes/ai_teacher_planner/`):

| Command | Does |
|---|---|
| `pnpm install` | Install the workspace |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | `biome check .` |
| `pnpm test` | Every unit, property and scenario test |
| `pnpm test <path or name>` | One file or one test |
| `pnpm build` | Build the web app |
| `pnpm e2e` | Browser tests against a seeded temporary data folder |
| `pnpm start` | Build if needed, start the API on `127.0.0.1:4319`, open the app |
| `pnpm seed:synthetic --data-dir <dir>` | Fill a data folder from the synthetic fixtures |

**Environment variables:** `PLANNER_DATA_DIR` (default `./data`), `PLANNER_RESOURCES_DIR` (default `../resources`), `PLANNER_PORT` (default `4319`), `PLANNER_AI` (`claude`, `fake` or `off`; default `claude`), `PLANNER_TIME_ZONE` and `PLANNER_NO_OPEN` (both described in the planner `CLAUDE.md`), and two for tests only: `PLANNER_FIXED_TODAY` and `PLANNER_TEST_ROUTES`.

**Routes.** Paths use the `{param}` syntax of `@hono/zod-openapi` (`/api/packs/{courseId}`), never `:param`. Each write route spreads `...guard(<resource>, "edit")` into `createRoute`; `routes.test.ts` fails any write route without it. Resources: packs, scheme, scheme import and lesson-count jobs use `scheme-of-work`; positions, plans, check-in, lesson notes, materials and the timetable image use `lesson-plans`. AI job start and cancel use `lesson-plans` on the route, and the review use case also checks the handler's own `resource` with `can()`.

**Reuse, do not redefine.** Domain: `bySlotOrder`, `versionOn`, `teachingBlocks`, `disruptionHitsSlot`, `lessonsHitBy`, `disruptionsFromEvents`, `possibleDisruptions`, `possibleTextsFor`, `lastDaysBeforeBreaks`, `auditSlots(...).lastLesson` (open slots only; the sequencer's last usable slot includes cover, so it needs its own one-liner with another name). Importers: `sha256Hex`, `parseLooseDate(text, academicYear)`, `ImportFinding`, `FindingKind`. API: `ApiError`, `createRouter`, `guard`, `schemas.ts` (`isoDate`, `period`, `slot`), `testConfig`, `migratedDb`, `fakeGateway`, `syntheticGateway` (extend them in `apps/api/src/test-support.ts`, never copy). Web: `call()`, the `InferResponseType` pattern in `api/queries.ts`, `groupColour`, `GroupBadge`, `components/ui/states.tsx`, `lib/dates.ts`.

**Migrations** are applied by sorted file name and the runner records the name. M1b reached `0007_todos.sql`. M2 uses `0008_ai.sql` (Task 2.9), `0009_scheme_plans.sql` (Task 2.12), `0010_ai_run_note.sql` (Task 2.14 fix) and `0011_lesson_notes.sql` (Task 2.17b); later milestones take the next free number. A task that adds Drizzle tables also updates the mirror comment at the top of `db/schema.ts`.

**Feature tags.** A scenario whose browser steps arrive in a later task is tagged `@engine @e2e @e2e-later`; the playwright config filters `@e2e and not @e2e-later`, so `pnpm e2e` stays green. The task that writes the browser steps removes `@e2e-later`.

**Test-first, every task.** Write the tests the task lists, run them, and see them fail for the reason given. Then implement. Then run them again. A test shown as a name with an empty body or a one-line comment is still a required test: write its assertions from the name, the comment and the task's rules. Where a value matters, the plan gives it.

**The finish line, every task.** `pnpm typecheck && pnpm lint && pnpm test` passes. If the task touched `apps/web` or `e2e/`, `pnpm e2e` passes too. Then one commit with the message the task gives. Tasks do not repeat these lines.

**Where tests live**

- Unit tests beside the code: `foo.ts` and `foo.test.ts`. Property tests: `foo.prop.test.ts`.
- Scenario tests: `features/NN-name.feature` is the Gherkin; the steps are `*.steps.test.ts` in the package that owns the behaviour, loaded with `loadFeature(featureFile("NN-name"))` and `describeFeature` from `@amiceli/vitest-cucumber`.
- Scenarios tagged `@e2e` also run in the browser through playwright-bdd, with steps in `e2e/steps/`.
- Golden tests on Gemma's real files are named `*.golden.test.ts`, start with `describe.skipIf(!resourcesAvailable())`, and so run on her Mac and skip in CI. They assert counts and dates only, and print no cell text.
- Every screen's e2e test ends with the axe helper `expectNoSeriousViolations(page)`.

**Identifiers**

| Thing | Form | Example |
|---|---|---|
| Course and plan | slug | `ial-business-u4`, `ib-business`, `igcse-business` |
| Scheme item | slug, stable across re-imports | `ch26`, `a-ch26`, `p-unit1-podcast` |
| Lesson | `${itemId}#${n}`, n from 1 | `ch26#2` |
| Spare lesson | `flex:${groupId}:${checkpointId}#${n}` | `flex:13 1:cp:a-ch26#1`, `flex:13 1:cp:revision#2` |
| Slot | `${groupId}\|${date}\|${period}` | `13 1\|2027-01-08\|6` |
| Checkpoint | `cp:${itemId}`, `cp:block:${blockId}`, `cp:exam:${code}` or `cp:revision` | `cp:a-ch26`, `cp:block:T1b`, `cp:exam:WBS14 01`, `cp:revision` |

Exam checkpoints use the exam's `code`, never its id: exam ids are random (`x:<uuid>`) and differ on every machine and after a re-seed.

**Web tasks.** A web task names the screen, what it shows, the states it must handle (loading, empty, error, AI unavailable) and its browser test. Component breakdown and visual detail are the builder's, inside spec section 12. Find elements in tests by role and accessible name, not by test id.

**Skills for teacher-side AI actions** (`.claude/skills/<id>/SKILL.md`). Follow superpowers:writing-skills: run the task once with a bare instruction and a synthetic input, note what is wrong with the output, then write the skill to fix exactly that, then run it again. The Zod schema in `packages/ai/src/skills/<id>.ts` is the source of truth; `schema.json` beside the `SKILL.md` is generated from it and a test fails when it is stale. Live runs are local only: `pnpm ai:try <skillId> <input.json>`.

**Milestone gate.** The last task of each milestone: the milestone's scenarios pass in the engine and, where tagged, in the browser; axe is clean on its screens; a pass through its scenarios with the `claude-in-chrome` skill saves screenshots to `docs/design/ai-teacher-planner/screens/mN-<screen>.png` (synthetic data only); diagrams and both `CLAUDE.md` files are true; the milestone is tagged `planner-mN`; the PR checklist is ticked.

## Shared contract

These names and shapes are used across tasks. The task that introduces each one is shown. Bodies are the implementer's.

### M1: calendar, timetable, slots

```ts
// dates.ts
export type IsoDate = string;                       // "YYYY-MM-DD"
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;    // ISO, Monday = 1
export function isIsoDate(s: string): boolean;
export function addDays(d: IsoDate, n: number): IsoDate;
export function weekdayOf(d: IsoDate): Weekday;
export function mondayOf(d: IsoDate): IsoDate;
export function daysBetween(a: IsoDate, b: IsoDate): number;   // b - a
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[]; // inclusive

// calendar.ts
export type WeekLabel = "W1" | "W2";
export type YearGroup = 7 | 8 | 9 | 10 | 11 | 12 | 13;
export interface YearCells { events: string | null; communication: string | null; assessments: string | null; assessmentsALevel: string | null; assessmentsIb: string | null }
export interface CalendarRow { date: IsoDate; rawLabel: string | null; weekLabel: WeekLabel | null; afterSchool: string | null; datesOfImportance: string | null; secondaryEvent: string | null; byYear: Partial<Record<YearGroup, YearCells>>; hash: string }
export interface Term { id: "T1" | "T2" | "T3"; firstPupilDay: IsoDate; lastPupilDay: IsoDate }
export type DayKind = "pupil" | "weekend" | "outside-term" | "unlabelled" | "holiday";   // "holiday": labelled day marked official/school holiday (Task 1.14b)
export interface CalendarDay { date: IsoDate; weekLabel: WeekLabel | null; kind: DayKind; pupilDay: boolean; text: string | null }
export function toCalendarDays(rows: readonly CalendarRow[], terms: readonly Term[], corrections?: readonly LabelCorrection[]): CalendarDay[];   // corrections: M1b; CalendarDay gains labelSource
export interface LabelIssue { kind: "mixed-labels-in-week" | "labels-do-not-alternate"; weekOf: IsoDate; detail: string }
export function checkLabels(days: readonly CalendarDay[]): LabelIssue[];
export interface TeachingBlock { id: string; termId: Term["id"]; from: IsoDate; to: IsoDate }   // id "T1a", "T1b", ...
export function teachingBlocks(days: readonly CalendarDay[], terms: readonly Term[]): TeachingBlock[];
export interface Fortnight { w1: IsoDate | null; w2: IsoDate | null; breakBefore: boolean }       // Mondays
export function fortnights(days: readonly CalendarDay[]): Fortnight[];

// timetable.ts
export type Period = 1 | 2 | 3 | 4 | 5 | 6;
export type GroupId = string;
export type CourseId = string;
export interface TimetableEntry { week: WeekLabel; weekday: Weekday; period: Period; groupId: GroupId; room: string | null }
export interface DutyEntry { week: WeekLabel; weekday: Weekday; period: Period; label: string }
export interface TimetableVersion { id: string; validFrom: IsoDate; entries: TimetableEntry[]; duties: DutyEntry[] }
export interface Group { id: GroupId; yearGroup: YearGroup; programme: "IGCSE" | "IB" | "A level"; courseId: CourseId; track: "core" | "hl"; colour: string }
export const PERIOD_TIMES: Record<Period, { start: string; end: string }>;
export function validateTimetable(v: TimetableVersion, groups: readonly Group[]): string[];
export function lessonsPerFortnight(v: TimetableVersion): Record<GroupId, { W1: number; W2: number; total: number }>;

// slots.ts
export type SlotKey = string;
export type SlotStatus = "open" | "cancelled" | "cover";
export interface SlotReason { disruptionId: string; text: string; source: "calendar" | "teacher" }
export interface Slot { key: SlotKey; groupId: GroupId; date: IsoDate; period: Period; weekLabel: WeekLabel; room: string | null; status: SlotStatus; reasons: SlotReason[]; doubleWith: SlotKey | null }
export type DisruptionScope = { kind: "school" } | { kind: "year"; yearGroup: YearGroup } | { kind: "group"; groupId: GroupId } | { kind: "teacher" };
export interface Disruption { id: string; scope: DisruptionScope; from: IsoDate; to: IsoDate; periods: Period[] | null; effect: "cancelled" | "cover"; reason: string; source: "calendar" | "teacher" }
export function slotKey(groupId: GroupId, date: IsoDate, period: Period): SlotKey;
export function buildSlots(input: { days: readonly CalendarDay[]; timetables: readonly TimetableVersion[]; groups: readonly Group[]; disruptions: readonly Disruption[] }): Slot[];

// audit.ts, reminders.ts, permissions.ts: see Tasks 1.3, 1.5 and 1.13
// As built in M1: the API's AppDeps also carries `gateway: ResourceGateway` and `principal: Principal`; the board's
// `boardFor(fortnight, days, slots, timetables[])` returns BoardWeeks with `mixed` and `labels` (no single `label`);
// the seed lives at the `@planner/fixtures/seed` subpath. M1b adds corrections.ts, events.ts, exams.ts, breaks.ts.
```

### M2: scheme, lessons, plans

```ts
// provenance.ts (exists since M1b as a string union; Task 2.1 renames that union to Origin and adds the object)
export type Origin = "engine" | "ai" | "teacher" | "import";
export type ReviewState = "suggested" | "accepted" | "edited" | "rejected";
export interface Source { url: string; title: string | null; opened: boolean }
export interface Provenance { origin: Origin; ai: { runId: string; provider: string; model: string; skillId: string; at: string; sources: Source[]; review: ReviewState } | null }
// EventClassification.provenance becomes `Origin` (values unchanged, "teacher" in M1b, no migration). M3 Task 3.2 decides whether it widens to Provenance.

// scheme.ts
export type ItemKind = "teaching" | "project" | "revision" | "buffer" | "assessment";
export interface AssessmentSpec { date: IsoDate | null; type: string; marks: number | null; durationMinutes: number | null; slotUse: "whole" | "in-lesson"; status: "planned" | "sat"; covers: string[] /* teaching item ids */ }
export interface SowItem { id: string; courseId: CourseId; order: number; kind: ItemKind; title: string; lessons: number; track: "core" | "hl"; packRefs: string[]; prerequisites: string[]; availableFrom: IsoDate | null /* used from M4 */; note: string | null; assessment: AssessmentSpec | null; provenance: Provenance }
export interface GroupOverride { groupId: GroupId; itemId: string; lessons: number }
// There is no course record in M1b: courses exist only as Group.courseId. Task 2.12 adds one:
export interface Course { id: CourseId; title: string; board: "IAL" | "IB" | "IGCSE"; revisionWeeks: number }   // seeded from fixtures/courses.2026-27.json by firstRun, like groups; stored in 0009_scheme_plans.sql. `board` is the exam board; Group.programme stays as it is

// lessons.ts
export type LessonId = string;
export interface Lesson { id: LessonId; itemId: string; index: number; of: number; kind: Exclude<ItemKind, "assessment"> | "flex" }
export function expandLessons(items: readonly SowItem[], overrides: readonly GroupOverride[], groupId: GroupId, track: "core" | "hl"): Lesson[];

// plan.ts: decisions, facts and the snapshot
export type Pin =
  | { id: string; groupId: GroupId; lessonId: LessonId; kind: "slot"; slotKey: SlotKey }
  | { id: string; groupId: GroupId; lessonId: LessonId; kind: "not-after"; date: IsoDate };
export interface Merge { id: string; groupId: GroupId; first: LessonId; second: LessonId }
export interface Position { groupId: GroupId; nextLessonId: LessonId | null; doneItemIds: string[]; asOf: IsoDate }
export interface LessonLogEntry { seq: number /* the lesson_log row id, only grows; for one placement the highest seq wins, recordedOn plays no part; the engine and the board sort by it */; groupId: GroupId; lessonId: LessonId; slotKey: SlotKey | null; outcome: "taught" | "cover" | "skipped" | "homework"; recordedOn: IsoDate; note: string | null }
export interface CoverChoice { slotKey: SlotKey; choice: "keep" | "swap" | "lost"; swapLessonId: LessonId | null }   // used from M3
export interface HomeworkMode { groupId: GroupId; lessonId: LessonId }                                              // used from M3
export interface PaceHold { id: string; checkpointId: string; firstDeferredLessonId: LessonId }                     // used from M3
export interface FlexEdit { flexId: LessonId; title: string | null; purpose: "exam-practice" | "support" | "independent-study" | "revision" | null }   // "revision" is shown as "Revision and exam practice"
export type PlacementState = "planned" | "assumed" | "taught" | "cover" | "homework" | "skipped" | "declared";
export interface Placement { groupId: GroupId; lessonId: LessonId; slotKey: SlotKey | null; state: PlacementState; pinned: boolean; mergedInto: LessonId | null; viaCover: boolean }
export interface AssessmentPlacement { groupId: GroupId; itemId: string; slotKey: SlotKey; slotUse: "whole" | "in-lesson" }
export interface Checkpoint { id: string; kind: "assessment" | "block-end" | "revision" | "exam"; date: IsoDate; label: string; itemId: string | null; perGroupDate?: Record<GroupId, IsoDate> /* revision: each group's first revision slot date */ }
export interface Overflow { checkpointId: string | null /* null when the plan has no checkpoint */; groupId: GroupId; lessonIds: LessonId[] }
export type Conflict =
  | { kind: "assessment-no-slot"; groupId: GroupId; itemId: string; date: IsoDate /* the assessment's date; today for an undated one */ }
  | { kind: "position-unknown"; groupId: GroupId; lessonId: LessonId }   // her position names a lesson not in the scheme: nothing is planned for the group
  | { kind: "pin-lesson-unknown"; pinId: string; groupId: GroupId; lessonId: LessonId; slotKey: SlotKey | null }   // slotKey is null for a not-after pin
  | { kind: "pin-frozen"; pinId: string; groupId: GroupId; lessonId: LessonId; slotKey: SlotKey }   // a slot pin would move a lesson in the freeze horizon; it stays. Message: "This lesson is in the next two teaching days, so it stays where it is."
  | { kind: "anchor-frozen"; groupId: GroupId; itemId: string; date: IsoDate; slotKey: SlotKey }   // a dated assessment in the freeze horizon was re-dated to another slot; it stays on `slotKey`. Message: "This assessment is in the next two teaching days, so it stays where it is."
  | { kind: "pin-slot-unavailable"; pinId: string; groupId: GroupId; lessonId: LessonId; slotKey: SlotKey }
  | { kind: "not-after-missed"; pinId: string; groupId: GroupId; lessonId: LessonId; date: IsoDate; plannedDate: IsoDate | null }
  | { kind: "hl-prerequisite"; groupId: GroupId; lessonId: LessonId; prerequisiteItemId: string; finishesOn: IsoDate | null };   // from M4
export interface PlanSnapshot { courseId: CourseId; today: IsoDate; placements: Placement[]; assessments: AssessmentPlacement[]; checkpoints: Checkpoint[]; overflow: Overflow[]; absorbed: { groupId: GroupId; lessonId: LessonId; checkpointId: string }[]; conflicts: Conflict[] }
// absorbed: a buffer lesson dropped to make room, with its checkpoint. Once that checkpoint is before today the buffer is used up (spec 10.4): carryHistory carries it from `previous` into the new snapshot's `absorbed` and it is never planned again; one absorbed at a checkpoint still ahead can come back if the loss goes away (Task 2.12 fix round)
export interface PlanInputs { courseId: CourseId; today: IsoDate; groups: Group[]; slots: Slot[]; blocks: TeachingBlock[]; items: SowItem[]; overrides: GroupOverride[]; positions: Position[]; log: LessonLogEntry[]; pins: Pin[]; merges: Merge[]; coverChoices: CoverChoice[]; homework: HomeworkMode[]; holds: PaceHold[]; flexEdits: FlexEdit[]; previous: PlanSnapshot | null; exams: ExternalExam[] /* the plan's groups only; ExternalExam is from M1b exams.ts */; revisionWeeks: number }
// Task 2.3 adds `exams` and `revisionWeeks`; Task 2.12's loadPlanInputs fills them (revisionWeeks from Course).

// sequence.ts
export function sequence(inputs: PlanInputs): PlanSnapshot;

// pace.ts (Task 2.3): the pace line, called by `sequence` once per track
export interface StreamAssessment { kind: "assessment"; id: string /* the item id */; itemId: string }   // an undated whole-slot assessment uses a slot in the stream
export type StreamEntry = Lesson | StreamAssessment;
export interface WindowPlan { checkpoint: Checkpoint; perGroup: Record<GroupId, { slots: SlotKey[]; required: LessonId[]; broughtForward: LessonId[]; spare: number; short: LessonId[]; absorbed: LessonId[] /* buffer lessons dropped to make room */ }> }
export function planWindows(args: { groups: readonly Group[]; checkpoints: readonly Checkpoint[] /* sorted inside */; streams: Record<GroupId, readonly StreamEntry[]>; windowSlots: (groupId: GroupId, checkpoint: Checkpoint) => SlotKey[]; requiredBefore: (checkpoint: Checkpoint) => Set<string>; canonical: Lesson[]; itemOrder: readonly string[] /* the track's item ids in scheme order: items are ranked by their place in the scheme */ }): WindowPlan[];   // a short group is short alone: the run is computed from the groups that are not short (spec 10.6)
export function finalContentIndex(checkpoints: readonly Checkpoint[]): number;   // revision, else the first exam, else the last checkpoint: everything left is due there, later windows are spare only
export function byCheckpointOrder(a: Checkpoint, b: Checkpoint): number;          // date, then kind (assessment, block-end, revision, exam), then id

// revisions.ts
export interface PlanDiffEntry { groupId: GroupId; lessonId: LessonId; change: "moved" | "added" | "removed" | "state" | "correction"; from: SlotKey | null; to: SlotKey | null; fromState: PlacementState | null; toState: PlacementState | null; hitByDisruption: boolean; slotGone: boolean /* Task 2.17 fix: the old slot is not in `slots` at all; implies hitByDisruption */ }
export interface PlanDiff { entries: PlanDiffEntry[]; changedByGroup: Record<GroupId, number> }
export interface PlanMetrics { perGroup: Record<GroupId, { placed: number; spare: number; overflow: number; lastContentDate: IsoDate | null; officialExam: { code: string; date: IsoDate } | null }> }
export function sameExceptHistoryStates(a: PlanSnapshot, b: PlanSnapshot): boolean;   // via snapshotKey of a copy with history states normalised, except `skipped` (a skip is a change); Task 2.12's upToDate uses it
export function isUpToDate(args: { head: PlanSnapshot; fresh: PlanSnapshot /* sequence of today's inputs on top of head */; slots: readonly Slot[]; flexEdits: readonly FlexEdit[] }): boolean;   // Task 2.12: sameExceptHistoryStates(fresh, the head as of fresh.today: past planned lessons assumed, past spare lessons, assessments and checkpoints gone), and every head lesson or assessment from today still on a usable slot
export interface Proposal { planId: string; baseRevisionId: string | null; label: string; candidate: PlanSnapshot; diff: PlanDiff; before: PlanMetrics | null; after: PlanMetrics; conflicts: Conflict[] }
export function diffSnapshots(before: PlanSnapshot | null, after: PlanSnapshot, slots: readonly Slot[]): PlanDiff;
export function planMetrics(s: PlanSnapshot, slots: readonly Slot[]): PlanMetrics;
export function propose(args: { planId: string; baseRevisionId: string | null; head: PlanSnapshot | null; inputs: PlanInputs; label: string }): Proposal;

// pack.ts (types only; the Zod schema is in packages/importers/src/pack/schema.ts)
export interface PackUnit { id: string; code: string; title: string; inScope: boolean }
export interface SpecPoint { id: string; unitId: string; code: string; title: string; level: "core" | "hl-only"; page: number | null }
export interface PackChapter { id: string; unitId: string; number: string; title: string; specPointIds: string[]; hlOnly: boolean; page: number | null }
export interface CurriculumPack { schemaVersion: 1; courseId: CourseId; board: string; subject: string; version: string; units: PackUnit[]; specPoints: SpecPoint[]; chapters: PackChapter[]; source: { fileName: string; pages: number }; lockedAt: string | null; hash: string | null }
// importers: hashing is async (Web Crypto, through sha256Hex)
export function packHash(pack: CurriculumPack): Promise<string>;
export function lockPack(pack: CurriculumPack, now: Date): Promise<CurriculumPack>;
export function isLockedAndIntact(pack: CurriculumPack): Promise<boolean>;

// fit.ts (Task 2.12; pure, runs `sequence`): the one rule for "does it fit"
export interface GroupFit { groupId: GroupId; lessonsLeft: number; slotsLeft: number; fits: boolean; over: number }
export function fitFor(inputs: PlanInputs): GroupFit[];
```

```ts
// API (apps/api), as built from M1: AppDeps = { config, db, now, gateway, principal, webDir? }; M2 adds `ai: AiProvider | null`
// (main.ts picks it from config.ai; test-support passes null unless a test gives a FakeAiProvider).
// Route factories take small context objects ({ repos, now }, { config, repos, gateway, now }), not AppDeps.
export function loadPlanInputs(repos: Repos, packs: PackStore, courseId: CourseId, today: IsoDate): PlanInputs;   // built on loadPlanning(repos); never calls buildSlots
// ResourceGateway.find(pattern: "calendar-workbook" | "timetable-image" | "planning-files"); "planning-files" returns allowlisted .xlsx and .docx under <ial|ibdp|igcse>/Planning/
// GET /api/placements?from&to returns { placements, assessments }; the web's PlacementView and AssessmentView are the InferResponseType of it (api/queries.ts)
// Web board: BoardOptions gains `cards?: ReadonlyMap<SlotKey, CardModel>` and BoardCell gains `card: CardModel | null` (Task 2.17)
```

### AI port (M2, `packages/ai/src/port.ts`)

```ts
export type SkillId = "planner-import-timetable" | "planner-build-curriculum-pack" | "planner-classify-calendar-events" | "planner-suggest-lesson-counts" | "planner-hl-prerequisites" | "content-refresh-resource" | "content-cover-lesson" | "content-independent-task";
export interface AiTask<T> { skillId: SkillId; input: unknown; text: string | null; attachments: { path: string; mediaType: string }[]; schema: z.ZodType<T>; tools: ("WebSearch" | "WebFetch")[] }
export interface AiMeta { provider: string; model: string; skillId: SkillId; startedAt: string; durationMs: number; sources: Source[] }
export interface AiResult<T> { data: T; meta: AiMeta }
export type AiProgress = { kind: "started" } | { kind: "working"; note: string } | { kind: "done" } | { kind: "failed"; reason: string };
export interface AiProvider { id: string; available(): Promise<{ ok: true } | { ok: false; reason: string }>; run<T>(task: AiTask<T>, opts: { signal: AbortSignal; onProgress: (p: AiProgress) => void }): Promise<AiResult<T>> }
export class AiError extends Error { reason: "unavailable" | "signed-out" | "timeout" | "invalid-output" | "cancelled" | "failed" }
```

```ts
// apps/api (Task 2.9): jobs and item handlers take a context, not AppDeps
export interface JobContext { repos: Repos; ai: AiProvider | null; now: () => Date; config: Config }
export interface AiItem { id: string; runId: string; kind: string; target: string; courseId: CourseId | null; data: unknown; review: ReviewState; reviewedAt: string | null; sources: Source[] }
export interface ItemHandler { kind: string; resource: Resource; toItems(output: unknown, input: unknown): { target: string; courseId: CourseId | null; data: unknown }[]; apply(item: AiItem, ctx: JobContext): Promise<void> }
export function startJob(ctx: JobContext, request: { skillId: SkillId; input: unknown; text: string | null; attachments: string[] }): AiRun;
// `AiItem.courseId` lets Task 2.19 leave out only the pending items of the course being exported.
// Task 2.14: a `lesson-count` item's data is `{ itemId, title, from, to, reason, tricky }` (`to` is the suggested count, 1 to 99; `from` is her number when asked, and accepting refuses with 409 if the scheme's count is no longer `from`).
// `ItemHandler.report?(output, input)` gives a counts-only sentence for the finished run's `note` (AiRun gains `note: string | null`, never a failure). Handlers are registered where the app is built (`registerLessonCountHandler()` in createApp).
```

### Later milestones

The engine functions added in M3 to M6 are defined in the task that introduces each, in that milestone's file: `strandedPlacements`, `eventCandidates`, `previewChange`, `parity`, `catchUpOptions`, `diffCalendar` (M3); `hlStatus`, `eligibleAt`, `teachableAt`, `runway` (M4); `moveTargets`, `itemSpans`, `explainPlacement` (M5); `coverage`, `assessmentEntries`, `assessmentWarnings` (M6).

## Scenario map

| # | Scenario | Feature file | Engine steps in | Browser |
|---|---|---|---|---|
| 1 | Cycle from the calendar | `01-cycle-from-calendar` | Task 1.3 | Task 1.11 |
| 2 | Two-day week | `02-two-day-week` | Task 1.3 | |
| 3 | One-day week | `03-one-day-week` | Task 1.3 | |
| 4 | Staff days | `04-staff-days` | Task 1.3 | |
| 5 | Schedule from my documents | `05-schedule-from-documents` | Task 2.3 (domain, `paceWorld`) and Task 2.13 (`apps/api`, full year) | Task 2.21 |
| 6 | The worked example | `06-worked-example` | Task 3.4 | Task 3.9 |
| 7 | Absence | `07-absence` | Task 3.3 | Task 3.7 |
| 8 | Undo | `08-undo` | Task 2.5 | Task 2.17 |
| 9 | Pins survive | `09-pins-survive` | Task 5.1 | Task 5.2 |
| 10 | HL prerequisites | `10-hl-prerequisites` | Tasks 4.2 and 4.3 | Task 4.6 |
| 11 | Coverage | `11-coverage` | Task 6.3 | Task 6.5 |
| 12 | Resource refresher | `12-resource-refresher` | Task 7.4 | Task 7.7 |
| 13 | AI is marked and reviewed | `13-ai-marked-reviewed` | Task 2.19 | Task 5.7 |
| 14 | The allowlist holds | `14-allowlist` | Task 1.7 | |
| 15 | Report reminder | `15-report-reminder` | Task 1.5 | Task 1.12 |
| 16 | Re-import | `16-reimport` | Task 3.6 | Task 3.8 |

M1b feature files (`features/m1b-*.feature`, each also run in the browser by `pnpm e2e`, with axe checks in both themes):

| Feature file | What it proves |
|---|---|
| `m1b-cancelled` | "Lessons were cancelled": photo day takes one lesson, removing it puts the lesson back, an empty range is refused, typed text is shown as text |
| `m1b-corrections` | Her corrections: day off confirmed from the import report, undo, week label corrected, notes outside the year folded away |
| `m1b-events` | Calendar events: nothing is cancelled until she confirms, the Year 13 mock week, study leave lasting to the end of the year, undo |
| `m1b-exams-audit` | The audit groups lost lessons by reason, lists last lessons and official exams, study leave moves the last lesson; Setup lists, adds and removes exams |
| `m1b-board` | Board class filter, one-week view, the last day before the holiday marked on the board and on Today |
| `m1b-todos` | To-do notes on Today: for today or the week, undone notes carry over, removal, typed text never run |

Write each feature file with the wording of spec section 17, in the task that first needs it.

## Go-live data

Gemma described where each group is on 23 Nov 2026 (spec appendix D). Each course's gate task enters those positions in Setup with her, on her real data, after the automated checks pass. They are never hard-coded and never put in a fixture.
