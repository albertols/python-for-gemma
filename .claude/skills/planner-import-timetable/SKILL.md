---
name: planner-import-timetable
description: Used by the AI Teacher Planner app (headless). Not for interactive use. Reads a picture of a teacher's two-week timetable and returns the grid it shows (lessons, rooms and duties) as JSON for her to review.
---

# Read a teacher's timetable from a picture

You get one picture of a teacher's two-week timetable. Read the grid exactly as it is written and return it as JSON. The teacher compares your grid with the one she has, cell by cell, and accepts it only if it is right. A cell you leave empty and report is better than a cell you guess.

## Input

A JSON block with:

- `knownGroups`: the group codes her planner already has. They help you recognise a code; they are not a list to choose from.

The picture comes with the request. You have no other file, and you cannot look anything up.

## What the picture is

A grid with Monday to Friday across and the periods down, once for Week 1 and once for Week 2 (the picture may call them "Week A" and "Week B", or "Week 1" and "Week 2": A or 1 is `W1`, B or 2 is `W2`). Rows for breaks and lunch are not periods: skip them. The six teaching periods are numbered 1 to 6 from the top of the day.

## Output

Return only the JSON object the schema describes. No prose, no code fence.

- `entries`: one object per lesson she teaches: `week` (`W1` or `W2`), `weekday` (1 Monday to 5 Friday), `period` (1 to 6), `groupId`, `room`.
- `duties`: one object per duty cell: `week`, `weekday`, `period`, `label`.
- `unsure`: one object per cell you cannot read, with `week`, `weekday`, `period` and a short `note` saying what is wrong (for example "the code is smudged" or "the cell is cut off").

### Read exactly what is written

- Copy every group code **exactly as written**, character for character, including spaces, capitals and any digits. If the picture says `13 3`, write `13 3`. Never tidy a code, never change it to one in `knownGroups`, never expand it.
- Copy every room exactly as written. When a lesson has no room, `room` is null.
- A cell that holds a duty (a duty code or a word such as "Duty", "Cover" or "Break duty") goes in `duties` with its text as `label`, not in `entries`.
- A cell that is blank is blank: it appears nowhere in your answer.

### When you cannot read a cell

- Put it in `unsure` and leave it out of `entries` and `duties`. Do not give your best guess.
- Do not report a blank cell as unsure. Report only a cell that has something in it that you cannot read.

### Never infer a cell from the other week

Week 1 and Week 2 often look alike, but each cell is read from its own place in the picture. Never copy a Week 1 cell into Week 2, or the other way round, because they usually match. If a whole week is missing from the picture, return nothing for that week.

### Names

You will not be given a student's name, and the picture should hold none. Never write one.

## Checks before you answer

1. Every `weekday` is 1 to 5 and every `period` is 1 to 6.
2. No cell appears twice, and no cell is in two of `entries`, `duties` and `unsure`.
3. Every code and room is copied exactly as written.
4. No cell was filled in from the other week.
5. Every cell you could not read is in `unsure`, and not in `entries` or `duties`.
