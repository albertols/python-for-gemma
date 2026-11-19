# ADR-011: A data boundary around the teaching-resources folder

**Date:** 2026-11-19
**Status:** Accepted

## Context

`prototypes/resources/` is a 5 GB copy of Gemma's OneDrive folder. It holds what the planner needs (the school calendar, specifications, planning sheets, chapter PowerPoints) next to things it must never touch: student work in folders named after students, scanned exams, reports, and copyrighted textbooks. The line added to `.gitignore` for it began with a stray dot, so it ignored nothing, and four files were already on GitHub. The rule in [`docs/security.md`](../security.md) and `CLAUDE.md` is that no real student name reaches git or an AI model.

## Decision

Four layers, each enough to stop a mistake by itself:

1. **Git.** Ignore `prototypes/resources/` properly, stop tracking the four files (they stay on disk; history is not rewritten), and exclude the folder from the uv workspace.
2. **Claude deny rules** in `.claude/settings.json` for the student-work folders: `ibdp/EE`, `ibdp/IA/IAs 2025`, `ibdp/IA/IA 2026`, `ibdp/Scanned exams`, `ibdp/ibdp Reports`, `ibdp/Assessments`, `ial/Report Templates`, `ial/ial Mocks`, `igcse/Assessments/Mock`, plus the RAG tracker file and any file named "Sample Answers" or "Feedback".
3. **An app allowlist.** The planner reads files only through a `ResourceGateway` that accepts the Planning folders, the three specification PDFs, the chapter `PP` folders and the per-topic exam-practice folders, and nothing else.
4. **The model gets text, not files.** The app extracts the text it needs from an allowed file and passes that in. In-app AI runs have no file tools ([ADR-007](007-ai-provider-port-headless-claude.md)).

v1 stores no student data at all.

## Consequences

- Canary test, 19 Nov 2026: reading a canary file in a denied folder whose name has spaces and an ampersand was refused, while a control file beside it stayed readable. Probes into three real denied folders were refused before Claude even checked whether the file existed, and a probe into an allowed Planning folder gave the ordinary "file does not exist".
- Limit: a deny rule stops Claude's file tools. It does not stop a script that opens the file. The allowlist is the real guard, and a test proves a path outside it cannot be read.
- The rules are targeted, not the whole folder, so Gemma can still ask Claude about her own planning files in a normal session. Denying the whole folder is the stricter option if that changes.
- A new sensitive folder added later is not covered by a deny rule until someone adds one. The allowlist still keeps the app out of it.
- The image links in `template_prompt.md` and `QUESTIONS_FOR_GEMMA.md` now show only on her Mac. The timetable is re-encoded as a committed JSON fixture with group codes only.
- Trade-off: the four files remain in git history. They are the school's teaching calendar, two screenshots of its tab names and the timetable, which Gemma classed as not sensitive. Alberto chose not to rewrite history, which would disrupt both collaborators.
- Rules out: sending whole textbooks to a model, and any feature that needs names or marks.
