# 📅 AI Teacher Planner

This is one of your four end-of-course prototypes — see
[`docs/adr/001-prototype-build-order.md`](../../docs/adr/001-prototype-build-order.md)
for why it's built first. It's the simplest prototype and a deliberate
confidence-building win: pure-Python Excel reading, no AI calls, no
vision models — just the same "open a file, walk its rows, build
objects" habit from python_course module 06, wearing module 07's
classes.

> 🚀 **Update, November 2026.** You answered the questions and filled in the
> planner template, so the real planner is now designed. It will be a web
> app (TypeScript + React) living in this same folder, **beside** the Python
> scaffold below, which stays exactly as it is.
>
> - 🖼️ Start with the pictures: [`docs/design/ai-teacher-planner/`](../../docs/design/ai-teacher-planner/README.md)
> - 📐 Then the design: [`docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md`](../../docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md)
> - ❓ Section 22 of that design has ten questions only you can answer.
> - ✍️ ADR-005 and Part 11 of your template are still yours to write.
>
> Everything below describes the original Python scaffold from the course.

## ▶️ How to start it

The planner is a web app that runs on your own Mac. Nothing is sent anywhere.

1. **Once only:** open a terminal in this folder and run `mise install`, then `pnpm install`. (If your Mac says `pnpm` is not found, put `~/.local/bin/mise exec --` in front.)
2. **Every time:** run `pnpm start`. The first run takes a minute while it builds the screens. Then the planner opens in your browser at `http://127.0.0.1:4319`.
3. **To stop it:** go back to the terminal and press `Ctrl+C`.

Copy and paste, from any terminal:

```bash
cd /Users/gemmakelly/PycharmProjects/python-for-gemma/prototypes/ai_teacher_planner
pnpm install
pnpm start
```

Your plan lives in the `data/` folder next to this file, on your Mac only. It never leaves your computer, and the planner makes a backup copy each day.

## ✨ What the planner lets you do now (milestone 2)

The planner now does Unit 4 of IAL Business from start to finish, and it
asks before it changes anything.

- **Build the course pack.** The planner reads the specification and drafts
  the units and spec points, and links your textbook chapters to them. You
  review it, fix what is wrong and press Lock. Anything the AI wrote is
  marked with a purple sparkle until you have reviewed it.
- **Set up the scheme of work.** Bring in your planning sheet and assessment
  schedule. The planner shows the lesson counts and what fits, and the
  totals change as you type. It can suggest a different count, but only as
  a difference you can accept or reject.
- **Say where each group is, then ask for a plan.** You get a proposal that
  lists every lesson that moves and why. Nothing changes until you press
  Accept, and "Undo last change" puts the old plan back.
- **See it on the board.** Each lesson sits on that group's own period, with
  its chapter and "2 of 4". Spare lessons appear before an assessment. Half
  terms and holidays have no lessons.
- **Check in once a week.** Today asks "did these happen as planned?" for each
  group. One click confirms the week; "Not as planned" lets you say what
  happened and offers a new plan.
- **Take it with you.** The Export button on the board makes an Excel file of
  the fortnight, or a week as plain text to paste into Teams. Anything the AI
  suggested and you have not reviewed is left out, and you are told.
- **Read your timetable from a picture,** and keep a plan and files for each lesson.

Still to come: cancelled-lesson replanning and parity (milestone 3), and the
IB and IGCSE courses after that. The design is in the pictures linked above.

Claude helps with the AI buttons, so Claude Code needs to be signed in on
your Mac. If it is not, the AI buttons say so and everything else works.

## 🎯 What the original Python scaffold was for

This prototype was first meant to read your real school staff
calendar and turn it into two things you currently have to work out by
hand each term:

1. **A Scheme of Work** — your syllabus topics mapped onto the actual
   teaching weeks available to you, automatically skipping half terms,
   Mock Week, and any other non-teaching week on the calendar.
2. **A weekly planner** — one row per teaching week, with **2 formal
   assessments + 1 summative assessment per term** slotted in at
   sensible points, never landing on a holiday or Mock Week.

Both outputs will be holiday-aware and Mock-Week-aware from the ground
up, because that awareness starts right here, in the calendar reader.

## ✅ What exists today

- **`src/ai_teacher_planner/models.py`** — `Term` and `CalendarWeek`,
  two small `frozen` dataclasses. If `Student`, `Exam`, and `Rubric`
  from python_course module 07 rang a bell reading this file, that's
  the point: same "one noun, one class" thinking, just aimed at terms
  and weeks instead of students and marks.
- **`src/ai_teacher_planner/calendar_reader.py`** — `read_calendar(path)`,
  which opens an `.xlsx` workbook's "Calendar" sheet with `openpyxl` and
  returns a `list[CalendarWeek]`, one per row, with `is_teaching` set
  from the label.
- **`mock_data/build_mock_calendar.py`** — generates
  `mock_data/secondary_calendar.xlsx`, a small stand-in calendar (6
  weeks: 4 Teaching, 1 Half Term, 1 Mock Week) so the reader has
  something real to prove itself against before your actual calendar
  shape is known.
- **`tests/test_calendar_reader.py`** — one passing test, reading the
  mock file and checking the teaching/holiday/mock-week split comes out
  right.

Try it yourself:

```bash
uv run pytest prototypes/ai_teacher_planner -v
```

## 🚧 What's next

The reader only reads *weeks* so far — it doesn't yet know your
syllabus topics, your term dates, or your assessment calendar. The next
pieces, in order, are:

1. A `Term` builder that groups `CalendarWeek`s into terms.
2. A Scheme-of-Work model that maps syllabus topics onto teaching weeks.
3. The weekly planner itself, placing 2 formal + 1 summative assessment
   per term.
4. An export step, once we know your preferred output format.

## ❓ What's blocking full build-out

This scaffold works against mock data on purpose (see
[ADR-004](../../docs/adr/004-first-pass-scope.md)) — nothing here should
guess at facts only you know. Five questions in
[`QUESTIONS_FOR_GEMMA.md`](../../QUESTIONS_FOR_GEMMA.md) unblock the real
build:

| Question | Unblocks |
|---|---|
| **A1** — can you copy the real calendar `.xlsx` into `real_data/`? | Swapping the mock file for your actual calendar |
| **A2** — what tabs/columns does it have? | Matching `read_calendar()`'s column layout to reality |
| **A3** — your timetable (classes, year groups, periods/week) | The Scheme-of-Work builder |
| **A4** — 2025–26 term dates | The `Term` builder |
| **A5** — preferred output (Excel / Word / Markdown / OneNote) | The export step |

`real_data/` is already excluded from git (see the workspace
`.gitignore`) — your real calendar never leaves your machine or enters
an AI context window. Only `mock_data/` gets committed.

## 🗺️ Roadmap

```mermaid
flowchart LR
    A["📖 Calendar reader"]:::concept --> B["🗓️ Term builder"]:::win
    B --> C["📚 Scheme of Work"]:::win
    C --> D["🗂️ Weekly planner"]:::ai
    D --> E["📤 Export"]:::ai

    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

Blue = built today. Green = next, once term dates and timetable are
known. Purple = the stage where a Claude Code agent starts doing the
planning work, not just Python reading a spreadsheet.

## 📐 Open decisions

See [`docs/adr/000-pending.md`](docs/adr/000-pending.md) for decisions
this prototype is deliberately deferring until `QUESTIONS_FOR_GEMMA.md`
is answered.
