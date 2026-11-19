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
- `--setting-sources ""` also skips this repo's deny rules. That is acceptable only because these runs are given no file tools. The one skill that needs a picture (timetable import) receives the image as part of its input, copied from `data/uploads/`, not through a file tool; the exact mechanism is settled in milestone M1.
- Open risk: the documentation says `--bare` will become the default for `-p`, and bare mode ignores the subscription sign-in. No way to opt out is documented yet. The sign-in check, a clear "AI unavailable" state, and an engine that works fully without AI limit the damage; a test on the real CLI will show the day it changes.
- Subscription sign-in covers personal use on her own Mac. Any shared or hosted version needs the API-key adapter.
- Trade-off: each call starts a new process, which is slower than calling a web API directly, and one job at a time means AI tasks queue.
- Refines [ADR-002](002-claude-code-agents-as-ai-engine.md): same engine, now reached from the app through a port.
