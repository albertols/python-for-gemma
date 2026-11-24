# AI Teacher Planner v1 — Design Spec

**Date:** 2026-11-19
**Status:** Approved by Alberto on 24 Nov 2026. Gemma's answers of the same day are folded in, and every change made after approval is listed in appendix D. The task-level plan is in [`docs/superpowers/plans/`](../plans/2026-11-24-ai-teacher-planner-v1.md).
**Branch:** `ai-planner-v1`
**Inputs:** `prototypes/ai_teacher_planner/src/ai_teacher_planner/template_prompt.md` (Gemma, Parts 1 to 10) and `master_prompt_for_plan.md` (Alberto, nine delivery points)
**Diagrams:** [`docs/design/ai-teacher-planner/`](../../design/ai-teacher-planner/README.md)
**Decisions:** ADR-006 to ADR-016 in [`docs/adr/`](../../adr/)

Two labels are used throughout, as the template asks. **ASSUMPTION** marks something chosen without Gemma's or Alberto's word; section 22 lists them all. **UNVERIFIED** marks a claim about a product, exam board or tool that could not be checked.

---

## 1. Intent

Gemma teaches Business to six groups across three curricula on a two-week timetable. Every week she rebuilds, by hand, the answer to one question: *what am I teaching each group in each lesson, given the syllabus, the calendar, and what has already happened?* She listed 585 minutes a week of planning pain. Most of it is calendar arithmetic that a computer can do exactly, plus a few judgement calls where a language model helps.

The planner does the arithmetic by fixed rules she can trace, asks Claude only for the judgement calls, and shows her in the interface which parts Claude produced. It runs on her own Mac, costs nothing beyond her existing Claude subscription, and keeps school files on her machine.

## 2. Who it is for, and how we will know it worked

**User in v1:** Gemma, alone, on her laptop. Alberto reviews and maintains.

Her pains, in her ranking, and what v1 does about each:

| Rank | Pain (template 3.2) | Min/week | v1 answer |
|---|---|---|---|
| 1 | Syllabus to scheme of work to timetable | 120 | Sequencing onto real lesson slots (M2) |
| 2 | Planning the IB HL-only lessons | 90 | HL helper: teachable now, unlocks on a date, blocked (M4) |
| 3 | Keeping three parallel IAL groups in sync | 60 | Shared pace line, parity tracker (M2, M3) |
| 4 | Realigning after missed lessons | 70 | Reflow preview and catch-up options (M3) |
| 5 | Planning around holidays | 45 | The calendar drives every date (M1) |
| 6 | Keeping resources current | 40 | Resource refresher (M7) |
| 7 | Compromised past papers | 40 | Out of scope: AI Examiner prototype |
| 8 | AI-resistant activities | 120 | Partly: independent-task skill (M7) |

v1 addresses ranks 1 to 6, about 425 of 585 minutes.

**Success measures** (ASSUMPTION: proposed targets for Gemma to confirm):

- Planning the next fortnight for all six groups takes under 15 minutes.
- "What can I teach IB H next?" is answered in under a minute.
- After an absence, the replanned fortnight is accepted in under 5 minutes.
- The slot audit screen matches her own timetable count for every half-term, with no wrong date found in class.
- She can check a course's syllabus mapping once, in one sitting, and not again.

## 3. Goals, non-goals, anti-goals

**Goals**

1. A dated lesson plan for every group that respects the school calendar, the two-week cycle and her teaching order.
2. Parallel groups stay level by design, and drift is visible early with ways to fix it.
3. The plan stays true: what was taught is recorded with almost no effort.
4. Every date and count is explainable from her own calendar and timetable.
5. AI help is clearly marked, always reviewed by her, and replaceable by another provider later.
6. The codebase is modular enough to grow into a wider platform for teachers, students and parents.

**Non-goals for v1**

- Logins, hosting, or any user other than Gemma.
- Student, parent or Head of Department views (template 6D).
- Storing student names, marks, or SEND information.
- Microsoft 365, SIMS, Toddle or Teams integration. Teams export is copy-ready text.
- Generating fresh exam papers (feature 11, AI Examiner).
- Activity-idea library (9), differentiation (10), reflection log (14).

**Anti-goals** (it fails if any of these is true, even if everything works)

- She spends longer checking the plan against the syllabus than planning by hand (template 3.4).
- Suggestions are generic, at the wrong level, or repetitive.
- The plan changes without her seeing and accepting the change.
- She cannot tell which parts came from a model.
- A student's name or work reaches a model or a commit.

## 4. Hard rules

These override everything else. If a task conflicts with one, stop and say so.

- **MUST NOT** send credentials, passwords or Microsoft tokens to any model, or commit them.
- **MUST NOT** put real student names or student work in anything a model sees, in fixtures, or in git.
- **MUST NOT** store student personal data in v1.
- **MUST** have Gemma review every AI-generated item before it can be exported or shown to students.
- **MUST NOT** republish exam-board material as the app's own. Board documents may be read locally and cited.
- **MUST NOT** apply any change to a plan without a preview she accepts.
- **MUST NOT** let a model write to disk or to the database. Models return data; the app stores it.
- **MUST** read school files only through the allowlist (section 14).
- **MUST NOT** weaken the deny rules in `.claude/settings.json`.

## 5. Constraints

| Constraint | Source | Effect |
|---|---|---|
| MacBook Air M1, 8 GB RAM, 37 GB free | Measured | No Docker, no database server, no dev server in daily use, one browser-test worker |
| Budget: free | Template 9.3 | AI through her Claude subscription via the Claude Code CLI; no API key |
| TypeScript and React, modular | Template 9.1 (Alberto) | See ADR-006. ADR-005 is reserved for Gemma's own write-up (template 11.1) |
| School files stay on the Mac | Template 9.1, 9.2 | Local-first; resources folder is git-ignored |
| No Homebrew or sudo | Measured | Tools installed with mise into `~/.local` |
| Learnable in 5 to 10 minutes | Template 10.3 | One command to start; first-run tour; the board looks like her timetable |
| Works offline for everything except AI | Template 10.3 | API and data are local; AI features degrade gracefully |
| Subscription sign-in covers personal local use only | Claude Code docs, 19 Nov 2026 | Any shared deployment needs an API-key or other provider adapter (ADR-007) |

## 6. Approaches considered

| Approach | What it is | Trade-off | Verdict |
|---|---|---|---|
| **A. Local full-stack TypeScript** | React app, small local Node API, SQLite file, pure-TS engine shared by both, AI behind a provider port | Needs one local process; most moving parts of the three local options | **Chosen** by Alberto, 19 Nov 2026 |
| B. Browser-only app, AI in a terminal | No backend; data in the browser; AI only by running Claude Code skills by hand | Lightest and best offline, but no AI buttons in the GUI, weak access to the resources folder and Office exports | Rejected: breaks the 5-minute learning goal and delivery point 2 |
| C. Hosted platform from day one | Next.js, Postgres, logins and roles, deployed | Ready for student views, but needs paid API keys, school data-protection sign-off, and is by far the largest build | Rejected: conflicts with "free" and with keeping data on the Mac |

A keeps the door to C open: roles are modelled now, the AI provider is swappable, and storage sits behind repository ports.

## 7. Scope of v1

"Engine" means fixed rules, no model. "AI" items carry the AI badge and need review.

| # | Feature | Template ref | Made by | Milestone |
|---|---|---|---|---|
| 1 | Calendar import with an import report, and a slot audit screen | 2.3, 5 | Engine | M1 |
| 2 | Timetable grid: seeded, editable, optional image upload | 2.2, 4.1 | Engine; AI for image upload | M1; image upload in M2, with the AI layer |
| 3 | Today screen: today's lessons, report deadlines, parents' evenings, weekly check-in | 6C #13, 8.5 | Engine | M1, M2 |
| 4 | Scheme of work per course in her order, lessons per topic | 6A #1 | Import; AI suggestions as differences from her numbers | M2 |
| 5 | Sequencing onto real lesson slots per group | Story 1 | Engine | M2 |
| 6 | Fortnight board shaped like her timetable | 6A #3 | Engine | M1 read-only, M5 editing |
| 7 | Parity tracker and catch-up options | 6A #2, story 2 | Engine; AI drafts a chosen task | M3 |
| 8 | Lost-lesson reflow as a preview | 6A #5 | Engine | M3 |
| 9 | IB HL-only helper | Pain 2 | Engine checks; AI proposes the prerequisite map | M4 |
| 10 | Coverage checklist: taught and assessed per spec point | 6A #4 | Engine; mapping AI-assisted, reviewed once | M6 |
| 11 | Assessment calendar, clash warnings, two-per-term rule | 6C #12, 5.2 | Engine | M6 |
| 12 | Resource refresher | 6B #7, story 3 | AI | M7 |
| 13 | Cover lesson | 6A #6 | AI | M7 |
| 14 | AI-resistant independent task | 6B #8 | AI | M7 |
| 15 | Exports: Excel, Word, PowerPoint, Teams-ready text | 6C #15 | Engine | Thin in M2, full in M8 |

## 8. The data v1 starts from

All verified by opening the files on 19 Nov 2026, except where marked.

**Timetable** (`timetable.png`): two weeks, Monday to Friday, six 55-minute periods (P1 08:45, P2 09:40, P3 11:15, P4 12:10, P5 14:35, P6 15:30). Lessons per fortnight: 11D 5 (three in Week 1, two in Week 2); IB H 4; IB S 6; 13 1, 13 3 and 13 5 six each. Some lessons are double periods. Other cells are study-hall duty (`400`), form time, lunch duties or free.

**Calendar** (`2026-27 Secondary Calendar ALL STAFF.xlsx`, sheet `Calendar 2026-27`): one row per day. Columns: Month, Date, Day, `Week1/2`, After school meetings, Dates of importance, Secondary event, then Events / Communication / Assessments for each year group. 91 days are labelled Week 1 and 94 Week 2.

- The label is authoritative. It is not a simple alternation of calendar weeks: 12 Feb is Week 2 and school returns on 22 Feb as Week 1; 21 to 22 Dec is a two-day Week 2; Friday 8 Jan alone is a Week 1.
- Holidays appear as "School Holiday" or "Official Holiday" in Secondary event with a blank label.
- Staff-training days before 4 Sept carry a label although pupils are absent.
- The data has noise: an `x` in the label column, a row with the wrong weekday, and report dates whose weekday or year is wrong.
- Shape, re-checked on 24 Nov 2026: the header is the second row, with the year-group names in the row above it. The sheet starts on 5 Jul 2026 and its July rows skip days. Months are spelled `Sept`, `April` and `June` as well as in three-letter forms. There are no merged cells.
- The school edits this workbook during the year.

**Other tabs:** `Report deadlines` (by year group and, for Years 12 and 13, by programme: report name, SIMS columns, teacher data deadline, HoD review, sent home), `Parents eves`, `AssRep 26_27` (one row per week with cycle number; a cross-check on the labels). `IBDP calendars` only names two workbooks that are not in the folder.

**Terms:** 4 Sep to 22 Dec 2026; 8 Jan to 19 Mar 2027; 5 Apr to 29 Jun 2027.

**Planning sheets:** IAL Unit 4 and IGCSE Y11 each list textbook chapters with a "Number of Classes" (the IAL chapters add up to 70 and the sheet states 65; see appendix D). Assessment schedules are Word tables of date (no year), chapter, type. The IB outline is prose per unit with week ranges that contradict each other. **None of them records what has been taught.**

**Specifications:** all three PDFs have a text layer. IAL Unit 4 has 16 sub-topics that match textbook chapters 22 to 37 one to one, in order. IGCSE maps several chapters to one spec point. IB marks HL-only content in sub-topic titles and in bold. Only the IB content folders are named by spec code; IAL and IGCSE folders use chapter numbers.

**Teaching order** differs from spec order for IGCSE (Y11: Units 3, 2, 5) and IB (Y12: Units 1, 4, part of 3).

## 9. Architecture

Full-size diagrams: [containers](../../design/ai-teacher-planner/02-containers.svg), [backend](../../design/ai-teacher-planner/03-backend-components.svg), [frontend](../../design/ai-teacher-planner/04-frontend-components.svg).

```mermaid
flowchart LR
    W["🖥️ Web app<br/>React + Vite"]:::concept --> A["⚙️ Local API<br/>Node + Hono"]:::concept
    W --> D["🧮 Engine<br/>pure TypeScript"]:::concept
    A --> D
    A --> S["🗄️ SQLite file<br/>on the Mac"]:::win
    A --> G["🚧 ResourceGateway<br/>allowlist"]:::warn
    G --> R["📁 Teaching resources<br/>git-ignored"]:::win
    A --> P["🔌 AiProvider port"]:::ai
    P --> C["🤖 Claude Code CLI<br/>her sign-in"]:::ai
    P -.-> F["🧪 Fake provider<br/>tests and CI"]:::concept
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

A pnpm workspace under `prototypes/ai_teacher_planner/`. The existing Python package beside it (`calendar_reader.py`, `models.py`, its test) is untouched.

| Path | Role |
|---|---|
| `packages/domain` | The engine: types, calendar, slots, sequencing, revisions, parity, reflow, coverage, HL eligibility, reminders, permission matrix. Pure. |
| `packages/importers` | Calendar workbook, planning sheets, assessment schedules, resource index, text extraction |
| `packages/exporters` | Excel, Word, PowerPoint, Teams text |
| `packages/ai` | `AiProvider` port, Claude CLI adapter, fake adapter, skill registry |
| `packages/content-creator` | Resource refresher, cover lesson, independent task (ADR-015) |
| `apps/api` | HTTP routes, use cases, SQLite repositories, job queue, `ResourceGateway`; serves the built web app |
| `apps/web` | React app |
| `features/` | Gherkin scenarios |
| `fixtures/` | Synthetic calendar and curriculum; her timetable grid as the seed (appendix A); the deny-rule canary |
| `e2e/` | Browser tests |
| `data/` | Git-ignored: database, backups, curriculum packs, uploads |

**Rules the code must keep**

1. **The engine is pure.** Dates are `YYYY-MM-DD` strings; `today` is an argument; no clock, randomness, disk or network. The package declares no IO dependencies and no DOM or Node types, and a lint rule blocks such imports.
2. **Models never write and never read school folders.** They receive text and return JSON, which the API validates and stores.
3. **Files are read only through `ResourceGateway`.**
4. **Nothing is applied silently.** Every plan change is a proposal with a diff.
5. **The API binds to 127.0.0.1 only.**

**Stack** (versions seen and, where marked, proven by spike on 19 Nov 2026; pinned exactly at install):

| Layer | Choice |
|---|---|
| Runtime | Node 26 LTS through mise; pnpm 12 (spike) |
| Language | TypeScript 7.0, strict; Biome for lint and format (spike) |
| Web | React 19, Vite 8 (spike), Tailwind 4, shadcn/ui, TanStack Query. Router left to the builder |
| Moving cards | Keyboard "Move to…" first; pointer drag with `@dnd-kit/react` behind one adapter |
| API | Hono 4 with `@hono/zod-openapi`, Zod 4 (spike) |
| Data | SQLite through better-sqlite3 and Drizzle 0.45 (spike) |
| Tests | Vitest 5, `@amiceli/vitest-cucumber`, fast-check (spike); Playwright on the installed Chrome, playwright-bdd, axe |
| Office files | exceljs, mammoth, fflate + fast-xml-parser, `docx`, pptxgenjs. The npm `xlsx` package is excluded: two unpatched high advisories |
| PDF text | pdfjs-dist, used only by the pack-building command to pull text and page numbers out of a specification (section 10.12) |
| Diagrams | D2 0.9 through mise (proven) |

## 10. The engine

Diagrams: [domain model](../../design/ai-teacher-planner/05-domain-model.svg), [scheduling pipeline](../../design/ai-teacher-planner/06-scheduling-pipeline.svg).

### 10.1 Calendar

- Read the `Week1/2` label **per date**. Never compute it.
- Find columns by header text, not position.
- Build each date from the Month and Date cells and the academic year in the sheet title: July to December fall in the first year, January to June in the second. Check continuity (each row is the previous day plus one) and report every break; the current file has four, all in July. Take the weekday from the date, not the Day column.
- A day is a **pupil day** when it has a label and falls inside a term. Term dates are seeded from the calendar and she can edit them in Setup. A labelled day inside a term that is marked staff-only (4 May and 29 Jun 2027 in the current file) becomes a whole-school disruption once she confirms it (section 10.2), so the lessons it removes stay visible in the slot audit.
- Within one Monday-to-Friday week every labelled day must share one label, and labelled weeks must alternate. A breach is reported.
- Everything odd goes into an **import report** the teacher sees: unknown tokens, wrong weekdays, merged cells, dates that disagree with their weekday. Nothing is guessed.
- `AssRep 26_27` is read as a cross-check on the labels.

### 10.2 Slots

For each pupil day, the timetable version active on that date gives each group's periods for that label and weekday. A **slot** is one group, one date, one period.

**Disruptions** remove or change slots. Scope: whole school, year group, group, or teacher. Effect: `cancelled` or `cover`. Each keeps its reason and source (the calendar row text, or "entered by teacher"). Cancelled slots are still emitted, so the board and the audit screen can show every lost lesson and why.

One period is one unit. A double period is two adjacent units with no break between them (periods 1 and 2, 3 and 4, or 5 and 6), drawn joined. Confirmed by Gemma on 24 Nov 2026.

Year-group events in the calendar (mocks, trips, study leave) are free text. Fixed keyword rules pre-sort them and a skill suggests the rest, but an event cancels lessons **only after Gemma confirms it**. Each distinct wording is asked once and remembered. Unconfirmed events show as a "possible disruption" marker on the board.

### 10.3 Lessons, slots, placements

- A **scheme-of-work item** is a chapter or topic with a number of lessons, a project (such as the IB Unit 1 podcast project), or an assessment, revision or buffer item.
- A **lesson** is "item 4, lesson 2 of 6". Parallel groups share lesson identities; that is what makes parity measurable.
- A **placement** puts one lesson in one slot. Its state is one of:
  - `planned`: in the future.
  - `assumed`: its date has passed and she has not said otherwise. Counted as delivered, shown differently.
  - `taught`, `cover`, `homework`, `skipped`: confirmed by her.
  - `declared`: before go-live, at topic level (section 10.9).
- Two lessons may be **merged** into one slot. A group may have a per-item override ("13 3 does chapter 26 in five lessons").

### 10.4 What is stored

Three layers, kept apart:

- **Facts** are things that happened or will happen whatever she plans: imported calendar rows, disruptions (a closure, an absence), and the **lesson log** (what the weekly check-in records: this lesson was taught, was cover, was skipped). Facts are saved as soon as she records them.
- **Decisions** are her choices: scheme of work, lesson counts, pins, per-group overrides, confirmed event meanings, positions.
- **Revisions** are accepted plans. The engine derives placements from facts and decisions; each plan she accepts is saved as an immutable snapshot of those placements with a pointer to its parent. Placements are never edited in place.

A **plan** covers one course and the groups that follow it: IAL Unit 4 with 13 1, 13 3 and 13 5; IB with IB S and IB H; IGCSE with 11D. Each plan has its own chain of revisions and its own undo.

Preview, diff, undo and audit all come from the revision chain. A year is about 1,200 placements, so snapshots are cheap. (ADR-010.)

### 10.5 Sequencing

From each group's current position:

1. Freeze the past and the **freeze horizon** (today and the next teaching day).
2. Place **anchors**: dated assessments, pinned lessons, "not after" deadlines.
3. Stream the remaining lessons, in scheme order, into the remaining slots.
4. **Buffer** items absorb lost lessons, so one lost lesson changes nothing beyond the next buffer.
5. Anything that does not fit is listed as **overflow** at its checkpoint, with a count.

An anchor that cannot be honoured is a **conflict** shown to her, never a silent move. Moving a card by hand creates a pin and re-sequences the rest; that is how her edits survive.

The same inputs always give the same plan.

**Lessons are packed early.** Content fills the first free slots, with no gaps left on purpose. The engine never invents a content lesson. Slots left over are handled in section 10.6.

**Buffers are hers.** A buffer or revision item exists only if it is in her scheme of work, such as the "Exam Practice & Revision" row in her IGCSE sheet.

**Dated assessments.** Her schedules give a date with no year and the three IAL groups do not all teach on the same days. So for each group an assessment anchors to that group's first available slot **on or after** the date, and is a conflict if none falls within seven days. The year is inferred from the term the date falls in.

Her "Number of Classes" counts teaching lessons only (confirmed 24 Nov 2026), so assessments are extra and totals are shown as "65 teaching + N assessment". The counts are a guide she adjusts: a Unit 4 chapter normally takes one to two weeks. Not every assessment fills a period: a 12-mark IAL question takes 18 minutes, at 1.5 minutes a mark. So each assessment has a length in minutes, suggested from its marks. One of 30 minutes or more takes a whole slot. A shorter one is **in-lesson**: it is attached to the lesson in that slot and uses no slot of its own. She can switch either way. ASSUMPTION: 30 minutes is the right dividing line.

### 10.6 Parallel groups: the pace line

A **checkpoint** is a point every group should reach together. Dated checkpoints are dated assessments, half-terms and term ends. Unit ends are checkpoints for reporting only.

Between two dated checkpoints, each group has some number of slots. Shared content for that window is planned to the count of the group with the fewest. Every group places those lessons in its earliest slots. A group's remaining slots in the window become **flex lessons**, placed at the end of the window, just before the checkpoint. A flex lesson is a labelled placeholder that she can retitle or move. In the interface it is called a **spare lesson**, with a one-line explanation, because "flex lesson" meant nothing to her. She suggested using them for exam practice, activities for a support session, or independent study, so those are the purposes offered. ASSUMPTION (open question 11, still open): the end of the window is where she wants them.

Flex lessons are also that group's cushion. If a group with a flex lesson loses a slot, the flex lesson is what disappears and its content is untouched. A group with none comes up short at the checkpoint, and that is what the parity tracker flags.

Parity is then built in instead of repaired, and each group's totals for the year are known in September.

For 11D, her two colleagues' classes act as a virtual group defined by the department's assessment dates.

**Made precise for the build (24 Nov 2026).** The content that must be finished before a dated assessment is everything that precedes that assessment in her scheme order. For each group, slack is the slots it has before the assessment minus the lessons of that content it still has to teach. If every group has slack, the next lessons in the scheme are brought forward, as many as the tightest group can fit, and whatever slots a group still has left become flex lessons. If a group has negative slack, that group alone is short at the checkpoint: the others keep their plan and are not slowed down unless she picks that catch-up option. Before a half-term or term end there is no required content, so the rule reduces to the count of the group with the fewest.

### 10.7 Parity

Groups overtake each other inside any fortnight, so a raw daily gap is noise. The tracker reports:

- **Slack before each checkpoint:** slots available minus lessons required, per group. Example: "before 13 Nov: 13 1 +1, 13 3 −2, 13 5 0".
- **Gap at checkpoints**, and between them only when it exceeds the timetable's normal **jitter** (the largest gap an undisrupted cycle produces).
- **Teacher-led lessons missed per unit.** In her own example (template 3.3) the two absent groups nominally covered the chapter through cover work. What they lost was her support and the exam practice. Position alone would have hidden that.

**Catch-up options** are computed, each as a candidate revision with before-and-after numbers: use a buffer; hold the leading groups on consolidation; condense by merging two lessons (her own suggestion for a group that missed one); set one as flipped work or homework; or wait, with the date the timetable closes the gap by itself. A model only writes the content for an option she has already chosen.

**What a cover lesson does to the plan.** When she is absent and the class has cover, she chooses one of three, each shown as a diff:

1. **Keep the planned lesson as cover work** (default). The lesson stays in its slot, delivered as independent work, and the group's position moves on. "Teacher-led lessons missed" goes up by one. This is what she did in template 3.3.
2. **Swap in a lesson that suits independent work**, and teach the planned one when she is back.
3. **Treat the slot as lost.** Cover does revision; the planned lesson and everything after it move on.

ASSUMPTION (open question 12): option 1 is the right default.

### 10.8 Reflow

A change produces a **proposal**: a candidate revision, a diff, metrics before and after, and conflicts. A change that touches several plans, such as a whole-school closure, produces one proposal per plan, shown together and accepted together or one at a time. A change scoped to one course never alters another course's plan.

**Facts and plans are separate.** A disruption is a fact; how to re-plan around it is a choice. When she enters one she sees the preview and picks:

- **Record and apply an option:** the fact is saved and the chosen candidate becomes the head revision.
- **Record, decide later:** the fact is saved. Lessons now sitting on cancelled slots are marked **stranded**, and the plan is flagged out of date until she chooses.
- **Cancel:** nothing is saved. This is also how she explores a "what if".

Accepting swaps the head revision only if it has not changed in the meantime. **Undo** returns the plan to the parent revision. It does not delete the fact, so the affected lessons show as stranded again. Deleting a fact entered by mistake is its own change, with its own preview.

**The freeze horizon** is today and the next teaching day. Sequencing never moves a lesson into or out of it on its own, so tomorrow's lesson cannot change because of an edit elsewhere. The one exception is a lesson whose own slot has just been hit by a disruption she recorded; those are listed first in the diff.

Never in a diff: confirmed, assumed or declared history; pinned slots; dated assessments. When she later says a past lesson did not happen, that is a new fact: the lesson re-enters the stream and the change is labelled a correction to history.

### 10.9 The past, and keeping it true

No file records what she has taught since September. Inventing dates for each past lesson would be false precision. Instead:

- Per group she gives a **position** (the next lesson) and a **done-list** for anything taught out of order, such as the HL topics already covered.
- Sat assessments from her schedules are dated facts.
- The past is drawn as topic bands marked **declared**, visibly different from lessons she later logs.
- A **weekly check-in** on the Today screen asks "did these happen as planned?" with one click per group, and a quick way to say what changed. Each answer is written to the lesson log.
- A planned lesson whose date passes without an answer becomes `assumed`. It counts as delivered, so the plan keeps moving, but it is drawn differently and coverage says "assumed" until she confirms.
- Forward planning always starts at the first lesson that is neither confirmed, assumed nor declared.

Without the check-in, parity and coverage drift from reality.

### 10.10 IB: core and HL extension

One course, two tracks, two slot streams: IB S (everyone, common content) and IB H (HL students, HL-only content).

- HL-only items carry **prerequisites** on core items. An item is **eligible** for an IB H slot when all its prerequisites finish in IB S before that slot.
- Outputs: a ranked **"teachable now, and why"** list; an **"unlocks on"** date for each blocked item; a **runway** figure comparing eligible lessons with the next fortnight's four IB H slots.
- A **fallback pool** (prerequisite-free HL topics, IA preparation from February, Paper 3 preparation, exam skills) fills slots when nothing is eligible. HL students sit a Paper 3 mock beside the Paper 2 mock towards the end of Year 12, so the helper also shows how many IB H slots remain before it.
- When IB S slips, the affected IB H lessons are flagged with alternatives.
- v1 proposes a draft fill per fortnight that she confirms.

The prerequisite map is curated content, not code: a skill proposes it with reasons, she reviews it once, and it is locked.

**Where the IB scheme comes from.** Her IAL and IGCSE sheets give a class count per chapter. Her IB outline gives only hours per unit, in prose. So for IB: the pack supplies the sub-topics; she sets the teaching order; unit totals come from her outline; and `planner-suggest-lesson-counts` proposes the split across sub-topics within each unit's total, marked as AI, for her to edit. This is the one place AI proposes whole counts, and it is what she asked for in template 6A #1.

### 10.11 Coverage

The links from textbook chapters to spec points live inside the locked pack (section 10.12), many to many, reviewed once. A scheme-of-work teaching item points at one or more of the pack's chapters or topics. She can reorder items and change counts freely; she cannot change what a chapter covers without a new pack version. A teaching item that points at nothing in the pack is shown as "not linked to the specification".

- **Taught:** none, partial (m of n linked items), or taught. The basis is shown: declared, logged, or cover.
- **Assessed:** a sat assessment that names a linked chapter, labelled "chapter-level", because one 20-mark question does not assess a chapter.
- A spec point with no link is **unmapped**, never "not taught". A course cannot be used until nothing is unmapped.
- Units taught in other years are **out of scope**, so they are not shown as gaps.
- "Taught, never assessed" is raised at unit end, not before.

### 10.12 Curriculum packs

One JSON file per course: units, topics, spec points, HL-only flags, textbook chapters, chapter-to-spec links, page references. Validated against a schema, hashed and locked. No general PDF parser is built; only the calendar gets a repeatable importer, because only the calendar changes during the year. Packs live in `data/` and are not committed (ADR-016).

Building a pack is two steps, and only the second is a screen:

1. **Draft, as an assisted command.** A command in `packages/importers` pulls the text and page numbers out of the allowlisted specification PDF. The `planner-build-curriculum-pack` skill turns that text into a draft pack. This happens three times in v1 (once per course), so it gets a command, not a wizard.
2. **Review and lock, in the app.** A screen shows the draft as a tree with the page reference beside every point. She confirms or corrects each unit, then locks it. This screen is where her trust in the mapping is earned, so it is built properly in M2 and reused in M4 and M6.

### 10.13 Re-import

Imported rows are stored by date with a hash. Her confirmations and disruptions sit in a separate layer. A re-import is a three-way comparison (last import, new import, her layer) whose slot changes go through reflow. Importing the same file twice changes nothing.

### 10.14 Invariants (each becomes a property test)

- No slot on an unlabelled or non-pupil day.
- An undisrupted full week yields exactly the timetable's count for its label.
- Adding a disruption never adds a slot; disruption order does not matter.
- Each lesson is placed at most once; one lesson per slot unless merged.
- Unpinned lessons keep scheme order; every pin is honoured or reported.
- Placed plus overflow equals the total.
- History is identical before and after any reflow.
- Undo after accept restores the previous plan exactly.
- Delaying core content never makes an HL item eligible earlier.
- Every in-scope spec point is in exactly one coverage state.

## 11. The AI layer

Diagram: [AI flow](../../design/ai-teacher-planner/07-ai-flow.svg).

**Provider port.** `run(task)` takes a skill id, a JSON input, extracted text, optional image attachments, a Zod schema and a tool list. It returns validated data and metadata: provider, model, duration, sources. Attachments may only come from `data/uploads/`, where a file lands when she uploads it herself; the timetable image is the only v1 use.

**Claude adapter.** Proven by spike on 19 Nov 2026 with Claude Code 2.1.326:

```
claude -p "<inlined skill prompt + input>" --model <alias> \
  --tools "" --setting-sources "" --strict-mcp-config --disallowedTools "mcp__*" \
  --permission-mode dontAsk --output-format stream-json --verbose \
  --json-schema '<schema>' --no-session-persistence  < /dev/null
```

with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` removed from the environment, so a stray key can never turn a free run into a billed one.

- It signed in with her subscription, loaded none of this repo's ten plugins or their hooks, exposed only the structured-output tool, and returned schema-valid JSON.
- Measured: about 3 seconds with no tools; about 30 seconds with web search.
- `claude auth status` returns JSON the adapter uses to check sign-in at start-up.
- One job at a time. Progress is streamed to the GUI.
- Every engine feature works when AI is unavailable.

**Known risk.** The docs say `--bare` will become the default for `-p`, and bare mode ignores the subscription sign-in. No opt-out is documented yet (UNVERIFIED how a subscription run will continue to work). The port isolates this to one file.

**Skills** live in `.claude/skills/`. Each has a prompt, an output schema and examples. The adapter inlines the prompt, so the same skill works from the GUI, in a terminal session, and later with another provider.

| Skill | Purpose | Tools in headless runs |
|---|---|---|
| `planner-import-timetable` | Timetable image to grid | Image passed as input; no folder access |
| `planner-build-curriculum-pack` | Spec text to units, topics, spec points, HL-only flags, chapter links | none |
| `planner-classify-calendar-events` | Which event wordings cancel which groups' lessons | none |
| `planner-suggest-lesson-counts` | Counts and tricky-topic flags, as differences from her sheet | none |
| `planner-hl-prerequisites` | Prerequisite map and pairings for HL-only topics, with reasons | none |
| `content-refresh-resource` | Current-event slide suggestions with sources and insertion points | WebSearch, WebFetch |
| `content-cover-lesson` | Independent work towards the missed lesson's objectives | none |
| `content-independent-task` | AI-resistant task by year-group policy, PBLT structure | none |

**Standing rule** (delivery point 1): when a teacher-side AI action has been done by hand more than twice, promote it to a skill with a schema and register it.

**Quality rules for every skill**

- Use the right exam board's vocabulary, command words and assessment objectives. Generic output is a defect.
- Cite a source for every factual claim about the world; label anything not opened as unverified.
- Never include a student's name or invent one.
- For the refresher: prefer the last twelve months; pass in what was suggested before, so nothing repeats; never alter the original file.

**Provenance.** Every stored item records its origin: `engine`, `ai`, `teacher`, or `import`. AI items also record provider, model, skill, time, sources and a review state: `suggested`, `accepted`, `edited`, `rejected` (ADR-008).

## 12. The interface

Diagram: [frontend](../../design/ai-teacher-planner/04-frontend-components.svg).

**Design language:** dark by default with a light option; calm and spacious; laptop first. Cards are coloured by group, taking the colours from her timetable and adjusting them for contrast. References she chose: Planboard's week view and day/week/month switch, Trello's cards, Notion's calm pages. Not SIMS.

**Screens**

| Screen | What she does there |
|---|---|
| **Today** (first screen) | Today's lessons with times and rooms; this week's reminders; the weekly check-in; "a lesson was lost" shortcut |
| **Fortnight board** | Week 1 and Week 2 side by side, laid out exactly like `timetable.png`, with real dates. Also day, week, month and unit views |
| **Scheme of work** | Topics in her order with lesson counts, each also shown as weeks for that group; totals against available slots per group, recalculated as she types |
| **Parity** | Slack per checkpoint, gaps, teacher-led lessons missed, catch-up options |
| **Slot audit** | Lessons per group per half-term, and every lost lesson with the calendar text that caused it |
| **IB HL helper** | Teachable now, unlocks on, blocked; runway; draft fill |
| **Coverage** | The spec tree with taught and assessed states |
| **Assessments and reports** | All groups' assessments, clashes, report deadlines, parents' evenings |
| **Resources** | Chapters and their PowerPoints; refresher suggestions awaiting review |
| **Setup** | Calendar import and report, timetable grid, courses and packs, positions |

**The fortnight.** A fortnight is a Week 1 calendar week and the Week 2 week that follows it. Holiday weeks between them appear as a thin divider. Days outside term or without a label are greyed.

**How AI shows up** (delivery point 2)

- AI content awaiting review: a sparkle icon and a dashed outline. Accepted: a small sparkle. Edited by her: sparkle and pencil. The icon carries the meaning, not colour alone.
- A popover names the provider, model, skill, time and sources.
- Engine output has no badge. The legend says: *everything without the sparkle is calculated from your calendar and timetable.* A "Why is this here?" popover on any lesson shows the rule and its inputs.
- "Declared" and "logged" history look different.
- An activity drawer lists every AI run. A header chip shows a running job and its progress.
- Unreviewed AI items are left out of exports, with a warning that says so.

**Moving lessons.** A keyboard "Move to…" command is the primary path; pointer drag is the second. Any move shows its effect as a proposal before it is applied.

**Accessibility:** keyboard access to everything, visible focus, contrast of at least 4.5 to 1, no meaning carried by colour alone, automated axe checks on every screen.

```mermaid
flowchart LR
    A["📥 Import calendar<br/>read the report"]:::concept --> B["🗓️ Confirm timetable"]:::concept
    B --> C["📚 Choose course<br/>review the pack once"]:::ai
    C --> D["📍 Say where each<br/>group is today"]:::concept
    D --> E["✅ Accept the<br/>proposed plan"]:::win
    E --> F["🧭 Weekly check-in<br/>and reminders"]:::win
    F -.->|"absence or closure"| G["⚠️ Reflow preview"]:::warn
    G --> E
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

## 13. Roles and permissions

v1 has one user. The permission matrix from template Part 7 is still built into the engine and tested, with a fixed teacher principal, so logins can be added without redesign.

| Feature or data | Teacher | Student | Parent | Admin | Head of Dept |
|---|---|---|---|---|---|
| Scheme of work | Edit | – | – | – | Edit |
| Lesson plans and cards | Edit | – | – | – | View |
| Chapter PowerPoints | Edit | – | – | – | – |
| Independent tasks | Edit | View (own group only) | – | – | – |
| Assessment calendar | Edit | – | – | – | Edit |
| Report calendar | Edit | – | – | – | View |
| Exam practice questions | Edit | – | – | – | – |
| Mark schemes | Edit | – | – | – | – |
| Parity and coverage | Edit | – | – | – | – |
| Cover lessons | Edit | – | – | – | – (never before the absence is notified) |
| Accounts and roles | Edit | – | – | Edit | – |

ASSUMPTION: the cells Gemma marked ⚠️ or left blank are treated as no access.

```mermaid
flowchart LR
    T["🧑‍🏫 Teacher<br/>edits everything"]:::win --> P["🗂️ Plans, tasks,<br/>assessments"]:::concept
    H["👩‍💼 Head of Dept<br/>later"]:::concept -.->|"view, not cover lessons"| P
    S["🎓 Student<br/>later"]:::concept -.->|"own group's tasks only"| P
    X["👪 Parent<br/>not planned"]:::warn -.->|"no access"| P
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
```

## 14. Data boundary, privacy and copyright

Diagram: [data and privacy](../../design/ai-teacher-planner/08-data-and-privacy.svg). Decision: ADR-011.

- **`prototypes/resources/` never enters git.** It is 5 GB and 2,661 files, and it includes student work in folders named after students, scanned exams and reports. The ignore rule is fixed and the four files that had been pushed are no longer tracked.
- **App allowlist.** `ResourceGateway` reads only: the calendar workbook and `timetable.png` at the folder root; the `Planning` folders; the three specification PDFs; `1. Content/**/PP`; the per-topic exam-practice folders. A test proves a path outside the list cannot be read.
- **Models receive extracted text**, never a folder path and never a whole textbook. The one exception is an image she uploads herself for the timetable import.
- **Deny rules** in `.claude/settings.json` stop interactive Claude sessions opening the student-work folders. Tested on 19 Nov 2026: a canary path with spaces and an ampersand was refused, as were probes into three of the real folders. A deny rule stops Claude's file tools, not a script, which is why the allowlist is the real guard.
- **No student data in v1.** An assessment stores a status and an optional class-level note such as "evaluation weak on the 20-marker".
- **Copyright.** Curriculum packs are built locally from her own copies and stay in `data/`. Tests use a synthetic curriculum. Exports cite sources.
- **Uploads** (a timetable image) go to `data/uploads/`.
- **Backups.** The database is copied automatically before each migration and daily, with a few generations kept.

## 15. Exports

| Format | Content |
|---|---|
| Excel | The fortnight in her timetable's shape; the scheme of work with dates per group; the coverage checklist |
| Word | A weekly plan; a cover-lesson sheet |
| PowerPoint | Accepted refresher slides, with sources in the notes and "insert after slide N". The original file is never changed |
| Teams | Copy-ready text for a class post |

A thin Excel week and the Teams text ship in M2, because she lives in Office all day. Every export states which items came from AI and when she reviewed them.

## 16. Non-functional requirements

| Quality | Requirement |
|---|---|
| Speed | Everyday actions feel instant: the engine also runs in the browser. AI jobs show progress |
| Offline | Everything except AI works with no internet |
| Accessibility | Section 12 |
| Privacy | Section 14 |
| Time to learn | 5 to 10 minutes: one command to start, a first-run tour, a board that looks like her timetable |
| Trust | Every date traceable; nothing applied silently; undo always available |
| Data safety | Automatic backups; migrations; database outside git |
| Footprint | Runs beside Chrome and PyCharm on 8 GB |

## 17. Acceptance scenarios

These become Gherkin files in `features/`. Scenarios 5, 7 and 12 are Gemma's own from template Part 10, made concrete.

1. **The cycle comes from the calendar.** Given 12 Feb 2027 is labelled Week 2 and 15 to 19 Feb are school holidays, when I open the week of 22 Feb, then it is Week 1 and each group has its Week 1 lessons.
2. **A two-day week.** Given 21 and 22 Dec 2026 are labelled Week 2, then only the Monday and Tuesday Week 2 lessons exist that week.
3. **A one-day week.** Given Friday 8 Jan 2027 alone is labelled Week 1, then 13 1 has one lesson that week, in period 6, and no other group has any.
4. **Staff days.** Given 1 Sep 2026 is labelled Week 1 and marked staff training, then no group has a lesson that day.
5. **Story 1: a schedule from my documents.** Given the calendar, my timetable and the IAL Unit 4 scheme with my class counts, when I choose 13 1, 13 3 and 13 5 and my teaching order, then I see a dated schedule per group in which every lesson sits on a real lesson of that group, no lesson falls on a holiday, chapter order is kept, each chapter shows its spec reference, the teaching-lesson total matches my sheet (70 across chapters 22 to 37, of which 65 are for this year: chapter 22's five were taught in Year 12), and spare lessons appear as flex lessons before each assessment.
6. **The worked example.** Given the three groups are planned to finish a topic before a dated assessment, and 13 3 has no flex lesson in that window, and 13 3 loses a lesson to a closure, when I open the parity tracker, then 13 3 shows as one lesson short before that assessment and I am offered at least one catch-up option. (With a flex lesson in the window, the flex lesson is lost instead and nothing is short.)
7. **Story 2: absence.** Given I was absent Tuesday to Thursday and two groups had cover, when I enter the absence, then I see a preview with the three cover choices, which topics are affected, how many teacher-led lessons each group loses, and options to realign; and I can record the absence and decide later, in which case the affected lessons are marked stranded and nothing else moves.
8. **Undo.** Given I accepted a reflow, when I undo it, then the plan is exactly as before.
9. **Pins survive.** Given I moved a lesson to a chosen slot, when a later closure triggers a reflow, then that lesson stays where I put it.
10. **HL prerequisites.** Given an HL-only topic needs a core topic that finishes on 9 Dec, when it is placed in an IB H slot on 2 Dec, then it is flagged and I am shown what is teachable instead.
11. **Coverage.** Given a unit has ended and one of its spec points has no sat assessment, then that point shows "taught, never assessed".
12. **Story 3: resource refresher.** Given a chapter PowerPoint, when I ask for an update, then I get suggested slides with real, recent, opened sources and where to insert each, marked as AI, and my original file is unchanged.
13. **AI is marked and reviewed.** Given an AI suggestion I have not reviewed, then it shows the sparkle and dashed outline, and it is left out of an export with a warning.
14. **The allowlist holds.** Given a path inside a student-work folder, when anything asks the gateway for it, then it is refused.
15. **Report reminder.** Given the Year 11 long-report data deadline is 30 Nov 2026, when I open Today on 20 Nov, then the reminder is shown with the days remaining.
16. **Re-import.** Given I import the same calendar twice, then nothing changes; given the school adds a closure, then I get a reflow preview and my confirmed events are kept.

## 18. Engineering practice

- **Spec first.** This document, then a task-level plan in `docs/superpowers/plans/`, then code.
- **BDD.** Section 17 as Gherkin, run against the engine under Vitest and, for the main journeys, in a browser.
- **TDD.** A failing test before each piece of code. Section 10.14 as property tests.
- **Fixtures.** A synthetic calendar reproduces the real one's traps for CI: the two-day week, the lone Friday, the stray `x`, a wrong weekday, merged cells, labelled staff days.
- **Golden tests on her real files**, run locally and skipped when the folder is absent: 91 and 94 labelled days; 22 Feb is Week 1; slot counts of 5, 4, 6, 6, 6, 6.
- **Browser validation from the first screen.** Playwright on the installed Chrome, one worker, axe checks. Then an agentic pass with Claude in Chrome through each acceptance scenario, saving screenshots into `docs/design/ai-teacher-planner/screens/`.
- **CI.** A Node job beside the Python job: install, type-check, lint, unit and scenario tests, build, browser tests with the fake provider, diagram freshness. CI needs neither her files nor Claude.
- **Docs.** Any change to modules, ports, routes, the data model, the AI flow or the stack updates its diagram in the same commit (ADR-014).

**Definition of done** (ASSUMPTION until Gemma answers template 11.3): scenario written and passing; tests written first; type-check and lint clean; no real names or student data in fixtures or commits; AI output has provenance and a review step; diagrams updated; validated in Chrome with a screenshot; Gemma has clicked through it.

## 19. Milestones and roadmap

Diagram: [roadmap](../../design/ai-teacher-planner/10-roadmap.svg). One course end to end at a time: IAL Unit 4, then IB, then IGCSE.

| M | Goal | Proves |
|---|---|---|
| M1 | Workspace, engine types, calendar importer and report, slot audit, timetable seed and grid editor, slots, app shell, read-only fortnight board, Today with report deadlines and parents' evenings, backups, one-command start | Scenarios 1 to 4, 15 |
| M2 | IAL Unit 4 end to end: the AI layer, pack, planning-sheet and assessment import, scheme editor, sequencing, revisions, positions and declared past, pace line, weekly check-in, thin Excel and Teams export, timetable image upload | Scenario 5 |
| M3 | Disruptions, event confirmation, reflow proposals, undo, parity tracker, catch-up options | Scenarios 6 to 8, 16 |
| M4 | IB: pack with HL flags, prerequisite map, two tracks, eligibility, helper screen, draft fill | Scenario 10 |
| M5 | Board editing: "Move to…", drag, pins, merge; other views; card drawer; legend and activity drawer | Scenario 9, 13 |
| M6 | IGCSE pack, 11D against department checkpoints, coverage, assessment calendar and clashes | Scenario 11 |
| M7 | Resource index, PowerPoint text extraction, the three `content-*` skills with review and source checking | Scenario 12 |
| M8 | Full exports, offline behaviour, teacher README and first-run tour, full Chrome validation, pull request ready | All; scenario 14 throughout |

**Later.** v2: student and Head of Department views, shared department library, Microsoft 365 sync, more AI providers, activity ideas, differentiation, reflection log. Then the "360 platform": this planner joined with the content creator, the examiner and the homework companion.

## 20. Decisions

| ADR | Decision |
|---|---|
| 005 | Reserved: Gemma's write-up of the move to TypeScript and React (template 11.1) |
| 006 | Local-first full-stack TypeScript monorepo |
| 007 | AI behind a provider port; headless Claude Code as the default adapter |
| 008 | Provenance and human review |
| 009 | The calendar is the source of truth for the cycle |
| 010 | Decisions as rows, placements derived, immutable plan revisions |
| 011 | Resources data boundary |
| 012 | SQLite behind repository ports |
| 013 | Test strategy |
| 014 | Visual-first docs as code |
| 015 | Content-creator module boundary |
| 016 | Reviewed, locked curriculum packs |

## 21. Risks

| Risk | Mitigation |
|---|---|
| **Wrong slots.** One misread label makes every later date wrong, and she finds out in class | Slot audit screen, golden tests, import report, a board that mirrors her timetable |
| **She cannot verify the mapping quickly** (her anti-goal) | Packs reviewed once and locked, with page references; her lesson counts are the default; coverage labelled declared or logged |
| **The plan drifts from what was taught** | Weekly check-in, freeze horizon, nothing auto-applied, undo |
| Student work in the resources folder | Allowlist, deny rules, text-only to models, no student data stored |
| Board copyright | Local-only packs, synthetic fixtures, cited exports |
| A model states something false | Sources opened and checked, unverified claims labelled, her review, all dates and counts from the engine |
| Headless Claude changes (`--bare` default, limits) | Provider port, sign-in probe, graceful degradation, API-key adapter later |
| Young or stale libraries (`@dnd-kit/react`, exceljs) | Each behind one adapter; exact pins |
| The school changes the workbook | Header-based parsing, import report, three-way re-import |
| Size of the build | One course end to end per milestone; draft pull request from the start |
| School approval for real use | Local only, no school systems touched, no student data |
| Source documents disagree (IB week ranges; last year's dates in one IGCSE sheet) | They are hints; the calendar and her confirmations win |

## 22. Open questions and assumptions

**For Gemma**

| # | Question | ASSUMPTION until answered |
|---|---|---|
| 1 | Is a double period one lesson or two? | Two units, drawn joined |
| 2 | Where is each group today, and what was taught out of order? | Asked in Setup; nothing is planned until given |
| 3 | Which year-group events cancel your lessons? When does study leave start? | She confirms a suggested list once |
| 4 | Can you add the IB 2026-28 calendar workbook the staff calendar points to? | IB dates entered by hand |
| 5 | Assessment weightings: you asked to be prompted for a breakdown (5.2) | Assessments carry a type and a mark tariff only |
| 6 | Which PowerPoint variant do you teach from? | The TEACHER file, most recently modified |
| 7 | What do `400`, `13 F`, `MM8 Patio`, `Y13 (601)` and `DEP` mean for planning? | None need a lesson plan |
| 8 | Is "AI content creator" a fifth prototype? | Yes, later, lifted from `packages/content-creator` |
| 9 | Are the success measures in section 2 the right ones? | As proposed |
| 10 | Template Parts 11.1 to 11.4, 12.3 and 13 are still yours | Definition of done as in section 18 |
| 11 | When a group has spare lessons before an assessment, where do you want them: just before the assessment, or spread through the topic? | Just before the assessment, as flex lessons you can move |
| 12 | When you are absent, is "the class does the planned lesson as independent work" the right starting point? | Yes; the other two choices are one click away |
| 13 | Does "Number of Classes" in your planning sheets include the lessons used for assessments? | No: assessments are extra lessons |
| 14 | Is the timetable grid in the appendix exactly right? It was read from your image | Yes; the fortnight totals match what you wrote |

**Answered on 24 Nov 2026** (her words are in [`answers_section_22.md`](answers_section_22.md)):

| # | Her answer | Effect |
|---|---|---|
| 1 | A double is two 55-minute lessons with no break between | Assumption confirmed (section 10.2) |
| 2 | She gave each group's position | Recorded in appendix D; entered in Setup at each course's go-live |
| 11 | "What are spare lessons?" She suggested support-session activities or independent study | The interface says "spare lesson" and explains it; purposes changed (section 10.6). Where they go is still open |
| 13 | No, and not every assessment takes a whole period | Assessments have a length; short ones are in-lesson (section 10.5) |

She also confirmed all sixteen acceptance scenarios in section 17. Questions 3 to 10, 12 and 14 were not answered, so their assumptions stand.

**For Alberto**

| # | Question | ASSUMPTION until answered |
|---|---|---|
| A | Is the GitHub repository private? The school's name and five third-party product screenshots are committed | Private |
| B | CI lint fails on `main` today: ten course files need formatting and `homework_04.py` has six lint errors. They are Gemma's files | Left untouched; the planner's CI job is separate |
| C | Deny rules are targeted at the student-work folders. Deny the whole resources folder instead? | Targeted, so she can still ask Claude about her own planning files |

Alberto confirmed all three assumptions on 24 Nov 2026.

## 23. Left to the builder

Table and column names; the exact API routes; component breakdown and visual detail within section 12; the router; the group colour values after contrast adjustment; file layout inside each package; how the timetable image is passed to the adapter; backup retention; the wording of the first-run tour. Each of these should follow the rules in sections 4, 9 and 10 and be recorded where a later reader would look for it.

## Appendix A: the timetable grid

Read from `timetable.png` on 19 Nov 2026; awaiting Gemma's confirmation (open question 14). This grid, with group codes and rooms only, becomes the committed seed `fixtures/timetable.2026-27.json` in M1. It is the one fixture that is hers; the calendar and curriculum fixtures are synthetic. Blank means free. `400` is study-hall duty. Form (`13 F`, room 306) sits between P2 and P3 every day and needs no plan.

**Week 1**

| | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| P1 | IB H (605) | 13 5 (504) | | IB S (605) | 400 |
| P2 | IB H (605) | 400 | 13 1 (206) | IB S (605) | 400 |
| P3 | 11D (207) | 11D (207) | 400 | 13 3 (202) | 400 |
| P4 | 400 | 11D (207) | 400 | 13 3 (202) | 400 |
| P5 | 13 1 (206) | 13 3 (202) | IB S (605) | | |
| P6 | 13 5 (504) | 400 | | 13 5 (504) | 13 1 (206) |

**Week 2**

| | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| P1 | IB H (605) | 400 | | IB S (605) | 400 |
| P2 | IB H (605) | 13 5 (504) | 13 1 (206) | IB S (605) | 400 |
| P3 | | 11D (207) | 400 | 13 3 (202) | 400 |
| P4 | | 11D (207) | 400 | 13 3 (202) | 13 5 (504) |
| P5 | 13 1 (206) | 13 3 (202) | IB S (605) | | |
| P6 | | 400 | | 13 5 (504) | 13 1 (206) |

Lunch-time duties (`MM8 Patio`, `Y13 (601)`, `DEP`) are not lessons and are left out.

## Appendix B: calls made after the builder review

A second engineer read this spec cold and asked what they would still have to guess. These are the answers added in response, so a reviewer can check them in one place.

| Topic | Call | Section |
|---|---|---|
| Spare slots | Lessons pack early; leftover slots become flex lessons at the end of each window; the engine never invents content; buffers exist only if she writes them | 10.5, 10.6 |
| Cover lessons | By default the planned lesson is delivered as cover work and the position moves on; two other choices are offered | 10.7 |
| Facts and plans | A disruption is saved as a fact; re-planning is a separate choice; undo restores the plan and leaves the fact | 10.4, 10.8 |
| One plan per course | Each course and its groups has its own revision chain; a school-wide change gives one proposal per plan | 10.4, 10.8 |
| What happened | The weekly check-in writes a lesson log; unanswered past lessons are `assumed` | 10.3, 10.9 |
| Assessment anchors | Each group's first slot on or after the date; one slot each; outside her class counts | 10.5 |
| IB scheme | Unit totals from her outline; AI proposes the split across sub-topics | 10.10 |
| Pack building | Drafted by an assisted command; reviewed and locked in an app screen | 10.12 |
| Spec links | Chapter-to-spec links live in the locked pack; scheme items point at chapters | 10.11 |
| Freeze horizon | Protects near-term lessons from knock-on moves; a disruption on the slot itself is the exception | 10.8 |
| Allowlist | Now includes the calendar workbook and the timetable image | 14 |
| Images | The provider port accepts an uploaded image for the timetable import only | 11, 14 |

## Appendix C: what the Phase A spikes proved (19 Nov 2026)

| Spike | Result |
|---|---|
| Headless Claude adapter | Subscription sign-in works; isolated from project plugins and hooks; schema-valid output; 3 s without tools, 30 s with web search |
| TypeScript 7 toolchain | Type-check, 7 tests (Gherkin, property, SQLite round trip, API route and OpenAPI document), production build and lint all ran on Node 26 with pnpm 12 |
| D2 diagrams | D2 0.9 from mise renders the house palette to SVG; checked by eye |
| Deny rules | A path with spaces and an ampersand is refused; three real student-work folders are refused; a neighbouring folder is not |
| Repo hygiene | `uv sync --all-packages` and `uv run pytest` pass again (7 passed) |

## Appendix D: changes after approval (24 Nov 2026)

Alberto approved the spec on 24 Nov 2026 and passed on Gemma's answers. These are the changes they caused, and three calls made while writing the task-level plan.

**From Gemma's answers**

| Change | Section |
|---|---|
| A double period is two units with no break; only periods 1+2, 3+4 and 5+6 can pair | 10.2 |
| Assessments are outside her class counts and have a length in minutes; one under 30 minutes is in-lesson and uses no slot | 10.5 |
| Her class counts are a guide; the scheme screen also shows each count as weeks | 10.5, 12 |
| "Flex lesson" is shown as "spare lesson" with an explanation; purposes are exam practice, support-session activities, independent study | 10.6 |
| A project is a kind of scheme item | 10.3 |
| Condensing two lessons into one is named as a catch-up option | 10.7 |
| Paper 3 preparation joins the IB fallback pool, and the helper counts IB H slots before the Paper 3 mock | 10.10 |

**Calls made while planning (for Alberto to check)**

| Call | Why | Section |
|---|---|---|
| A labelled in-term day marked staff-only is a whole-school disruption she confirms, not a silent non-pupil day | Its lost lessons then show in the slot audit with the calendar text, like every other lost lesson | 10.1 |
| The pace-line rule is stated exactly | The original wording did not say what happens when one group cannot fit the content due before an assessment. Scenario 6 needs that group alone to be short | 10.6 |
| Timetable image upload moves from M1 to M2 | It needs the AI layer, which M2 builds. The seeded grid and its editor stay in M1 | 7, 19 |
| "Hold the leading groups" is a choice she makes, not something the engine does by itself | It defers one lesson until after the assessment for every group, so they stay together; the others gain a spare lesson | 10.7 |
| Speaker notes in a PowerPoint are never sent to a model | Notes are where a teacher writes reminders about students | 11, 14 |
| A "not after" deadline is checked and reported, never enforced by reordering | Reordering lessons silently would break her teaching order | 10.5 |

**A correction to the data in section 8.** Her IAL Unit 4 sheet lists 70 classes across chapters 22 to 37 and states a total of 65. The difference is chapter 22, marked "5 (started in Y12)". Imports keep both numbers and show the difference; scenario 5 now says so.

**Where each group is, as Gemma described it on 23 Nov 2026.** These are entered in Setup when each course goes live; nothing is planned from them until she confirms them on screen.

| Group | Position |
|---|---|
| 13 1, 13 3, 13 5 (IAL Unit 4, taught in chapter order) | Chapter 26, Trading Blocs, is finished. Its assessment is on Tue 24 Nov for 13 3 and 13 5 and on Wed 25 Nov for 13 1. Chapter 27 is next |
| IB S (Year 12; unit order 1, 4, 3) | 1.5 Growth is finished. A Unit 1 podcast project starts this week, then 1.6 Multinationals, then a Unit 1 exam |
| IB H | The HL-only chapters 5.6, 5.7 and 5.8 are done, out of order. Now on 2.5, aiming to finish 2.7 before the winter holiday |
| 11D (IGCSE; unit order 3, 2, 5) | Halfway through Unit 3, chapter 30, Statement of financial position. A finance assessment is on Tue 24 Nov |

**New questions for Gemma**

| # | Question | ASSUMPTION until answered |
|---|---|---|
| 15 | The calendar says the first day of term for students was Fri 4 Sep 2026. You said lessons started on the 3rd. Which is right for your groups? | 4 Sep, as the calendar says; she can change term dates in Setup. It affects only the count of past lessons |
| 16 | Is 30 minutes the right line between an assessment that takes a whole lesson and one that fits inside a lesson? | Yes |
| 17 | You said 21 and 22 Dec will be lighter lessons. Should the planner mark the last days before a holiday? | The board marks a week of one or two teaching days as a "short week"; nothing is rescheduled |
