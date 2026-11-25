# ADR-015: Content-creation features live in their own module

**Date:** 2026-11-19
**Status:** Accepted

## Context

All through her template Gemma assigns resource creation to an "AI content creator prototype": updating chapter PowerPoints with current events, producing cover work, and writing tasks students cannot just hand to an AI. No such prototype exists in `prototypes/` yet ([ADR-001](001-prototype-build-order.md) lists four, and this is not one of them). Three of these features are in the planner's first version: the resource refresher (a Must, feature 7), the cover lesson (feature 6) and the AI-resistant independent task (feature 8). Built straight into the planner's scheduling code, they would be hard to move out later.

## Decision

The three features live in their own package, `packages/content-creator`, and their skills are named `content-*`: `content-refresh-resource`, `content-cover-lesson` and `content-independent-task`. The package knows nothing about scheduling. It receives a small, plain input from the planner (the planned lesson, its topic, the year-group policy, extracted slide text) and reaches the model only through the AI provider port ([ADR-007](007-ai-provider-port-headless-claude.md)). The planner's GUI shows these features as its own buttons. Fresh exam practice (new case studies and question variants, feature 11) is not built here: Gemma placed it with the AI Examiner.

## Consequences

- When the content creator becomes a prototype of its own, the package and its skills can be lifted out with their tests.
- The scheduling engine stays free of AI. It works in full when no model is available.
- All three outputs follow the same review rule: suggested first, exported only once she accepts ([ADR-008](008-ai-provenance-and-human-review.md)).
- The refresher never changes her original PowerPoint. It produces suggested slides and says where each would go.
- Trade-off: one more package and one more boundary to keep clean, for features that today have a single caller.
- Open question for Gemma: whether "AI content creator" is a fifth prototype. This ADR assumes yes, later.
- Rules out: exam-question generation in the planner, and content features that read the planner's database directly.
