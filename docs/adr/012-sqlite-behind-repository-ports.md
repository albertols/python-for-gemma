# ADR-012: One SQLite file, behind repository ports

**Date:** 2026-11-19
**Status:** Accepted

## Context

The planner has one user, runs on an 8 GB laptop, and must cost nothing ([ADR-006](006-planner-local-first-typescript-monorepo.md)). It needs to keep her decisions and plan revisions ([ADR-010](010-decisions-as-rows-immutable-plan-revisions.md)) safely between sessions. A database server such as Postgres would need a background process and setup she should not have to think about. Plain JSON files would be simple but make it easy to half-save a change. Later, a shared "360 platform" for a department would need a real server database, so the choice should not block that.

## Decision

Use SQLite: a whole database in a single file, with no server. The file lives in `prototypes/ai_teacher_planner/data/`, which git ignores. The API reads and writes it with better-sqlite3 and Drizzle (a library that gives typed queries). The rest of the code never writes SQL. It talks to *repository ports*, small interfaces such as "save this pin" or "load the current revision", and only the SQLite adapters behind them know the database. Changes to the table layout go through *migrations* (numbered scripts that upgrade the file step by step), and the app backs the file up automatically, including before every migration.

## Consequences

- Nothing extra to install or keep running, and the whole plan is one file that is easy to copy.
- A change either saves completely or not at all, which JSON files cannot promise.
- Tests use a throwaway in-memory database, so they are fast and leave nothing behind.
- better-sqlite3 was chosen over Node's built-in `node:sqlite` because the built-in one is still a release candidate. It ships ready-built for Apple Silicon, so there is no compile step.
- Moving to Postgres later means writing new adapters behind the same ports, not rewriting the app.
- Trade-off: one writer at a time, so no shared use; and an extra layer of interfaces to maintain.
- Trade-off: the data is outside git. If the Mac is lost, the plan is lost unless a backup was copied elsewhere.
- Rules out: storing student names or marks in this file ([ADR-011](011-resources-data-boundary.md)).
