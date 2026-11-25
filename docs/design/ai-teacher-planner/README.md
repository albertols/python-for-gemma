# AI Teacher Planner: architecture at a glance

Ten diagrams, drawn as code. Read them top to bottom for the whole picture, or jump to the one you need. They show the design agreed in `docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md`; when the code and a diagram disagree, fix the diagram in the same commit.

**Colour key, the same in every diagram:** blue is our code, green is data that stays on the Mac, amber is a boundary or guard, purple means a model is involved, grey dashed is later work, red dashed is denied.

| # | Diagram | Answers |
|---|---|---|
| 1 | [System context](#1-system-context) | Who and what does the planner touch? |
| 2 | [Containers](#2-containers) | What runs, and where? |
| 3 | [Backend components](#3-backend-components) | How is the API put together? |
| 4 | [Frontend components](#4-frontend-components) | Which screens exist and what do they share? |
| 5 | [Domain model](#5-domain-model) | What is stored and what is derived? |
| 6 | [Scheduling pipeline](#6-scheduling-pipeline) | How does a calendar become an accepted plan? |
| 7 | [AI flow](#7-ai-flow) | What happens when Gemma clicks an AI action? |
| 8 | [Data and privacy](#8-data-and-privacy) | What stays, what leaves, what is denied? |
| 9 | [Tech stack](#9-tech-stack) | Which tools, at which versions? |
| 10 | [Roadmap](#10-roadmap) | What comes in v1, v2 and after? |

## 1. System context

Look for the dashed box: everything v1 uses sits on Gemma's Mac, and a single purple arrow leaves it.

![System context: Gemma, the planner on her Mac, Claude Code, the resources folder, the calendar workbook, and later systems](01-system-context.svg)

## 2. Containers

Look for the two things that import the engine (the web app and the API) and the one route to a model, through the AiProvider port.

![Containers: web app, local API, engine, SQLite file, ResourceGateway, the packages/ai AiProvider port with skill registry and stream parser, the Claude Code CLI adapter, and the fake](02-containers.svg)

## 3. Backend components

Look for the direction of the arrows: use cases call ports, while disk, files and the model sit behind adapters at the edge. The M1b routes and tables (disruptions, corrections, events, exams, to-do notes) and the M2 ones (courses, scheme, positions, plans, check-in) all live in the same routes, use cases and repository box; curriculum packs are JSON files behind the PackStore, with only the locked hash in SQLite.

![Backend components: HTTP routes (calendar, corrections, events, disruptions, exams, todos, AI jobs and review; courses, packs, scheme and import preview, positions, plans, check-in), use cases (loadPlanInputs, propose, accept, undo, check-in, seedM2), job queue, engine, driven adapters (importers read calendar, specification PDF text, planning sheets and assessment schedules) with migrations 0001-0009 and the PackStore, ResourceGateway (finds planning files under Planning/ only), SQLite file and pack files, AI providers](03-backend-components.svg)

## 4. Frontend components

Look for the six shared pieces every screen reuses; the purple ones are where AI shows up in the GUI: the badge and its popover, the activity drawer with the header job chip and review buttons, and the legend. Engine output carries no badge.

![Frontend components: eleven screens (pack review with lock, board with class filter and week view, audit with official exams, Setup with events and exams), six shared pieces (AI badge and popover, proposal diff, activity drawer and job chip, legend, API client, engine import), and the API and engine they talk to](04-frontend-components.svg)

## 5. Domain model

Look for the colour split: green is stored, blue is worked out by the engine each time and never stored. Her M1b corrections and confirmations are green rows that survive a new import. An official exam becomes the plan's last checkpoint, named by its code. A course record carries the exam board and the revision weeks its plan keeps. A proposal (candidate, diff and before-and-after metrics) is never stored; accepting it adds an immutable revision to the plan's chain, only if the head and the candidate are still the ones she saw, and undo moves the head back to the parent.

![Domain model: calendar and timetable, courses (exam board, revision weeks), curriculum pack (a JSON file; units, chapters, spec points, hash lock in SQLite), her decisions (disruptions, label corrections, event confirmations, official exams, to-do notes), scheme items with group overrides and assessment details, positions and the lesson log, pins and merges, derived slots, lessons, placements, assessment anchors, checkpoints (assessment, block end, revision, official exam), overflow, absorbed buffers and conflicts, spare lessons, proposals with metrics, plan chain and revisions, provenance with review state, stored AI runs and items](05-domain-model.svg)

## 6. Scheduling pipeline

Look for the amber gates: a candidate revision becomes the head revision only when Gemma accepts the diff, and the accept is refused when the head or the candidate changed after the preview. Before that, the pace line keeps parallel groups level at each checkpoint and turns their free slots into spare lessons. The board, the check-in and the "up to date?" check read the head.

![Scheduling pipeline: calendar workbook to calendar days, slots, scheme expanded to lessons, history and the freeze horizon (buffer lessons that absorbed a loss stay used), per-group sequencing with official exams and the revision block, the pace line for parallel groups, candidate revision, diff with metrics and accept (refused when stale), head revision, read by the board placements, the check-in, the up-to-date check, parity, coverage and reminders](06-scheduling-pipeline.svg)

## 7. AI flow

Look for what crosses to the model (extracted text) and what comes back (JSON), the Claude Code adapter that starts `claude -p` and checks the answer against the schema, then the review step at the end. The job queue runs one job at a time, asks the provider whether it is available before each one, and tells the browser only plain-word progress; a suggestion is applied once, with its provenance, only after Gemma accepts or edits it.

![AI flow sequence: ask (refused when AI is off), run (one at a time, availability check, provider, Claude Code adapter, claude -p, schema check), store, review (once, with provenance)](07-ai-flow.svg)

## 8. Data and privacy

Look for the red dashed arrows: each one ends at a guard.

![Data and privacy: what stays on the Mac, what reaches the model, and what is denied](08-data-and-privacy.svg)

## 9. Tech stack

Look for the exact versions: every library built in milestone M1 is pinned, and the office-file readers for later milestones are marked "later".

![Tech stack: runtime, language and lint, web, API, data, tests, office and PDF files, diagrams, AI, with the exact pinned versions](09-tech-stack.svg)

## 10. Roadmap

Look for the order inside v1: one course end to end at a time, before any logins or hosting.

![Roadmap: v1 milestones, v2, and the 360 platform](10-roadmap.svg)

## How to update

If you are Claude, follow the `architecture-visual-docs` skill (`.claude/skills/architecture-visual-docs/SKILL.md`): it says which diagrams a given change touches and what to report. In short:

1. Edit the `.d2` file in `src/`. Shared colours and edge styles live in `src/_style.d2`; the full colour legend is `src/_legend.d2`.
2. Run `sh docs/design/render.sh` from the repo root. D2 comes from `mise.toml` (`mise install` once).
3. Open the SVG and look at it. Check for overlapping labels and text too small to read.
4. Commit the source and the SVG together.

`sh docs/design/render.sh --check` re-renders and fails if any committed SVG differs from its source. CI uses it to catch stale diagrams. Rendering is deterministic, so an unchanged source always gives an identical SVG.

Layout: ELK is the default. Diagrams 01, 03, 05, 06 and 08 set `layout-engine: tala` at the top of the file because it gave a more compact result. Keep each diagram to about twelve nodes; split it if it needs more.

## Screenshots

Real screenshots from browser validation live in `screens/`, named `mN-screen-name.png`. All of them show the synthetic school year, never real data.

Milestone M1 (calendar, timetable, slots, Setup, board, Today, slot audit):

| Screen | Screenshot |
|---|---|
| Setup: calendar import with its findings, terms, timetable | ![Setup](screens/m1-setup.png) |
| Board: one fortnight, Week 1 beside Week 2 | ![Board](screens/m1-board.png) |
| Today: the day's lessons and what is coming up | ![Today](screens/m1-today.png) |
| Slot audit: lessons per teaching block and group, days off | ![Slot audit](screens/m1-audit.png) |

Milestone M1b (her corrections, cancelled lessons, calendar events, exams, board filter and week view, to-do notes):

| Screen | Screenshot |
|---|---|
| Setup: calendar events she confirms, with possible-disruption markers | ![Setup events](screens/m1b-setup.png) |
| Slot audit: lessons that will not run, last lessons and official exams | ![Audit](screens/m1b-audit.png) |
| Board: one week, with the class filter | ![Board week](screens/m1b-board-week.png) |
| Today in the dark theme, with to-do notes | ![Today](screens/m1b-today.png) |
