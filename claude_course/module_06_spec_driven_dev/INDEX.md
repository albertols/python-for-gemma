# 🎓 Module 06 — Spec-Driven Development

This entire repo was built the same way you're about to practise: brainstorm
what's needed, write it down as a spec, turn the spec into a step-by-step
plan, then build against the plan — writing the test before the code at
every step. Big decisions along the way get written down too, as ADRs
("why we chose this, not that"), so nobody has to guess later. This module
walks you through that discipline and has you write your first spec.

## 🎯 What you'll learn

- The four-stage workflow behind this whole repo: brainstorm → spec → plan → build
- What an ADR (Architecture Decision Record) captures, and why the "why" matters more than the "what"
- How Test-Driven Development works when Claude is doing the typing: write the test first, watch it fail red, then make it pass green
- How to write a mini-spec: a short, scoped description of a tool — inputs, outputs, and what's explicitly out of scope — before any code exists

## 🗺️ Concept map

```mermaid
flowchart LR
    A["💡 Brainstorm"]:::concept --> B["📐 Spec"]:::concept
    B --> C["🗺️ Plan"]:::concept
    C --> D["🏗️ Build"]:::concept
    D --> E["📜 ADRs"]:::concept
    E --> F["🧪 TDD with Claude"]:::ai
    F --> G["🛠️ Hands-on: mini-spec"]:::win
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

## 📚 Learn

| Topic | Concept | 📖 Docs | 🎬 Video |
|---|---|---|---|
| Common workflows | explore → plan → code → commit, delegating research to subagents | [Common workflows](https://code.claude.com/docs/en/common-workflows) | [Search: Claude Code spec driven development](https://www.youtube.com/results?search_query=claude+code+spec+driven+development) |
| Best practices | plan mode in practice, giving Claude a way to verify its work | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | [Search: Claude Code best practices](https://www.youtube.com/results?search_query=claude+code+best+practices) |

## 🛠 Hands-on exercise

Read [`docs/adr/001-prototype-build-order.md`](../../docs/adr/001-prototype-build-order.md)
in full. Notice its four sections: Context (what's at stake), Decision (what
was chosen), and Consequences (what that costs and buys). Then, **practice
only** — nothing else in this repo depends on it yet — write a short
mini-spec for a "parent email draft" script:

- **Input**: what would it need to know about a student and a situation?
- **Output**: a positive-tone draft and a concerns-tone draft — what should each contain?
- **Out of scope**: what should this *not* try to do yet?

Save it as a new file under
[`docs/superpowers/specs/`](../../docs/superpowers/specs/), following the
naming pattern of the spec already there (`YYYY-MM-DD-short-title.md`).
This is direct practice for the real thing you'll build in Module 07.

## ✅ Progress checklist

- [ ] Read all of `docs/adr/001-prototype-build-order.md`
- [ ] Can explain in one sentence why AI_TEACHER_PLANNER was built before AI_EXAMINER
- [ ] Wrote a mini-spec (input / output / out-of-scope) for the "parent email draft" script
- [ ] Saved it under `docs/superpowers/specs/` with a dated filename
- [ ] Watched a TDD example run red-then-green with Claude (any `-m homework` run counts)

## 🧭 You know you've got it when…

- You can explain brainstorm → spec → plan → build to someone else in under a minute
- Your mini-spec file exists, reads clearly, and you didn't have to explain it out loud
- You can say why an ADR is written *before* the decision is forgotten, not after

## 🆘 When you're stuck

1. Re-read the 📚 Learn links above — the docs almost always answer it directly.
2. Ask Claude itself: "help me turn this rough idea into a spec" is a completely normal thing to say.
3. Ask Alberto if you're still stuck after trying both.
