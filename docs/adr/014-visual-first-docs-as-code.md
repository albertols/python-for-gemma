# ADR-014: Visual-first documentation, written as code

**Date:** 2026-11-19
**Status:** Accepted

## Context

Alberto asked for architecture documentation that can be understood at a glance (the stack, the modules, front end, back end, and how the app talks to AI models) and that stays up to date. He suggested SVG or PNG from draw.io "or other tools". The repo already uses Mermaid diagrams inside Markdown with a house palette. Diagrams drawn by hand in a drawing tool look good on day one and then fall behind the code, because updating them means opening the tool and dragging boxes. draw.io also needs a large desktop app to export images, and this Mac has no Homebrew to install it with.

## Decision

Architecture diagrams are written as text in D2 (a small language for describing diagrams, which lays the boxes out by itself). Sources live in `docs/design/<topic>/src/*.d2`, share one style file with the house palette, and are turned into SVG images by `sh docs/design/render.sh`. The SVGs are committed beside a one-page `README.md` that shows them all. D2 0.9 is installed through mise and pinned in `mise.toml`. CI runs `render.sh --check` and fails if a committed SVG no longer matches its source. Mermaid stays for small inline flows in Markdown. The `architecture-visual-docs` skill holds the conventions.

## Consequences

- A diagram changes in the same commit as the code it describes, and a reviewer sees the change as a readable text diff.
- Claude can update a diagram reliably, because it edits text instead of coordinates.
- One palette everywhere: blue for our code, green for data that stays on the Mac, amber for a boundary or risk, purple for anything involving a model. Purple also matches the AI accent in the GUI ([ADR-008](008-ai-provenance-and-human-review.md)).
- Real screenshots from the browser checks sit beside the diagrams ([ADR-013](013-test-strategy-spec-bdd-tdd.md)).
- Trade-off: the layout is automatic, so a diagram cannot be nudged into exactly the shape a designer would draw. The rule of about twelve boxes per diagram keeps that readable.
- Trade-off: nobody can drag a box with a mouse; changing a diagram means editing its `.d2` file.
- Rules out: hand-drawn draw.io files as the source of truth, and diagrams that exist only as pictures with no source.
