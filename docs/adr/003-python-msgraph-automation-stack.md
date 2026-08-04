# ADR-003: Python + Microsoft Graph automation stack

**Date:** 2026-08-04
**Status:** Accepted

## Context

Gemma's school runs a Microsoft-heavy stack (Teams, OneDrive, SharePoint) alongside SIMS (via VM), Cognita Connect, and SchoolCloud. Her machine is a MacBook Air M1 with 8 GB RAM, so any automation tooling needs to be lightweight. A visual workflow tool such as n8n was considered as an alternative to hand-written automation.

## Decision

Use plain Python plus the Microsoft Graph API, authenticated with the device-code flow so tokens live only in the local MSAL cache. No n8n.

## Consequences

- Every automation script doubles as a Python lesson, reinforcing the course instead of competing with it.
- No extra runtime (like n8n's Node/Docker footprint) competes for the 8 GB of RAM.
- The whole stack is free — no self-hosted service, no subscription.
- Trade-off: Gemma writes and debugs plain Python for automations rather than dragging visual nodes; this is intentional given the course's teaching goals.
- Device-code authentication means Gemma signs in through her own browser; no client secret is ever stored in the repo (see `docs/security.md`).
