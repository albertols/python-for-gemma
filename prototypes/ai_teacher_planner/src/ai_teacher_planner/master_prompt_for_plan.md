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