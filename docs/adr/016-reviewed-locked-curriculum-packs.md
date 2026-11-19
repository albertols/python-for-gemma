# ADR-016: Reviewed, locked curriculum packs instead of PDF parsers

**Date:** 2026-11-19
**Status:** Accepted

## Context

To tick off coverage, the planner must know each course's specification: its units, topics and spec points, and which textbook chapter teaches which point. The three specifications are PDFs laid out in three different ways. IAL Unit 4 has 16 sub-topics that match chapters 22 to 37 one to one. IGCSE maps several chapters to one spec point. IB marks HL-only content in titles and in bold. A program that reads any such PDF correctly every time would be a large build, and a wrong reading would go unseen. That is exactly Gemma's anti-goal: time spent checking the plan against the syllabus. Specifications also change only every few years, and they are the exam boards' copyright.

## Decision

Each course gets one *curriculum pack*: a single JSON file, checked against a schema (a description of the shape it must have), holding the units, topics, spec points, HL-only flags and the links from textbook chapters to spec points, each with a page reference to the specification. A pack is built once with AI help (the `planner-build-curriculum-pack` skill reads the extracted text and proposes it), reviewed by Gemma against the pages cited, and then locked: its fingerprint is recorded and any change means a new reviewed version. There is no general PDF parser. Only the school calendar gets a repeatable importer, because only the calendar changes during the year ([ADR-009](009-calendar-source-of-truth-for-cycle.md)).

## Consequences

- She checks each course once, with page numbers beside every point, instead of doubting the mapping every week.
- A spec point with no chapter linked shows as "unmapped", never as "not taught", and a course cannot be used until none are unmapped.
- Units taught in other years are marked out of scope, so they do not appear as gaps.
- Packs stay in the git-ignored `data/` folder and are not committed, out of respect for the boards' copyright. Tests use a made-up curriculum ([ADR-011](011-resources-data-boundary.md), [ADR-013](013-test-strategy-spec-bdd-tdd.md)).
- A new subject later costs one pack and one review, with no new code.
- Trade-off: building and reviewing the IGCSE and IB packs is real work up front, and a new edition of a specification means doing it again.
- Trade-off: a pack lives only on her Mac, so it needs the same backup care as the database ([ADR-012](012-sqlite-behind-repository-ports.md)).
- Rules out: silent AI edits to a locked pack, and trusting an unreviewed AI reading of a specification.
