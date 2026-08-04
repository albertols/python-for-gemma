# ADR-000: Decisions pending Gemma's answers

**Date:** 2026-08-04
**Status:** Proposed

## Context

This scaffold (calendar reader + models + mock `.xlsx` + test) was
built ahead of Gemma's answers to `QUESTIONS_FOR_GEMMA.md`, per
[ADR-004](../../../../docs/adr/004-first-pass-scope.md) — the first
pass ships every prototype scaffolded against mock data, so nothing
here should guess at facts only Gemma knows. Several real decisions
are open until she answers the "Teacher Planner" section (A1–A5). This
ADR exists to record them explicitly rather than let them get baked in
silently as defaults.

## Decision

Not yet decided — listed here as open questions, one per blocked
choice:

- **Output format** (Excel / Word / Markdown / OneNote) — pending A5.
  The export step (see README roadmap) can't be designed until we know
  which format Gemma will actually open and edit day to day.
- **Real calendar schema** (sheet names, columns, extra tabs like term
  dates or bell times) — pending A2. `read_calendar()` currently
  assumes a single "Calendar" sheet with week-start dates in column A
  and a label in column B, matching the mock file; the real workbook
  may differ.
- **Term-date source** (2025–26 term start/end dates, and whether they
  live in the same workbook as the weekly calendar or elsewhere) —
  pending A4. The planned `Term` builder (see README "What's next")
  needs this before it can group weeks into terms.

## Consequences

- Until A2/A4/A5 are answered, this prototype stops at "read a calendar
  into `CalendarWeek` objects" — none of the Scheme of Work, weekly
  planner, or export steps are safe to build yet without risking
  rework against assumptions that turn out wrong.
- Once answered, expect this ADR to be superseded by one ADR per
  decision (output format, calendar schema, term-date source) with an
  `Accepted` status, following the project's "one ADR per significant
  decision" convention.
