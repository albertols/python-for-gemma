# Agentic AI Masters for Education — Design Spec

**Date:** 2026-08-04
**Status:** Approved (Alberto, 2026-08-04)
**Repo:** github.com/albertols/python-for-gemma

## 1. Context and goals

Gemma Kelly-Clamp (GitHub: `gemmakelly-clamp`) is an IB Diploma / Edexcel A-level & IGCSE Economics and Business teacher, a complete Python beginner, and a strong visual learner. Alberto (Big Data Architect) mentors her but has very limited time: **she must be able to progress autonomously**, asking him only highly technical questions.

This repo is her tailored "Agentic AI Masters for Education", built on four pillars:

1. **Python course** — packages as learning modules, heavily commented lessons, pytest-validated homework.
2. **Claude Code course** — path to "Claude Architect" (skills, agents, plugins, MCP, spec-driven development).
3. **Workflow automation** — Python + Microsoft Graph against her school stack.
4. **Work prototypes** — AI_TEACHER_PLANNER, AUTOMATION_FLOWS, AI_HOMEWORK_EXAM_PRACTISE_COMPANION, AI_EXAMINER.

Her machine: MacBook Air M1, 8 GB RAM, macOS. School stack: SIMS (via VM), Cognita Connect, SchoolCloud (TES), MS Teams + OneDrive/SharePoint (primary), Toddle, Examwizard.

## 2. Hard constraints

- **Credentials stay local.** No credential, token, or secret may ever be sent to any AI model (including Claude Code) or committed to git. Enforced in three layers (§8).
- **Free tooling only** for the automation stack; must run comfortably on 8 GB RAM.
- **Everything commits and pushes to `main` as it lands** in this pass, so Gemma can `git pull` and start immediately.
- **Student privacy:** student work uses anonymized filenames (`student1_YYYY_MM_DD_SUBJECT.png`); no real student names in the repo.

## 3. Decisions (recorded as ADRs 001–004)

| # | Decision | Choice |
|---|----------|--------|
| ADR-001 | Prototype build order | PLANNER + AUTOMATION_FLOWS in parallel → COMPANION → EXAMINER |
| ADR-002 | AI engine for prototypes | Claude Code skills/agents first; Python core kept API-ready for later Anthropic API + GCP deployment |
| ADR-003 | Automation stack | Python + Microsoft Graph API (device-code flow, local MSAL token cache); no n8n |
| ADR-004 | Scope of first pass | Foundation + both courses in full + all four prototypes scaffolded against mock data |

## 4. Repo architecture

uv workspace monorepo:

```
python-for-gemma/
├── README.md                    # Gemma's home page: visual learning map, start-here guide
├── CLAUDE.md                    # concise house rules for Claude Code
├── QUESTIONS_FOR_GEMMA.md       # functional questionnaire; answering it is her first git exercise
├── pyproject.toml               # uv workspace root (ruff + pytest config)
├── .pre-commit-config.yaml
├── .gitignore                   # blocks .env*, token caches, secrets, real student data
├── .github/workflows/ci.yml    # uv sync → ruff → pytest on push/PR
├── .claude/
│   ├── settings.json            # permission deny rules for secret paths
│   ├── skills/
│   │   ├── lesson-creator/SKILL.md
│   │   └── visual-docs-creator/SKILL.md
│   └── agents/
│       ├── homework-checker.md
│       └── examiner.md          # stub in this pass
├── docs/
│   ├── how_to_learn_claude.md
│   ├── security.md
│   ├── adr/
│   │   ├── template.md
│   │   └── 001..004-*.md
│   └── superpowers/specs/       # this file and future specs
├── python_course/
│   └── module_01..module_08/    # §5
├── claude_course/
│   └── module_01..module_07/    # §6
└── prototypes/                  # §7
    ├── ai_teacher_planner/
    ├── automation_flows/
    ├── ai_homework_companion/
    └── ai_examiner/
```

## 5. PYTHON_COURSE

### Modules

| Module | Topic | Business/Econ theme |
|--------|-------|---------------------|
| 01_hello_python | print, running scripts, comments, reading errors | first day of term |
| 02_variables_types | str/int/float/bool, f-strings, input | prices, GDP, mark totals |
| 03_collections | list, dict, tuple, set, indexing, slicing | class register, gradebook |
| 04_control_flow | if/elif/else, for, while, range | grade boundaries, attendance |
| 05_functions | def, parameters, return, scope, DRY | mark-percentage calculators |
| 06_files_errors | reading/writing CSV & text, exceptions, pathlib | attendance files, mark exports |
| 07_oop | classes, attributes, methods, dunder basics | Student, Exam, Rubric (feeds AI_EXAMINER) |
| 08_testing_tooling | pytest, TDD loop, uv, git/GitHub, CI | capstone bridging to prototypes |

### Lesson anatomy (identical in every lesson — house style)

1. **Header docstring**: lesson goals, 📖 official docs link, 🎬 one YouTube video link, 🖼 one visual/image link.
2. **Walkthrough code**: heavily commented, comments explain *why* and name the concept.
3. **`# 🧪 TRY IT` blocks**: small experiments she runs and modifies.
4. **Homework**: `TODO`-marked function stubs at the bottom of `homework_XX.py`.
5. **Validation**: `test_homework_XX.py` — she runs `uv run pytest python_course/module_XX -v -m homework` and gets red/green feedback. Tests contain friendly assertion messages that hint without revealing answers. Homework tests carry the `homework` pytest marker and are excluded from the default run (`addopts = "-m 'not homework'"`) so CI stays green while stubs are unfinished.

### Module structure

```
module_01_hello_python/
├── INDEX.md              # recap, colored mermaid diagram with icons, links table, progress checklist
├── lesson_01_*.py        # 2–3 lessons per module
├── homework_01.py
└── test_homework_01.py   # beside the homework (flat folder → simple pytest imports for a beginner)
```

`INDEX.md` requirements: visual-first — one colored mermaid diagram (with emoji icons) per module summarizing the concepts; a links table (docs / video / image per lesson); a checkbox progress list; a "when you're stuck" section pointing to the homework-checker agent.

## 6. CLAUDE_COURSE → "Claude Architect"

`docs/how_to_learn_claude.md` is the index; `claude_course/module_01..07/` are markdown lessons in the same visual style (mermaid diagrams, links, checklists), each ending with a hands-on exercise against this very repo.

| Module | Topic | Hands-on exercise |
|--------|-------|-------------------|
| 01_what_is_claude_code | REPL, permissions, modes, /commands | first session: ask Claude to explain module_01 |
| 02_claude_md_memory | CLAUDE.md, memory, context | edit CLAUDE.md, watch behavior change |
| 03_skills | what skills are, invoking, anatomy | run lesson-creator to draft a bonus lesson |
| 04_agents | subagents, when to delegate | use homework-checker on her homework |
| 05_plugins_mcp | plugins, marketplace, MCP servers | list/install a plugin; inspect this repo's plugins |
| 06_spec_driven_dev | brainstorm → spec → plan → build; ADRs; TDD with Claude | write a mini-spec for a gradebook script |
| 07_claude_architect_capstone | build your own skill | create a skill that generates parent-email drafts |

## 7. Prototypes (scaffolds in this pass)

Every scaffold contains: `README.md` (functional spec written in teacher language), `docs/` with ADR stub, `src/` skeleton with typed models, `tests/` with at least one passing test, `mock_data/`. Full implementation happens in later phases, per ADR-001 order, after Gemma's questionnaire answers.

### 7.1 ai_teacher_planner (phase A, with automation_flows)
- Input: school calendar Excel (`Hastings Secondary Staff (Teams)/Tab 2025-26-Secondary Calendar ALL STAFF.xlsx` — mocked now as `mock_data/secondary_calendar.xlsx` with plausible tabs: term dates, holidays, mock weeks).
- Output: Scheme of Work (syllabus topics mapped to available teaching weeks) + weekly planner including 2 formal + 1 summative assessment per term, skipping holidays/mock weeks.
- Scaffold: `openpyxl` calendar reader model (`CalendarWeek`, `Term`), SoW data model, one passing test reading the mock calendar.

### 7.2 automation_flows (phase A)
- Python + MS Graph (device-code flow via `msal`; token cache local only).
- Scaffold: `graph_client.py` auth skeleton (no secrets), `flows/` directory with one mock flow (download a file from a Teams channel / OneDrive path), README explaining SIMS/Cognita/SchoolCloud are later, browser-automation-or-manual candidates pending Gemma's answers.

### 7.3 ai_homework_companion (phase B)
- Generates exam-style practice: case study + questions matching official styles (IB, Edexcel IAL, Edexcel IGCSE; 4-mark to 20-mark structures).
- Scaffold: question-style templates as data (`styles/*.md` with per-board conventions), `PracticeSet` model, prompt templates for the Claude agent, one passing test.
- Marked later by AI_EXAMINER (shared rubric engine).

### 7.4 ai_examiner (phase C, hardest)
- Input: `student1_YYYY_MM_DD_SUBJECT.png` + rubric/mark scheme + syllabus reference. Output: estimated grade + annotated `_correction.png` + per-question commentary; Gemma signs off (human-in-the-loop).
- BLT rubric domain model: Point / Because / Leads to / Therefore (+ Moreover); application-to-case-study weighting; Unit 4 Global Business uniquely requires real-world examples.
- Scaffold: `Rubric`, `BLTParagraph`, `MarkScheme`, `ExamSubmission` models (building on module_07 OOP), `.claude/agents/examiner.md` stub, one mock student PNG + mock rubric, one passing test.
- Cloud-portable design note in README: core logic pure Python, AI calls behind an interface → later Anthropic API on GCP (generic for AWS/Azure).

## 8. Security design (three enforcement layers)

1. `.gitignore`: `.env*`, `**/.msal_cache*`, `**/secrets/**`, `**/token_cache*`, real student data dirs.
2. `.claude/settings.json` deny rules: Claude Code cannot Read `.env*`, token caches, or `secrets/` paths.
3. MS Graph device-code flow: Gemma authenticates in her own browser; tokens live only in the local MSAL cache. No secret ever appears in code, git, or an AI context window.

`docs/security.md` explains this with a mermaid diagram in teacher-friendly language.

## 9. CI/CD and git workflow

- GitHub Actions on push/PR: `astral-sh/setup-uv` → `uv sync` → `ruff check` → `uv run pytest`.
- Pre-commit: ruff format + check.
- Conventional commits. ADR for every significant decision (template provided).
- This pass commits directly to `main`. After Gemma finishes module 08 she switches to feature branches + PRs.
- Collaborator: `gemmakelly-clamp` invited to the repo (manual step for Alberto if API invite fails).

## 10. CLAUDE.md requirements

Concise (< 60 lines): repo purpose and map; house lesson anatomy pointer; uv commands (`uv sync`, `uv run pytest`); security rules (never read/commit secrets; anonymized student data only); teaching tone (visual, encouraging, hint-don't-solve for homework); spec-driven + ADR + TDD conventions.

## 11. QUESTIONS_FOR_GEMMA.md

Functional questionnaire, grouped, answerable in-file (her first git commit). Covers: calendar xlsx access + real tab structure; her timetable (classes, periods/week); term dates; planner output format preference; sample exam scans + mark schemes availability; priority subjects/papers; how she currently annotates; top-3 most repetitive weekly tasks; SIMS VM details; Cognita Connect access method; whether school IT allows Graph device-code login; her weekly learning time budget; Mac setup status.

## 12. Out of scope (this pass)

Full prototype implementations; real MS Graph app registration; GCP deployment; n8n; SIMS/Cognita/SchoolCloud integrations; real school calendar and student data.

## 13. Success criteria

- `git clone` + `uv sync` + `uv run pytest` passes green on a fresh machine (all module tests + scaffold tests).
- CI green on GitHub.
- Gemma can start module 01 with zero help: README tells her exactly what to do first.
- Every module INDEX.md has a colored mermaid diagram, curated links, and a checklist.
- All four scaffolds import cleanly and have at least one passing test each.
- Homework tests fail helpfully before homework is done, pass after.
