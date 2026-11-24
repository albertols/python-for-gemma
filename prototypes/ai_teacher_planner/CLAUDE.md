# CLAUDE.md — AI Teacher Planner

A local web app that turns Gemma's syllabus, scheme of work, school calendar and two-week timetable into a dated lesson plan for each group. Fixed rules do the dates; Claude helps with judgement calls and is labelled wherever it does.

**Status:** M1 built (calendar, timetable, slots, Setup, board, Today, slot audit); M2 next.

## Read first
- Spec: `docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md` (appendix D lists what changed after approval)
- Plan: `docs/superpowers/plans/2026-11-24-ai-teacher-planner-v1.md` is the index (constraints, conventions, shared types); one file per milestone beside it. Work the tasks in order
- Diagrams, one glance each: `docs/design/ai-teacher-planner/README.md`
- Decisions: `docs/adr/006` to `016` (005 is reserved for Gemma)
- Gemma's requirements: `src/ai_teacher_planner/template_prompt.md`. It is her document: do not edit it

## Map (target layout; M1 is built, the rest arrives with its milestone)
- `packages/domain` — the engine. Pure TypeScript
- `packages/importers`, `packages/exporters` — files in, files out
- `packages/ai` — `AiProvider` port, Claude CLI adapter, fake adapter
- `packages/content-creator` — resource refresher, cover lesson, independent task
- `apps/api` — local Node API, SQLite, `ResourceGateway`; serves the built web app
- `apps/web` — React app
- `features/` Gherkin · `fixtures/` synthetic data · `e2e/` browser tests · `data/` git-ignored local data
- `src/ai_teacher_planner/*.py`, `tests/`, `mock_data/` — the Python scaffold from the course. Leave it alone

## Commands (keep this list true)
Tools come from mise. If `node` or `pnpm` is "not found", prefix with `~/.local/bin/mise exec --`.
- `pnpm install`
- `pnpm start` — builds the web app if it is out of date, starts the API on port 4319, opens the browser. Ctrl+C stops it. If a planner already answers on the port it just opens the browser
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (Vitest, all packages) · `pnpm e2e` (builds, then runs the Gherkin browser tests with axe on port 4320)
- `pnpm seed:synthetic --data-dir <dir>` — fills a folder with the synthetic school year. Refuses `data/` unless `--force`
- Environment variables, read once in `apps/api/src/config.ts`: `PLANNER_DATA_DIR` (default `data/`), `PLANNER_RESOURCES_DIR` (default `prototypes/resources`), `PLANNER_PORT` (4319), `PLANNER_AI` (`claude`, `fake` or `off`), `PLANNER_FIXED_TODAY` (a date such as 2026-11-20, for tests and screenshots), `PLANNER_TIME_ZONE`, `PLANNER_TEST_ROUTES=1` (browser tests only; refused outside a seeded temporary folder), `PLANNER_NO_OPEN=1` (`pnpm start` does not open a browser; use it when an agent starts the app)
- `sh docs/design/render.sh` — re-render diagrams

## Rules that must hold
1. **The engine is pure.** Dates are `YYYY-MM-DD` strings, `today` is an argument. No clock, randomness, disk, network, DOM or Node APIs in `packages/domain`.
2. **Read the week label, never compute it.** The calendar says which days are Week 1 or Week 2. Real cases: a two-day Week 2 (21 to 22 Dec 2026), a one-day Week 1 (8 Jan 2027).
3. **Nothing is applied silently.** Every plan change is a proposal with a diff that Gemma accepts, and it can be undone.
4. **Decisions are stored; placements are derived.** Accepted plans are immutable revisions.
5. **Models never write and never read school folders.** They get extracted text and return JSON that is validated against a schema.
6. **Files are read only through `ResourceGateway`** and its allowlist.
7. **Every stored item has provenance** (`engine`, `ai`, `teacher`, `import`). AI items need her review before export, and show the AI badge in the GUI.
8. **No student data.** No names, no marks, in code, fixtures, tests, commits or prompts.
9. **Never guess bad data.** Odd calendar cells go into the import report.

## How to work
- Spec, then a Gherkin scenario in `features/`, then a failing test, then code.
- Scheduler invariants are property tests (spec section 10.14).
- Tests use `FakeAiProvider`. CI has no access to Claude or to `prototypes/resources/`.
- Tests on Gemma's real files are local-only and skip when the folder is absent.
- Run axe and the browser tests from the first screen onward; keyboard "Move to…" before pointer drag.
- A change to modules, ports, routes, the data model, the AI flow or the stack updates its diagram in the same commit. Use the `architecture-visual-docs` skill for that; it lists which diagrams each kind of change touches.
- When a teacher-side AI action has been done by hand more than twice, promote it to a skill in `.claude/skills/` with an output schema, and register it in `packages/ai`.

## Definition of done
Scenario written and passing; tests written first; type-check and lint clean; no real names or student data; AI output has provenance and a review step; diagrams updated; validated in Chrome with a screenshot in `docs/design/ai-teacher-planner/screens/`; Gemma has clicked through it.

## Headless Claude, as proven on 19 Nov 2026
`claude -p "<prompt>" --tools "" --setting-sources "" --strict-mcp-config --disallowedTools "mcp__*" --permission-mode dontAsk --output-format stream-json --verbose --json-schema '<schema>' --no-session-persistence < /dev/null`, with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` unset. Never `--bare`: it ignores the subscription sign-in. See ADR-007.

## Machine limits
M1 Air, 8 GB RAM. No Docker, no database server, no long-running dev server in daily use, one Playwright worker, use the installed Chrome (`channel: 'chrome'`).
