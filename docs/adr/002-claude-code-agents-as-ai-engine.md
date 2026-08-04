# ADR-002: Claude Code agents as AI engine

**Date:** 2026-08-04
**Status:** Accepted

## Context

Every prototype needs an AI engine for tasks like reading calendars intelligently, generating practice questions, or grading against a rubric. A raw Anthropic API integration would require Gemma to manage an API key and billing — friction for a complete beginner working with a mentor who has little time.

## Decision

Prototypes run their AI reasoning as Claude Code skills/agents on Gemma's own machine first: zero API-key management, already covered by her Claude subscription, and it reinforces the Claude course she is taking in parallel. The Python core of each prototype stays API-ready — AI calls sit behind a small interface — so swapping to the Anthropic API for a later cloud deployment (GCP, generic enough for AWS/Azure) is a config change, not a rewrite.

## Consequences

- No secrets or API keys enter this repo or Gemma's environment for the prototypes to work.
- Every prototype doubles as hands-on practice for the Claude course (skills, agents).
- The Python core must not hard-code "Claude Code" assumptions into its business logic — AI calls are isolated behind an interface from day one.
- A future move to a hosted deployment is scoped as a swap of the AI-calling layer, not a redesign.
