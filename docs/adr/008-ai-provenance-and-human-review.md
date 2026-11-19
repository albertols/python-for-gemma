# ADR-008: Provenance and human review for everything AI produces

**Date:** 2026-11-19
**Status:** Accepted

## Context

Alberto asked that the GUI show which parts were calculated by fixed rules and which came from a model. Gemma's own rules say she reviews every AI-generated resource before students see it, and her anti-goal is spending longer checking the plan than making it by hand. Those pull in the same direction: she should be able to see at a glance what needs her eye and trust that the rest is arithmetic. That only works if the app remembers where each item came from. The word for that record is *provenance*.

## Decision

Every stored item records its origin: `engine` (fixed rules), `ai`, `teacher` or `import`. AI items also record the provider, model, skill, time and sources, plus a review state: `suggested`, `accepted`, `edited` or `rejected`. In the GUI, AI content waiting for review has a sparkle icon and a dashed outline; accepted content keeps a small sparkle; content she changed shows sparkle plus pencil. Engine output has no badge, and a "Why is this here?" popover shows the rule and its inputs. Exports leave out unreviewed AI items and say so.

## Consequences

- She checks the sparkles and nothing else. The legend states that everything without one is calculated from her calendar and timetable.
- The icon carries the meaning, not colour alone, so it works for colour-blind users and does not clash with the purple of her IB H group.
- The popover names the provider and model, so a different engine later ([ADR-007](007-ai-provider-port-headless-claude.md)) needs no redesign.
- An activity drawer lists every AI run, which gives a simple audit trail.
- The same honesty applies to history: lessons she declared as done look different from lessons logged week by week.
- Trade-off: every table carries extra columns, and every AI feature costs her one more click to accept.
- Rules out: AI output applied to the plan or exported without review, and AI choosing or applying a catch-up option. It may only write the content for an option she has picked.
