# ADR-006: Planner as a local-first, full-stack TypeScript monorepo

**Date:** 2026-11-19
**Status:** Accepted

## Context

The planner was scaffolded as a small Python Excel reader ([ADR-001](001-prototype-build-order.md)). Gemma's finished requirements ask for much more: a board in the shape of her two-week timetable with cards she can move, instant previews when a lesson is lost, Office exports, and AI help that costs nothing and keeps school files on her 8 GB MacBook Air. Alberto chose TypeScript and React for this (template Part 9.1). Three shapes were on the table: (1) a *local full-stack* app, meaning a web page, a small program on her Mac that the page talks to (the "API"), and one database file; (2) a browser-only app with all AI done by hand in a terminal; (3) a hosted platform with logins and a cloud database.

## Decision

Build option 1 as a *monorepo* (several small packages in one folder that share one install) under `prototypes/ai_teacher_planner/`: a React web app, a local Node API, a SQLite file, and the scheduling engine as a pure TypeScript package that both the web app and the API import. Option 2 was rejected because a browser cannot read her OneDrive folder or write good Office files, and it leaves no AI buttons in the GUI. Option 3 was rejected because it needs paid API keys, school data-protection sign-off, and is by far the largest build. ADR-005 is reserved for Gemma's own write-up of the move to TypeScript (template Part 11.1), so this ADR does not replace it.

## Consequences

- One language from the engine to the screen, so the browser can run the same scheduling rules as the API and show a preview without waiting.
- Nothing leaves her Mac except the text sent to Claude through her own Claude Code ([ADR-007](007-ai-provider-port-headless-claude.md), [ADR-011](011-resources-data-boundary.md)).
- Versions checked on 19 Nov 2026: Node 26.13 LTS (installed with mise, a tool-version manager that needs no admin rights), pnpm 12.22, TypeScript 7.0.2, React 19.3, Vite 8.3, Vitest 5.1, Hono 4.13 with `@hono/zod-openapi` 1.6 and Zod 4.6, Drizzle 0.45 with better-sqlite3 13.2, Biome 2.6. A throwaway project using all of them passed type-check, tests and build with TypeScript 7 that day. Exact versions are pinned at install.
- Biome does the linting and formatting, because the usual ESLint plugin for TypeScript does not accept TypeScript 7 yet.
- The Python scaffold (`calendar_reader.py`, `models.py` and their test) stays untouched. It is part of the course story and CI still tests it.
- This refines [ADR-003](003-python-msgraph-automation-stack.md) for this prototype only. `automation_flows` keeps Python and Microsoft Graph.
- Trade-off: the repo now has two toolchains (uv for Python, pnpm for TypeScript), and Gemma cannot read the planner's code as easily as her Python lessons. `mise.toml` pins the tools so setup stays one command.
- Rules out for v1: logins, student, parent and Head of Department views, and any hosting. The role rules are still written down and tested so they can be switched on later.
