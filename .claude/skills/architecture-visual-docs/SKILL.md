---
name: architecture-visual-docs
description: Use when a code or design change adds, removes or renames a module, package, port, adapter, screen, entity, data flow, AI step or tool in an app that has diagrams under docs/design/; when adding a new architecture diagram; when a diagram looks stale or the CI diagrams job fails; or when asked for visual-first architecture documentation (D2, SVG).
---

# Architecture Visual Docs

## Overview

Architecture here is documented as pictures first: D2 sources in `docs/design/<app>/src/`, rendered SVGs beside the `README.md` that indexes them. A diagram that disagrees with the code is a bug, fixed in the same commit as the change that caused it.

**The output of this skill is exactly three things:** changed `.d2` files, their re-rendered `.svg` files, and the matching lines of `docs/design/<app>/README.md`.

Decisions live in ADRs (`docs/adr/`) and agreed designs in the spec (`docs/superpowers/specs/`). This skill edits neither. When a change reflects a decision that has no ADR, or goes beyond the approved spec, say so in your report under "Findings" and leave those files alone.

## Which diagrams does a change touch?

Go through every row. Most changes hit two or three diagrams. This table is for `docs/design/ai-teacher-planner/`; for another app, use the "Answers" column of its README index the same way.

| The change… | Update |
|---|---|
| adds, removes or renames a package, app or data store | 02 containers, 03 backend components |
| adds or removes a screen or a shared UI piece | 04 frontend components |
| adds or changes an entity, a relation, or what is stored versus derived | 05 domain model |
| changes how the calendar becomes a plan, or what reads the head revision | 06 scheduling pipeline |
| adds or changes an AI provider, a step in an AI job, or a review state | 07 AI flow, 02 containers |
| changes what is read, sent to a model, stored, or denied | 08 data and privacy |
| adds or changes a tool, library or version | 09 tech stack |
| builds something that was "later", defers something, or adds an outside system | 01 system context, 10 roadmap |

## The loop

1. **Edit the `.d2` sources.** Never edit an SVG.
2. **Render** from the repo root: `sh docs/design/render.sh`
3. **Look at every SVG that `git status` lists as modified.** A label that only got longer can overflow its box or push the layout, so "only the text changed" still needs a look. Make a picture you can read:
   ```sh
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
     --hide-scrollbars --window-size=1800,1200 \
     --screenshot="<scratch dir>/NN.png" "file://$PWD/docs/design/<app>/NN-name.svg"
   ```
   Then open the PNG with the Read tool. Fix overlapping labels, text too small to read, and layouts that sprawl.
4. **Update the README:** the diagram's alt text, its "look for" sentence, and any count in the prose ("ten screens").
5. **Stage source, SVG and README together** with the code change that caused them.
6. **Report** with these four lines, all required:
   - `Diagrams changed:` the list
   - `Looked at:` the list of rendered diagrams you opened as images. It must equal the line above.
   - `Left unchanged on purpose:` any row of the table that looked relevant but was not, and why
   - `Findings:` a missing ADR, a mismatch with the spec, or "none"

## Conventions

**Every diagram file**

- Starts with `...@_style`. Colours come from classes, never from inline hex values.
- Has a Markdown title placed `near: top-center`, with one sentence under it that states the takeaway, not the topic.
- Has a legend when colour carries meaning: `...@_legend` for the full one, or a small inline legend with only the colours used.
- Is named `NN-kebab-name.d2`, with `NN` the next free number. A new diagram also gets a row in the README index and its own section.

**Classes** (defined in `src/_style.d2`)

| Class | Means | Use for |
|---|---|---|
| `concept` | blue | our code |
| `win` | green | data that stays on the Mac |
| `warn` | amber | a boundary, guard or check |
| `ai` | purple | a model is involved (the GUI uses the same accent) |
| `later` | grey dashed | not built yet. Change the class when it is built |
| `denied` | red dashed | must never be read or sent |
| `group` | pale container | grouping boxes |
| `flow`, `aiflow`, `blocked` | edge styles | normal, model-related, refused |

**Size and wording**

- About twelve nodes. When a diagram passes sixteen, split it into two files; do not shrink the text or widen the grid again.
- A label is a name plus at most two short lines.
- No personal names except "Gemma". Nothing copied from inside `prototypes/resources/` beyond the role of a folder.

**D2 details that bite**

- `link` is a reserved word; give that node another id.
- A grid fills column by column unless `grid-rows` is declared before `grid-columns`.
- ELK is the default layout. When it sprawls, set `vars.d2-config.layout-engine: tala` at the top of that one file.
- Use `shape: sequence_diagram` when the order of messages is the point.

## Environment

- D2 is pinned in `mise.toml`. If `d2` is not found, `render.sh` falls back to `~/.local/bin/mise exec -- d2`. In a fresh git worktree, run `~/.local/bin/mise trust` once first.
- `sh docs/design/render.sh --check` compares against the committed SVGs. It is what CI runs, and it is only meaningful after a commit. Before committing, check instead that `git status` shows an `.svg` for every changed `.d2`.
- Rendering is deterministic. An SVG that changes with no source change means your D2 version differs from `mise.toml`.
- Real screenshots from browser validation go in `docs/design/<app>/screens/`, named `mN-screen-name.png`.

## Common mistakes

| Mistake | Instead |
|---|---|
| Looking only at the diagrams with "structural" changes | Open every modified SVG as an image |
| Adding an AI adapter and leaving 07 untouched | Walk every row of the table |
| Writing an ADR or editing the spec to back up the diagram | Report it under Findings |
| Fitting a seventeenth box in by widening the grid | Split the diagram |
| Editing the SVG by hand | Edit the `.d2` and render |
