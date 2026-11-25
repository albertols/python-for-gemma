Gemma has completed the Teaching/functional prerequisites. Alberto here as the Tech. Lead for AI, Full Stack and Data Architect/Engineer.

from: /Users/gemmakelly/PycharmProjects/python-for-gemma/prototypes/ai_teacher_planner/src/ai_teacher_planner/template_prompt.md

we can elaborate the prompt for the /plan . Gemma has fulfilled and detailed all the input files, scenarios and features to be implemented. Please careful review in detail.


To wrap up, here some relevant considerations to complement certain gaps and final pre /plan for the template_prompt.md:
1. we need to set up a Claude: CLAUDE.md, relevant .mds, etc. Develop SKILS when repeated actions are done more than twice from the teacher prespective part resorting to AI frontier models (when needed).
2. frontend + GUI must represent which parts have been generated automatically (by the pure backend logic) and which parts have been resorted to GenAI (in this case Claude Code, in the future could be others, local LLMs, MCPs, Gemini or ChatGPT): we need to show the user in the GUI (icons) which part is IA generated. But we need heavily resort to the Claude Harness to lean on when needed, we just need to represent the icon in the GUI when it is worth noting the user.
3. implement all the features in a branch called: "ai-planner-v1", and create a Pull Request so that we can review before
4. install any the needed libraries in this laptop: pnpm, npm, node, etc. Accept all the commands in this session.
5. use docs/ and docs/design folder that represent the arhitecture visually of the technical stack, software modules, frontend, backend, middleware, components, communciation with Frontier models, etc. create a skill for visual first documentation, using svg or .png from draw.io or other tools so that we have a better documentation, easy to be checked in one glance. keep it uptodate.
6. when needed from other ideas, websites o products you can use the rea, for reverse engineering. 
7. make sure to .gitignore this path /Users/gemmakelly/PycharmProjects/python-for-gemma/prototypes/resources
8. let's use ADR, SDD, BDD, TDD. Apply the best industry standards for frontend and backend design
9. use the Chrome Explorer validator plugin or similar to automatically validate the fronted features

let's use /model Fable 5.2 xhigh effort for planning and for executing the task we can switch into Opus5.5 high effort

---

## Decisions from the planning session (19 Nov 2026)

Recorded so this file stays the full brief. The plan it produced is the spec at
`docs/superpowers/specs/2026-11-19-ai-teacher-planner-design.md`.

**Chosen by Alberto**

1. **Architecture:** local-first full-stack TypeScript. React web app, small local Node API, SQLite file, a pure-TypeScript engine shared by both, AI behind a provider interface (ADR-006, ADR-007).
2. **v1 scope:** the 6 Musts, plus coverage checklist, lost-lesson reflow with preview, assessment calendar and the IB HL-only helper. Cover lessons and AI-resistant tasks ship as Claude skills surfaced in the GUI. No student, HoD or parent views, no logins, no hosting.
3. **Resources folder:** fix the ignore rule, stop tracking the four pushed files, add Claude deny rules and an app allowlist, exclude it from the uv workspace. No history rewrite (ADR-011).
4. **Mid-year start:** model the whole of 2026-27 and pre-fill the past.

**How each of the nine points above is met**

| Point | Where |
|---|---|
| 1. Claude setup and skills | Root and planner `CLAUDE.md`; eight teacher-side skills (spec section 11); rule: promote to a skill after the second repeat |
| 2. Show what is AI-generated | Provenance on every item and an AI badge in the GUI (spec sections 11 and 12, ADR-008) |
| 3. Branch and pull request | `ai-planner-v1`, one draft PR to `main` from the start |
| 4. Toolchain | mise, Node 26 LTS, pnpm 12, GitHub CLI, D2, installed into `~/.local` without Homebrew |
| 5. Visual docs and a skill | `docs/design/ai-teacher-planner/` (D2 to SVG) and the `architecture-visual-docs` skill (ADR-014) |
| 6. rea | Not installed by default; public pages only, on request |
| 7. Ignore the resources folder | Done and verified |
| 8. ADR, SDD, BDD, TDD | ADR-006 to 016; spec first; Gherkin scenarios; failing test before code (ADR-013) |
| 9. Browser validation | Playwright on the installed Chrome with axe, then an agentic pass with Claude in Chrome |

**Findings that changed the design**

- The calendar workbook labels every school day Week 1 or Week 2, so the cycle is read, never computed.
- No planning file records what has been taught, so the past is "declared" by topic, not invented lesson by lesson.
- Headless Claude Code works from the app on Gemma's subscription and stays isolated from this repo's plugins (spike, ADR-007).
- TypeScript 7 works with the chosen stack (spike, ADR-006).
