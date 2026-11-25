# ADR-007: AI behind a provider port, with headless Claude Code as the default

**Date:** 2026-11-19
**Status:** Accepted

## Context

[ADR-002](002-claude-code-agents-as-ai-engine.md) chose Claude Code on Gemma's own machine as the AI engine, kept behind a small interface. The planner is now a web app ([ADR-006](006-planner-local-first-typescript-monorepo.md)), so a button in the GUI has to reach Claude without Gemma opening a terminal. Alberto also wants other engines to be possible later (local models, Gemini, ChatGPT), and the budget is zero. Claude Code can run *headless*, meaning without a chat window: `claude -p "<prompt>"` prints one answer and exits. Whether that works cleanly from inside this repo, which enables ten plugins, had to be tested.

## Decision

All AI goes through one interface, a *port* called `AiProvider`. Its single method `run(task)` takes a skill id, a JSON input, extracted text, a *schema* (the exact shape the answer must have) and a tool list, and returns checked data plus who produced it. Behind the port sit *adapters*, one per engine: `ClaudeCodeCliProvider` (the default), `FakeAiProvider` (fixed answers, used by every automated test and by CI), and later ones for an API key, Ollama or Gemini.

The Claude adapter reads the skill's prompt file, puts it into the prompt itself, and starts Claude Code with the flag set the spike proved:

```bash
claude -p "<skill prompt + input>" --model <model> \
  --tools "" --setting-sources "" --strict-mcp-config --disallowedTools "mcp__*" \
  --permission-mode dontAsk --output-format stream-json --verbose \
  --json-schema '<schema>' --no-session-persistence < /dev/null
```

It removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the environment first, runs one job at a time, and uses `claude auth status` at start-up to check she is signed in. A skill that needs the web gets `--tools "WebSearch,WebFetch"` instead of `""`.

## Consequences

- Spike result (19 Nov 2026, Claude Code 2.1.326): the answer matched the schema; a run took about 3 seconds with no tools and about 30 seconds with web search; no project plugins or hooks loaded, even when started from the repo root; the only tool available was the one that returns the structured answer.
- The model cannot write files or read school folders. It receives text and returns JSON, and the API decides what to store ([ADR-011](011-resources-data-boundary.md)).
- It is free: runs use Gemma's Claude subscription. Removing the API-key variables means a stray key on the machine can never cause a bill.
- The same prompt files serve the GUI and a normal terminal session, and other engines can reuse them later.
- `--setting-sources ""` also skips this repo's deny rules. That is acceptable only because these runs are given no file tools. The one skill that needs a picture (timetable import) receives the image as part of its input, copied from `data/uploads/`, not through a file tool; the mechanism is recorded in "Amendment: tasks with a picture" below.
- Open risk: the documentation says `--bare` will become the default for `-p`, and bare mode ignores the subscription sign-in. No way to opt out is documented yet. The sign-in check, a clear "AI unavailable" state, and an engine that works fully without AI limit the damage; a test on the real CLI will show the day it changes.
- Subscription sign-in covers personal use on her own Mac. Any shared or hosted version needs the API-key adapter.
- Trade-off: each call starts a new process, which is slower than calling a web API directly, and one job at a time means AI tasks queue.
- Refines [ADR-002](002-claude-code-agents-as-ai-engine.md): same engine, now reached from the app through a port.

## Amendment: tasks with a picture (25 Nov 2026, Task 2.20)

The Task 2.20 spike (Claude Code, a synthetic 16 by 16 red PNG, `--model sonnet`) proved how a picture reaches the model without giving it a file tool: **tasks with attachments use `--input-format stream-json` and a piped standard input; every other flag is unchanged.**

```bash
claude -p --input-format stream-json --model <model> \
  --tools "" --setting-sources "" --strict-mcp-config --disallowedTools "mcp__*" \
  --permission-mode dontAsk --output-format stream-json --verbose \
  --json-schema '<schema>' --no-session-persistence    # no prompt argument; stdin is a pipe
```

Standard input carries exactly one line, then end of input:

```json
{"type":"user","message":{"role":"user","content":[
  {"type":"image","source":{"type":"base64","media_type":"image/png","data":"<base64>"}},
  {"type":"text","text":"<the prompt>"}]}}
```

The run ended with a success result and a structured answer (`{"colour":"red"}`). The recorded input and output are the fixtures `packages/ai/src/__fixtures__/claude-stdin-image.ndjson` and `claude-stream-image-ok.ndjson`.

- A task **without** attachments is unchanged: the prompt is the `-p` argument and standard input is closed (`stdio[0]` is `"ignore"`). Only a task with a picture sets `stdio[0]` to `"pipe"`, so `SpawnLike` allows `"ignore" | "pipe"`.
- The prompt text inside the line still starts with the fixed first line ("You are a skill of the AI Teacher Planner app."), for the same reason as before: nothing may come first that the CLI could read as an option.
- Pictures may only come from `data/uploads/`. The adapter resolves the path (every symlink followed) and refuses anything not directly inside that folder, **before reading anything**. It accepts PNG or JPEG only, checks the first bytes against the type, and refuses a file over 10 MB. The upload route enforces the same type and size limit while the body streams in, and stores the file as `<uuid>.<ext>`.
- The request line is built in memory and is never written to disk. An error message or a line of the model's own text that holds a run of 40 or more base64 characters (or any 40 characters of the prompt) is replaced by a fixed sentence, and every message is cut to 300 characters.
- The model still has no file tool and still cannot read school folders. The picture of her timetable is the only attachment in v1, and it is never stored in git.
