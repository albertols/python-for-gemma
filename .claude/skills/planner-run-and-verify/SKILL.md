---
name: planner-run-and-verify
description: Use when starting the AI Teacher Planner (prototypes/ai_teacher_planner) to check a change works, before saying a planner task is done, when asked to run, screenshot or click through the planner, or at a milestone gate that needs screenshots.
---

# Run and verify the AI Teacher Planner

## Overview

Tests passing is half the check. The other half is looking at the screen. Every run uses throwaway synthetic data, so nothing touches Gemma's real database or her resources folder.

## Where commands run

All `pnpm` commands run from `prototypes/ai_teacher_planner/` (the repo root has no `package.json`). Prefix every tool with `~/.local/bin/mise exec --`. In a fresh worktree, install first:

```sh
cd prototypes/ai_teacher_planner
~/.local/bin/mise exec -- pnpm install --frozen-lockfile     # fresh worktree only
~/.local/bin/mise exec -- pnpm typecheck && ~/.local/bin/mise exec -- pnpm lint && ~/.local/bin/mise exec -- pnpm test
~/.local/bin/mise exec -- pnpm e2e        # own server on port 4320, own temp data, fixed today 2026-11-20
```

## A throwaway instance to look at

```sh
T=$(mktemp -d)
~/.local/bin/mise exec -- pnpm seed:synthetic --data-dir "$T/data"
mkdir "$T/nores"
PLANNER_DATA_DIR="$T/data" PLANNER_RESOURCES_DIR="$T/nores" PLANNER_PORT=4321 \
PLANNER_AI=off PLANNER_FIXED_TODAY=2026-11-20 PLANNER_NO_OPEN=1 \
  ~/.local/bin/mise exec -- pnpm start            # run it in the background
until curl -s http://127.0.0.1:4321/api/health | grep -q ok; do sleep 1; done   # the first start builds the web app (~15 s)
```

| Setting | Why |
|---|---|
| `PLANNER_DATA_DIR` in a temp dir | `./data` is Gemma's real database. Never create or touch it |
| `PLANNER_RESOURCES_DIR` empty temp dir | The app can then never read `prototypes/resources/` |
| Port 4321 (or any free one) | 4319 may be Gemma's own running planner; 4320 is e2e's |
| `PLANNER_FIXED_TODAY` | The synthetic year is built around it. It sets what Today shows and which fortnight the board opens on. To see other weeks on the board, open `/board?w1=<any date>` instead: `2026-12-21` (two-day week), `2027-01-04` (lone Friday), `2026-12-08` (labelled holiday) |
| `PLANNER_NO_OPEN=1` | No browser window on Gemma's screen |

## Look at it

Take a picture of every screen the change touches, in both themes when colours changed, then open each PNG with the Read tool and check it: layout, overlapping text, contrast, what the change was meant to show.

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --window-size=1600,1000 --virtual-time-budget=4000 \
  --screenshot="<scratchpad>/board.png" "http://127.0.0.1:4321/board"
```

Screens: `/` Today, `/board` (and `/board?w1=YYYY-MM-DD` for the fortnight holding that date), `/audit`, `/setup`.

`?w1=2026-12-21` shows the fortnight holding that date (Week 1 from 14 December), not a fortnight starting on it. Confirm which fortnight you are looking at from the "from Monday …" headings above the two grids.

For clicks, the light theme or anything headless Chrome cannot do, write a throwaway script inside `e2e/` (that is where `@playwright/test` is installed) with the file-writing tool, run it as its own plain command, `~/.local/bin/mise exec -- node e2e/look.tmp.mjs`, then delete it. Keep throwaway data and pictures in your scratchpad.

```js
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => localStorage.setItem("planner-theme", "light"));   // omit for dark
await page.goto("http://127.0.0.1:4321/board?w1=2026-12-08");
await page.screenshot({ path: "<scratchpad>/board-light.png", fullPage: true });
await browser.close();
```

Pictures go in the scratchpad. Only at a milestone gate do they go in `docs/design/ai-teacher-planner/screens/mN-<screen>.png`, from synthetic data only.

## Stop it

Stop what you started: the task-stop tool for a background task, Ctrl+C in its terminal, or `kill <pid>` with the pid from `lsof -ti :4321`. Never kill a process on 4319 you did not start: it may be Gemma's own planner. `pkill` may be refused by the permission rules; do not work around a refusal. Then confirm the port is free: `lsof -i :4321`.

## Real-data checks

Only when a task asks for one. Use a temp `PLANNER_DATA_DIR`, the default resources dir, import through `POST /api/calendar/import`, and print counts and dates only, never cell text.

## Before saying done

- [ ] typecheck, lint, test, and e2e when web or e2e changed
- [ ] looked at every touched screen as an image
- [ ] `sh docs/design/render.sh --check` from the repo root when modules, routes, the data model or the stack changed
- [ ] every server you started is stopped
- [ ] `git status` shows nothing under `data/` or `prototypes/resources/`
- [ ] say plainly that Gemma still has to click through it herself
