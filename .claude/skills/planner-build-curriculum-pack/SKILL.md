---
name: planner-build-curriculum-pack
description: Used by the AI Teacher Planner app (headless). Not for interactive use. Reads the text of an exam board specification and drafts its units, spec points and the links from a teacher's textbook chapters to those points, as JSON for her to review.
---

# Draft a curriculum pack from a specification

You get the text of an exam board specification, page by page, the units the teacher teaches, and the chapter list of her textbook. Return a draft of the units, specification points and chapter links as JSON. A teacher will check every line of your draft before anything uses it, so a plain "unsure" is always better than a guess.

## Input

A JSON block with:

- `courseId`, `board`: for your information.
- `unitsInScope`: the units she teaches, as she wrote them (for example "Unit 1", or a unit title).
- `chapters`: her textbook chapters, `number` and `title`.
- `pages`: `{ number, text }` for each page of the specification. `number` is the page number you must report.
- `repair` (only sometimes): your previous answer and the `problems` found in it. Fix every problem, change nothing else, and answer in full again.

## Output

Return only the JSON object the schema describes. No prose, no code fence.

### units

One entry for every unit in the text, in the order they appear. Ids are `u1`, `u2`, ... in that order. `code` and `title` are as written in the text. `inScope` is true only when the unit matches an entry of `unitsInScope` (by its number, code or title); otherwise false.

### specPoints

One entry for **every** specification point of **every** unit you listed, including units that are out of scope. Never leave a point out because its unit is out of scope, hard to read or repeated: leaving points out is the worst mistake here.

- `id`: `sp1`, `sp2`, ... in the order they appear. `unitId`: the unit it sits under.
- `code`: exactly as printed in the text (for example `1.4`). Use only codes that appear in the text. Never invent, renumber, continue or fill in a code.
- `title`: the point's own title or first few words, as printed. Never copy more than the title: no definitions, no examples, no paragraphs of the specification.
- `page`: the `number` of the page whose text holds the point. Every point has one.
- `level`: `"hl-only"` only when the text itself marks the point as higher level, such as "(higher level only)", "HL only", "HL" or "higher tier" beside it or its heading. Otherwise `"core"`. Never decide this from how difficult a topic sounds, and never use any other word for the level.

### chapters

One entry for each chapter in `chapters`, using her `number` exactly. Do not add chapters of your own.

- `links`: the spec points the chapter covers. Each link has `specPointId` and a `reason`: one sentence that quotes the words from the chapter title and from the point that make the match, for example `"Supply" in the chapter title matches "1.2 Supply and the supply curve"`. A link without such a quote is not allowed.
- Link a chapter only when its title and a point's title say the same thing in the words the text uses. A similar-sounding title is not enough; a topic you think the chapter probably covers is not enough.
- Never link a chapter to a point of a unit that is out of scope.
- A chapter can link to several points, and a point can be linked by several chapters.
- When the text does not support any link for a chapter, give it `links: []`, and add an entry to `unsure` with `about` set to the chapter number and a note saying what was missing. Do not link it "to be safe".
- `unitId`: the unit that the chapter's linked points sit in. For a chapter with no links, null.

### unsure

Everything you could not decide, one entry each: `about` is a chapter number or a spec code, `note` is one short sentence. Include every unlinked chapter, every link you are only partly sure of (keep the link and say so), a point whose page or level you could not tell, and text that looked garbled. An empty list means you are sure of everything: only say that when it is true.

## Checks before you answer

1. Every code in `specPoints` appears in the page text of its `page`.
2. Every `specPointId`, `unitId` and `id` refers to something in your own output, and no id is used twice.
3. Every unit in the text is listed, and every point under each of them.
4. `hl-only` appears only where the text says higher level.
5. Every link has a quoted reason.
