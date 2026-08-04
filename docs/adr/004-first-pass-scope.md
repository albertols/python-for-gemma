# ADR-004: First-pass scope

**Date:** 2026-08-04
**Status:** Accepted

## Context

This repo could be built incrementally, waiting for Gemma's answers before scaffolding anything, or front-loaded so she has a complete course to start immediately. Alberto's time is scarce, so the first pass needs to leave Gemma as self-sufficient as possible without guessing at details only she knows (her timetable, her students' real needs, her school systems).

## Decision

The first pass ships: the tooling foundation; the full Python course (8 modules); the full Claude Code course (7 modules); the `.claude/` skills and agents; and all four prototypes scaffolded against mock data. Full prototype builds (real calendar data, real rubrics, real automation targets) wait until Gemma has answered `QUESTIONS_FOR_GEMMA.md`.

## Consequences

- Gemma can start learning — modules 01 through the Claude Architect capstone — the moment she clones the repo, with zero blocking questions.
- The prototypes are real, runnable, and tested against mock data, so she sees working software early, but nothing assumes facts about her school that only she can supply.
- Once she answers the questionnaire, prototype work resumes in the order set by ADR-001, now grounded in her real timetable, calendar, and marking practice.
- Risk: mock data must stay clearly labelled as mock so nobody mistakes a scaffold for a finished tool.
