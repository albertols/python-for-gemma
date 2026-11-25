# CLAUDE.md

## What this repo is
Gemma's Agentic AI Masters course — a Python + Claude Code curriculum built for a beginner teacher, with real teaching prototypes at the end. Packages are learning modules; lessons are heavily commented files, not slides.

## Map
- `python_course/` — 8 modules, Python fundamentals through testing
- `claude_course/` — 7 modules, path to "Claude Architect"
- `prototypes/` — 4 scaffolded apps (planner, automation, companion, examiner)
- `prototypes/ai_teacher_planner/` — the first real build: a TypeScript web app beside the Python scaffold. It has its own `CLAUDE.md`; read it before working there
- `prototypes/resources/` — Gemma's local teaching files. Git-ignored, never committed (see Security)
- `docs/` — specs, plans, ADRs, security model
- `docs/design/` — architecture diagrams as code (D2 → SVG), one folder per app; kept current with the `architecture-visual-docs` skill
- `.claude/` — skills, agents, permission deny rules

## Commands
- `uv sync --all-packages` — install everything
- `uv run pytest` — full suite, homework excluded (keeps CI green)
- `uv run pytest python_course/module_XX_<name> -v -m homework` — check one module's homework
- `uv run ruff check .` — lint
- `mise install` — Node, pnpm and D2 at the versions in `mise.toml` (no Homebrew on this Mac; if a tool is "not found", prefix with `~/.local/bin/mise exec --`)
- `sh docs/design/render.sh` — re-render the diagrams; `--check` fails if any SVG is stale

## House style
All course content follows the House Style Contract in `docs/superpowers/plans/2026-08-04-agentic-ai-masters-foundation.md` (as evolved in `.claude/skills/lesson-creator/SKILL.md` — the skill wins where they differ) — lesson anatomy, homework TODO+tests, INDEX.md with mermaid palette.

## Security — NON-NEGOTIABLE
Never read, print, or commit `.env*`, `secrets/`, or token caches. Deny rules live in `.claude/settings.json` — never weaken them. Student files use anonymized names only (`student1_YYYY_MM_DD_SUBJECT.png`), never real names.

`prototypes/resources/` holds student work in folders named after students, plus copyrighted textbooks. Never stage it (no `git add -A` without checking `git status` first), never list or open the denied folders, and never repeat a personal name seen in a path. Details: `docs/security.md` and ADR-011.

## Teaching tone
Visual, encouraging, hint-don't-solve for homework. When Gemma asks for help on an exercise, explain the concept — never write her answer.

## Engineering conventions
Spec → plan → build, tracked in `docs/superpowers/`. One ADR per significant decision, in `docs/adr/`. TDD. Conventional commits. Feature branches + PRs start after module 08.

Who is driving: Gemma is the learner; Alberto is the tech lead and says so when he is at the keyboard. The teaching tone applies to Gemma. Either way, exercises addressed to Gemma (for example ADR-005 and Part 11 of the planner template) stay hers to write.
