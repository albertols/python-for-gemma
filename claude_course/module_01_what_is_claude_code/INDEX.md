# 🎓 Module 01 — What is Claude Code

You just graduated eight modules of Python — and for every one of them, Claude
was quietly sitting beside you, writing lessons, running tests, and fixing
your `uv sync`. This module turns around and looks at *that* tool properly.
Claude Code isn't a chat window: it's a program that runs in your terminal,
reads your files, edits them, and runs commands — with you approving each
step until you tell it otherwise. By the end of this module you'll have had
a real conversation with it about code you already know, and you'll
understand the guardrails that keep it from doing anything you didn't agree
to.

## 🎯 What you'll learn

- What "agentic" means in practice: Claude reads your codebase, edits files, and runs commands, not just answers questions
- How to read the terminal prompt: your model, your working directory, and where to type
- Why Claude pauses to ask permission before editing files or running commands — and which actions never need to ask (reading files is free)
- What "plan mode" is: Claude researches and proposes without touching anything, until you approve
- The two commands you'll reach for constantly: `/help` (what can I do?) and `/clear` (start this topic fresh)

## 🗺️ Concept map

```mermaid
flowchart LR
    A["🖥️ Terminal REPL"]:::ai --> B["🔐 Permission prompts"]:::ai
    B --> C["🗺️ Plan mode"]:::ai
    C --> D["⌨️ /help & /clear"]:::ai
    D --> E["🛠️ Hands-on exercise"]:::win
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

## 📚 Learn

| Topic | Concept | 📖 Docs | 🎬 Video |
|---|---|---|---|
| Overview & your first session | what agentic coding is, installing, logging in, essential commands | [Claude Code overview](https://code.claude.com/docs/en/overview), [Quickstart](https://code.claude.com/docs/en/quickstart) | [Search: Claude Code tutorial for beginners](https://www.youtube.com/results?search_query=claude+code+tutorial+for+beginners) |
| Permission prompts & plan mode | the approval flow, `Shift+Tab` cycling `default` → `acceptEdits` → `plan` | [Choose a permission mode](https://code.claude.com/docs/en/permission-modes) | [Search: Claude Code permissions and plan mode](https://www.youtube.com/results?search_query=claude+code+permissions+and+plan+mode+explained) |

## 🛠 Hands-on exercise

Open a terminal in this repo and start a session:

```
claude
```

Then ask Claude, in plain English:

> Explain `python_course/module_01_hello_python/lesson_01_your_first_program.py` to me line by line.

While you read the reply:

1. Notice whether Claude asked your permission to *read* the file. It shouldn't have — reads are always free, only edits and commands ask.
2. Press `Shift+Tab` once. Watch the status bar show `⏸ plan mode on`. Press it again to leave.
3. Type `/help` and skim the list of commands.
4. Type `/clear` and confirm your conversation resets to empty.

## ✅ Progress checklist

- [ ] Started your first `claude` session inside this repo
- [ ] Asked Claude to explain `lesson_01_your_first_program.py` line by line and read the whole reply
- [ ] Confirmed that reading the file didn't trigger a permission prompt
- [ ] Cycled into plan mode with `Shift+Tab` and back out again
- [ ] Ran `/help` and skimmed the command list
- [ ] Ran `/clear` and watched the conversation reset

## 🧭 You know you've got it when…

- You can start a session, ask a question, and read the answer without feeling lost
- You can explain, in your own words, why Claude sometimes asks "may I edit this?" and sometimes doesn't
- You've watched plan mode switch on and off at least once
- `/help` and `/clear` feel like tools in your hands, not mysteries

## 🆘 When you're stuck

1. Re-read the 📚 Learn links above — the docs almost always answer it directly.
2. Ask Claude itself — it has built-in knowledge of its own documentation. Try: "how do permission prompts work?"
3. Ask Alberto if you're still stuck after trying both.
