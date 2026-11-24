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

## Click through it in Chrome (Claude in Chrome)

Alberto's standing rule: end-to-end work is validated with the Claude in Chrome extension (`mcp__claude-in-chrome__*` tools), in the real Chrome, not only with Playwright. Do it for every task that changes a screen, and at every milestone gate for each of the milestone's scenarios.

1. Load the tools in one ToolSearch call: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__gif_creator,mcp__claude-in-chrome__tabs_close_mcp`.
2. Start the throwaway instance above. Chrome runs outside the command sandbox and cannot reach a server the sandbox started, so start `pnpm start` with the sandbox disabled for that one command. Everything else about the instance stays the same: temp data, empty resources folder, port 4321.
3. Call `tabs_context_mcp`, then work in a new tab of your own (`tabs_create_mcp`). Never touch Gemma's other tabs, and never open port 4319.
4. Walk each scenario the way she would: click, type, use the keyboard path ("Move to…", Tab, Enter). Prefer `browser_batch` for runs of actions. Check what the screen says against the Gherkin's `Then` lines.
5. `read_console_messages` with `onlyErrors: true` and the pattern `.` after each screen: any error fails the check.
6. At a milestone gate, record the main journey with `gif_creator` (a frame before and after each action) and name it `mN-<journey>.gif`.
7. Never trigger a browser `alert`, `confirm` or `prompt`: it freezes the extension. The planner must not use them; use an in-page dialog.
8. Close your tab with `tabs_close_mcp`, then stop the server.

If the extension is not connected, or the tab shows Chrome's error page for a server that `curl` reaches, stop after two tries. Say so plainly, and fall back to the headless pictures above. Never report a Chrome click-through that did not happen.

## Stop it

Stop what you started: the task-stop tool for a background task, Ctrl+C in its terminal, or `kill <pid>` with the pid from `lsof -ti :4321`. Never kill a process on 4319 you did not start: it may be Gemma's own planner. `pkill` may be refused by the permission rules; do not work around a refusal. Then confirm the port is free: `lsof -i :4321`.

## Real-data checks

Only when a task asks for one. Use a temp `PLANNER_DATA_DIR`, the default resources dir, import through `POST /api/calendar/import`, and print counts and dates only, never cell text.

## Before saying done

- [ ] typecheck, lint, test, and e2e when web or e2e changed
- [ ] looked at every touched screen as an image
- [ ] clicked through every touched screen in Chrome with Claude in Chrome, with no console errors (or said plainly why it could not be done)
- [ ] `sh docs/design/render.sh --check` from the repo root when modules, routes, the data model or the stack changed
- [ ] every server you started is stopped
- [ ] `git status` shows nothing under `data/` or `prototypes/resources/`
- [ ] say plainly that Gemma still has to click through it herself
