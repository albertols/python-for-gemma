# ADR-013: Test strategy: spec, then scenario, then failing test

**Date:** 2026-11-19
**Status:** Accepted

## Context

Alberto asked for spec-driven, behaviour-driven and test-driven development, and Gemma has already written her acceptance tests as Given / When / Then (template Part 10). The biggest risk to her trust is a wrong date: one misread week label shifts every later lesson, and she would find out in class. Two things make testing harder than usual. Her real files cannot go to GitHub ([ADR-011](011-resources-data-boundary.md)), so CI cannot use them, and CI has no Claude sign-in.

## Decision

Work in a fixed order: agree the spec, write the scenario, write a failing test, then write the code.

- **Scenarios** live in `features/` as Gherkin files (Given / When / Then in plain English). They run at two levels: against the engine directly under Vitest, and for the main journeys through a real browser with Playwright.
- **Property tests** check rules that must hold for any input, such as "no lesson lands on a day without a week label" and "undo after accept changes nothing".
- **Synthetic quirk fixtures** are made-up calendars that copy the real one's traps (the two-day Week 2, the lone Friday, the stray `x`, a wrong weekday, merged cells, labelled staff days). CI uses these.
- **Golden tests** run on her real files, on her Mac only, and are skipped when the folder is absent.
- **Browser checks** start with the first screen: Playwright drives the Chrome already installed, one worker at a time, with axe accessibility checks.
- **An agentic pass** follows each milestone: Claude in Chrome clicks through every acceptance test and saves screenshots to `docs/design/ai-teacher-planner/screens/`.
- AI in tests always goes through the fake provider ([ADR-007](007-ai-provider-port-headless-claude.md)), plus one opt-in live check of the real CLI.

## Consequences

- Gemma's own sentences become the tests, so she can read what "done" means.
- CI needs neither the resources folder nor Claude, and stays fast.
- The calendar's known traps are tested on every push, and her real calendar is tested whenever the suite runs on her Mac.
- Accessibility is checked from the start instead of patched at the end.
- No browser download: using the installed Chrome saves disk and memory on an 8 GB machine.
- Trade-off: scenarios at two levels mean some step wording is written twice, and the fixtures must be updated when a new calendar quirk appears.
- Trade-off: golden tests cannot protect a contributor who does not have her files.
- Rules out: code without a failing test first, and tests that call a live model in CI.
