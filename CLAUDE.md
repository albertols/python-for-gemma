# CLAUDE.md

## What this repo is
Gemma's Agentic AI Masters course — a Python + Claude Code curriculum built for a beginner teacher, with real teaching prototypes at the end. Packages are learning modules; lessons are heavily commented files, not slides.

## Map
- `python_course/` — 8 modules, Python fundamentals through testing
- `claude_course/` — 7 modules, path to "Claude Architect"
- `prototypes/` — 4 scaffolded apps (planner, automation, companion, examiner)
- `docs/` — specs, plans, ADRs, security model
- `.claude/` — skills, agents, permission deny rules

## Commands
- `uv sync --all-packages` — install everything
- `uv run pytest` — full suite, homework excluded (keeps CI green)
- `uv run pytest python_course/module_XX_<name> -v -m homework` — check one module's homework
- `uv run ruff check .` — lint

## House style
All course content follows the House Style Contract in `docs/superpowers/plans/2026-08-04-agentic-ai-masters-foundation.md` — lesson anatomy, homework TODO+tests, INDEX.md with mermaid palette.

## Security — NON-NEGOTIABLE
Never read, print, or commit `.env*`, `secrets/`, or token caches. Deny rules live in `.claude/settings.json` — never weaken them. Student files use anonymized names only (`student1_YYYY_MM_DD_SUBJECT.png`), never real names.

## Teaching tone
Visual, encouraging, hint-don't-solve for homework. When Gemma asks for help on an exercise, explain the concept — never write her answer.

## Engineering conventions
Spec → plan → build, tracked in `docs/superpowers/`. One ADR per significant decision, in `docs/adr/`. TDD. Conventional commits. Feature branches + PRs start after module 08.
