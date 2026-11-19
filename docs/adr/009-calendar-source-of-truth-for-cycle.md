# ADR-009: The school calendar is the source of truth for the fortnight cycle

**Date:** 2026-11-19
**Status:** Accepted

## Context

The school runs a two-week timetable, and every date in the plan depends on knowing whether a day is Week 1 or Week 2. The obvious shortcut is to alternate from the first week of term. The school's calendar workbook shows why that fails. Its `Calendar 2026-27` sheet has one row per day with a `Week1/2` label, and the real cycle is uneven: 21 to 22 December is a two-day Week 2, Friday 8 January is a Week 1 by itself, and after half-term ends on Friday 12 February (Week 2) school returns on Monday 22 February as Week 1. The sheet also has noise: a stray `x` in the week column, a row with the wrong weekday, and report deadlines whose weekday does not match their date. The school edits it during the year.

## Decision

The importer reads the week label for each date and never computes it. It finds columns by their header text, checks that each row is the day after the previous one, and takes the weekday from the date instead of the Day column. A labelled day is not automatically a *pupil day*: staff-training days before 4 September carry a label, so the engine keeps the label and "pupils are in" as two separate facts. Anything odd goes into an import report for Gemma to read, never a silent guess. Lost lessons are *disruptions* with a scope (school, year group, group or teacher) and an effect (cancelled or cover). Importing an updated workbook is a three-way comparison of the previous import, the new one, and her own overrides.

## Consequences

- The plan follows the school's real cycle. Local tests on her file check 91 Week 1 days, 94 Week 2 days, and that 22 February is Week 1.
- Every lost lesson can be shown with the calendar text that caused it, on a slot audit screen.
- Free-text events (mocks, trips, study leave) never cancel a lesson until she confirms. Each distinct wording is asked once and remembered.
- Her edits survive a re-import, because they are stored apart from the imported rows.
- Trade-off: the planner depends on the workbook's layout. If the school renames a header, the import stops with a clear message instead of carrying on.
- Rules out: computing the cycle from week numbers, and quietly "fixing" bad cells.
