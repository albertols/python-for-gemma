# ADR-001: Prototype build order

**Date:** 2026-08-04
**Status:** Accepted

## Context

Four prototypes are planned for this repo: AI_TEACHER_PLANNER, AUTOMATION_FLOWS, AI_HOMEWORK_EXAM_PRACTISE_COMPANION, and AI_EXAMINER. Alberto has limited mentoring time and Gemma is a Python beginner, so the build order matters: the first prototype sets the tone and needs to be a confidence-building win, not a struggle.

## Decision

Build AI_TEACHER_PLANNER and AUTOMATION_FLOWS first, in parallel; then AI_HOMEWORK_EXAM_PRACTISE_COMPANION; then AI_EXAMINER last. AI_TEACHER_PLANNER is pure-Python Excel parsing — a perfect first prototype, and it doubles as a worked example for AUTOMATION_FLOWS. AI_EXAMINER is the hardest (vision models + rubric grading) and benefits from the shared rubric thinking that AI_HOMEWORK_EXAM_PRACTISE_COMPANION lands first.

## Consequences

- Gemma gets an early, tangible win (a working calendar/planner reader) before facing the harder prototypes.
- AUTOMATION_FLOWS shares patterns with AI_TEACHER_PLANNER, so building them together avoids duplicated learning.
- AI_EXAMINER's rubric/vision complexity is deferred until the domain model (BLT rubrics) has already been exercised by the companion prototype.
- This order is a scaffolding decision only — full builds for all four still wait on Gemma's questionnaire answers (see ADR-004).
