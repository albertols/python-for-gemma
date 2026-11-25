import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { recordedLines, withResult } from "./__fixtures__/recorded.ts";
import {
  buildArgs,
  type ChildLike,
  ClaudeCodeCliProvider,
  defaultTimeoutMs,
  type SpawnLike,
} from "./claude-cli.ts";
import { AiError, type AiProgress, type AiTask } from "./port.ts";
import { getSkill, jsonSchemaFor, skills } from "./registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const authStatus = readFileSync(
  join(here, "__fixtures__/claude-auth-status.json"),
  "utf8",
);

// ---- a fake child process: no test here ever starts `claude` ----

function channel() {
  const queue: string[] = [];
  let ended = false;
  let wake: (() => void) | null = null;
  return {
    push(s: string) {
      queue.push(s);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) yield next;
          else if (ended) return;
          else await new Promise<void>((r) => (wake = r));
        }
      },
    } as AsyncIterable<string>,
  };
}

class FakeChild implements ChildLike {
  readonly out = channel();
  readonly err = channel();
  stdout = this.out.iterable;
  stderr = this.err.iterable;
  /** What the adapter wrote to standard input, and whether it closed it. */
  written: string[] = [];
  stdinEnded = false;
  stdin: NonNullable<ChildLike["stdin"]> = {
    end: (data: string) => {
      this.written.push(data);
      this.stdinEnded = true;
    },
    on: () => {},
  };
  signals: string[] = [];
  ignoreTerm = false;
  get killed(): string | undefined {
    return this.signals[0];
  }
  private closed = false;
  private onClose: ((code: number | null, signal: string | null) => void)[] =
    [];
  private onError: ((e: Error) => void)[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.signals.push(signal);
    if (!(this.ignoreTerm && signal === "SIGTERM")) this.finish(null, signal);
    return true;
  }
  once(event: string, listener: never) {
    if (event === "close") this.onClose.push(listener);
    else this.onError.push(listener);
  }
  fail(e: Error) {
    for (const l of this.onError) l(e);
  }
  finish(code: number | null, signal: string | null = null) {
    if (this.closed) return;
    this.closed = true;
    this.out.end();
    this.err.end();
    for (const l of this.onClose) l(code, signal);
  }
}

/** Plays a finished run: stdout lines, stderr text, an exit code. */
function scripted(
  stdout: string[],
  opts: { stderr?: string; code?: number } = {},
): FakeChild {
  const child = new FakeChild();
  setImmediate(() => {
    for (const l of stdout) child.out.push(`${l}\n`);
    if (opts.stderr) child.err.push(opts.stderr);
    setImmediate(() => child.finish(opts.code ?? 0));
  });
  return child;
}

interface SpawnCall {
  command: string;
  args: string[];
  options: Parameters<SpawnLike>[2];
}

function spawnReturning(make: () => ChildLike) {
  const calls: SpawnCall[] = [];
  const children: ChildLike[] = [];
  const spawn = vi.fn<SpawnLike>((command, args, options) => {
    calls.push({ command, args, options });
    const child = make();
    children.push(child);
    return child;
  });
  return { spawn, calls, children };
}

// ---- the task and the provider ----

/** The shape of a real SKILL.md: front matter first. */
const SKILL_FILE = `---
name: planner-suggest-lesson-counts
description: Used by the AI Teacher Planner app (headless). Not for interactive use. Suggests counts.
---

# Suggest lesson counts

BODY MARKER: suggest counts for each chapter.
`;
const FIRST_LINE = "You are a skill of the AI Teacher Planner app.";

const lessonCounts = getSkill("planner-suggest-lesson-counts");
const answer = {
  suggestions: [{ itemId: "c1", lessons: 4, reason: "r", tricky: false }],
};
const answerStream = () =>
  withResult((r) => {
    r.structured_output = answer;
    r.result = JSON.stringify(answer);
  });

const task: AiTask<unknown> = {
  skillId: "planner-suggest-lesson-counts",
  input: {
    courseTitle: "Synthetic Business",
    mode: "split",
    items: [{ id: "c1", title: "Chapter one", lessons: null }],
    unitTotals: [{ unitId: "u1", lessons: 12 }],
  },
  text: null,
  attachments: [],
  schema: lessonCounts.output,
  tools: [],
};

function setup(
  make: () => ChildLike,
  extra: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    uploadsDir?: string;
  } = {},
) {
  const { spawn, calls, children } = spawnReturning(make);
  const provider = new ClaudeCodeCliProvider({
    spawn,
    env: extra.env ?? { PATH: "/bin" },
    readSkillText: async () => SKILL_FILE,
    timeoutMs: extra.timeoutMs ?? 5_000,
    ...(extra.uploadsDir ? { uploadsDir: extra.uploadsDir } : {}),
  });
  const progress: AiProgress[] = [];
  const opts = (signal = new AbortController().signal) => ({
    signal,
    onProgress: (p: AiProgress) => progress.push(p),
  });
  return { provider, spawn, calls, children, progress, opts };
}

async function rejection(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return e as AiError;
  }
  throw new Error("expected the promise to reject");
}

afterEach(() => vi.useRealTimers());

describe("buildArgs", () => {
  test("the schema reaching --json-schema never holds $schema, at any depth", () => {
    const args = buildArgs(
      "P",
      "sonnet",
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { a: { $schema: "x", type: "string" } },
      },
      [],
    );
    const sent = args[args.indexOf("--json-schema") + 1] ?? "";
    expect(sent).not.toContain("$schema");
    expect(JSON.parse(sent)).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
    });
  });

  test("the arguments are exactly the proven flag set", () =>
    expect(buildArgs("P", "sonnet", { type: "object" }, [])).toEqual([
      "-p",
      "P",
      "--model",
      "sonnet",
      "--tools",
      "",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--disallowedTools",
      "mcp__*",
      "--permission-mode",
      "dontAsk",
      "--output-format",
      "stream-json",
      "--verbose",
      "--json-schema",
      '{"type":"object"}',
      "--no-session-persistence",
    ]));

  test("web skills get only the two web tools, in the form ADR-007 records", () => {
    const a = buildArgs("P", "sonnet", {}, ["WebSearch", "WebFetch"]);
    expect(a[a.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch");
    // no --allowedTools: it is unproven. No M2 skill uses web tools; M7 records a live web run and adds it only if the run needs it,
    // updating the index, ADR-007 and the planner CLAUDE.md together.
    expect(a).not.toContain("--allowedTools");
    expect(a.filter((x) => x === "--tools")).toHaveLength(1);
  });

  test("a prompt that starts with a dash is refused before anything is spawned", () => {
    for (const prompt of ["---\nname: x", "-p", "--bare", "-"])
      expect(() => buildArgs(prompt, "sonnet", {}, []), prompt).toThrow(
        expect.objectContaining({ reason: "failed" }),
      );
    expect(() => buildArgs("", "sonnet", {}, [])).not.toThrow();
  });

  test("--bare is never passed", () => {
    expect(buildArgs("P", "sonnet", {}, [])).not.toContain("--bare");
    expect(buildArgs("P", "opus", {}, ["WebSearch", "WebFetch"])).not.toContain(
      "--bare",
    );
  });

  test("the prompt and the schema are single arguments, whatever they hold", () => {
    const prompt = 'line one\n--bare "quoted" $HOME';
    const a = buildArgs(prompt, "haiku", { a: "--bare" }, []);
    expect(a[1]).toBe(prompt);
    expect(a[a.indexOf("--model") + 1]).toBe("haiku");
    expect(a[a.indexOf("--json-schema") + 1]).toBe('{"a":"--bare"}');
  });
});

describe("defaultTimeoutMs", () => {
  test("120 seconds without tools, 300 with", () => {
    expect(defaultTimeoutMs([])).toBe(120_000);
    expect(defaultTimeoutMs(["WebSearch"])).toBe(300_000);
    expect(defaultTimeoutMs(["WebSearch", "WebFetch"])).toBe(300_000);
  });
});

describe("run: the happy path", () => {
  test("the recorded stream gives the structured output and the model name, validated and returned with its meta", async () => {
    const t = setup(() => scripted(answerStream()));
    const res = await t.provider.run(task, t.opts());
    expect(res.data).toEqual(answer);
    expect(res.meta).toMatchObject({
      provider: "claude-code-cli",
      model: "claude-sonnet-5-5",
      skillId: "planner-suggest-lesson-counts",
      sources: [],
    });
    expect(Date.parse(res.meta.startedAt)).not.toBeNaN();
    expect(res.meta.durationMs).toBeGreaterThanOrEqual(0);
    expect(t.progress[0]).toEqual({ kind: "started" });
    expect(t.progress.at(-1)).toEqual({ kind: "done" });
    expect(t.progress.some((p) => p.kind === "working")).toBe(true);
  });

  test("the prompt starts with a fixed line and carries the skill body, never its front matter", async () => {
    const t = setup(() => scripted(answerStream()));
    await t.provider.run(task, t.opts());
    const prompt = t.calls[0]?.args[1] ?? "";
    expect(prompt.startsWith(`${FIRST_LINE}\n`)).toBe(true);
    expect(prompt[0]).not.toBe("-");
    expect(prompt).toContain("BODY MARKER: suggest counts");
    expect(prompt).not.toContain("---");
    expect(prompt).not.toContain("name: planner-suggest-lesson-counts");
    expect(prompt).not.toContain("description:");
    expect(prompt.indexOf("BODY MARKER")).toBeLessThan(
      prompt.indexOf("Synthetic Business"),
    );
  });

  test("it spawns `claude` with the skill's model, the schema, and a prompt of skill text then input", async () => {
    const t = setup(() => scripted(answerStream()));
    await t.provider.run(task, t.opts());
    expect(t.calls).toHaveLength(1);
    const call = t.calls[0] as SpawnCall;
    expect(call.command).toBe("claude");
    const prompt = call.args[1] ?? "";
    expect(prompt).toContain("BODY MARKER");
    expect(prompt).toContain("Synthetic Business");
    expect(call.args).toEqual(
      buildArgs(prompt, lessonCounts.model, jsonSchemaFor(lessonCounts), []),
    );
  });

  test("the command can be overridden", async () => {
    const { spawn, calls } = spawnReturning(() => scripted(answerStream()));
    const provider = new ClaudeCodeCliProvider({
      spawn,
      env: {},
      readSkillText: async () => "S",
      command: "/opt/claude",
    });
    await provider.run(task, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(calls[0]?.command).toBe("/opt/claude");
  });
});

describe("run: sources come from validated data only", () => {
  const withSourcesSkill = async (
    raw: unknown,
    check: (t: ReturnType<typeof setup>) => Promise<void>,
  ) => {
    const id = "content-refresh-resource" as const;
    const output = z.object({
      ok: z.boolean(),
      sources: z.array(
        z.object({ url: z.string(), title: z.string().optional() }),
      ),
    });
    skills[id] = { ...lessonCounts, id, input: z.unknown(), output, tools: [] };
    try {
      const t = setup(() =>
        scripted(
          withResult((r) => {
            r.structured_output = raw;
          }),
        ),
      );
      await check(t);
    } finally {
      delete skills[id];
    }
  };
  const sourcesTask = (): AiTask<unknown> => ({
    ...task,
    skillId: "content-refresh-resource",
    input: {},
    schema: getSkill("content-refresh-resource").output,
  });

  test("a skill whose schema declares sources gets them, https only, never opened", () =>
    withSourcesSkill(
      {
        ok: true,
        sources: [
          { url: "https://example.org/a", title: "A page" },
          { url: "http://example.org/b" },
          { url: "javascript:alert(1)" },
          { url: "file:///etc/passwd" },
          { url: "not a url" },
        ],
      },
      async (t) => {
        const res = await t.provider.run(sourcesTask(), t.opts());
        expect(res.meta.sources).toEqual([
          { url: "https://example.org/a", title: "A page", opened: false },
        ]);
      },
    ));

  test("raw sources that fail the schema make the whole answer invalid-output", () =>
    withSourcesSkill(
      { ok: true, sources: "https://example.org" },
      async (t) => {
        const e = await rejection(t.provider.run(sourcesTask(), t.opts()));
        expect(e.reason).toBe("invalid-output");
      },
    ));

  test("a sources array the schema does not declare is dropped, not trusted", async () => {
    const t = setup(() =>
      scripted(
        withResult((r) => {
          r.structured_output = {
            ...answer,
            sources: [{ url: "https://example.org/a" }],
          };
        }),
      ),
    );
    const res = await t.provider.run(task, t.opts());
    expect(res.meta.sources).toEqual([]);
  });
});

describe("run: the child's world", () => {
  test("the child never sees an API key or auth token, and standard input is closed", async () => {
    const t = setup(() => scripted(answerStream()), {
      env: {
        PATH: "/bin",
        HOME: "/home/x",
        ANTHROPIC_API_KEY: "sk-test-1",
        ANTHROPIC_AUTH_TOKEN: "tok-test-2",
        UNSET: undefined,
      },
    });
    await t.provider.run(task, t.opts());
    const options = t.calls[0]?.options;
    expect(options?.env).toEqual({ PATH: "/bin", HOME: "/home/x" });
    expect(JSON.stringify(options)).not.toMatch(/sk-test-1|tok-test-2/);
    expect(options?.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  test("the caller's env object is not changed", async () => {
    const env = { PATH: "/bin", ANTHROPIC_API_KEY: "k" };
    const t = setup(() => scripted(answerStream()), { env });
    await t.provider.run(task, t.opts());
    expect(env).toEqual({ PATH: "/bin", ANTHROPIC_API_KEY: "k" });
  });
});

describe("run: refusals before anything is spawned", () => {
  test("a task whose schema or tools differ from the registered skill is refused", async () => {
    const { z } = await import("zod");
    const t = setup(() => scripted(answerStream()));
    const other = await rejection(
      t.provider.run(
        { ...task, schema: z.object({ ok: z.boolean() }) },
        t.opts(),
      ),
    );
    expect(other.reason).toBe("failed");
    expect(other.message).toMatch(/schema/);
    const tools = await rejection(
      t.provider.run({ ...task, tools: ["WebSearch"] }, t.opts()),
    );
    expect(tools.message).toMatch(/tools/);
    expect(t.spawn).not.toHaveBeenCalled();
  });

  test("extracted text that points into the resources folder is refused", async () => {
    const t = setup(() => scripted(answerStream()));
    const e = await rejection(
      t.provider.run(
        { ...task, text: "see ./resources/year13/a.xlsx" },
        t.opts(),
      ),
    );
    expect(e.reason).toBe("failed");
    expect(e.message).toMatch(/resources/);
    expect(t.spawn).not.toHaveBeenCalled();
  });

  test("an input that does not match the skill is refused", async () => {
    const t = setup(() => scripted(answerStream()));
    const e = await rejection(
      t.provider.run({ ...task, input: { nope: 1 } }, t.opts()),
    );
    expect(e.reason).toBe("failed");
    expect(t.spawn).not.toHaveBeenCalled();
  });

  test("a skill text that starts with a dash after all is refused before spawn", async () => {
    // front matter stripping must never leave a dash-leading prompt, whatever the text holds
    const { spawn } = spawnReturning(() => scripted(answerStream()));
    const provider = new ClaudeCodeCliProvider({
      spawn,
      env: {},
      readSkillText: async () => "---\nunterminated front matter\nbody",
    });
    await provider
      .run(task, { signal: new AbortController().signal, onProgress: () => {} })
      .catch(() => {});
    for (const call of spawn.mock.calls)
      expect(call[1][1]?.startsWith("-")).toBe(false);
  });

  test("a skill text that cannot be read names the skill and shows no path", async () => {
    const { spawn } = spawnReturning(() => scripted(answerStream()));
    const provider = new ClaudeCodeCliProvider({
      spawn,
      env: {},
      readSkillText: async () => {
        throw new Error(
          "ENOENT: no such file '/Users/someone/repo/.claude/skills/x/SKILL.md'",
        );
      },
    });
    const e = await rejection(
      provider.run(task, {
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
    );
    expect(e.reason).toBe("failed");
    expect(e.message).toContain("planner-suggest-lesson-counts");
    expect(e.message).not.toMatch(/Users|ENOENT/);
    expect(spawn).not.toHaveBeenCalled();
  });

  test("a skill text that cannot be read is failed, not spawned", async () => {
    const { spawn } = spawnReturning(() => scripted(answerStream()));
    const provider = new ClaudeCodeCliProvider({
      spawn,
      env: {},
      readSkillText: async () => {
        throw new Error("ENOENT: no such file");
      },
    });
    const e = await rejection(
      provider.run(task, {
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
    );
    expect(e.reason).toBe("failed");
    expect(spawn).not.toHaveBeenCalled();
  });

  test("already aborted is cancelled, before anything is spawned", async () => {
    const t = setup(() => scripted(answerStream()));
    const ac = new AbortController();
    ac.abort();
    const e = await rejection(t.provider.run(task, t.opts(ac.signal)));
    expect(e.reason).toBe("cancelled");
    expect(t.spawn).not.toHaveBeenCalled();
  });
});

describe("run: invalid output", () => {
  test("output that fails the task's schema is invalid-output and nothing is returned", async () => {
    const t = setup(() =>
      scripted(
        withResult((r) => {
          r.structured_output = { suggestions: [{ itemId: "c1" }] };
        }),
      ),
    );
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("invalid-output");
    expect(t.progress.at(-1)).toMatchObject({ kind: "failed" });
    expect(t.progress).not.toContainEqual({ kind: "done" });
  });

  test("the recorded answer ({ok: true}) does not satisfy a lesson-count task", async () => {
    const t = setup(() => scripted(recordedLines));
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("invalid-output");
  });
});

describe("run: when the process goes wrong", () => {
  test("a missing claude command is unavailable, with a sentence she can act on", async () => {
    const spawn = vi.fn<SpawnLike>(() => {
      throw Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    });
    const provider = new ClaudeCodeCliProvider({
      spawn,
      env: {},
      readSkillText: async () => "S",
    });
    const e = await rejection(
      provider.run(task, {
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
    );
    expect(e.reason).toBe("unavailable");
    expect(e.message).toMatch(/Claude Code/);
    expect(e.message).toMatch(/install/i);
    expect(e.message).not.toMatch(/ENOENT/);
  });

  test("a missing claude command reported by the child's error event is unavailable too", async () => {
    const t = setup(() => {
      const c = new FakeChild();
      setImmediate(() => {
        c.fail(
          Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }),
        );
        c.finish(null);
      });
      return c;
    });
    expect((await rejection(t.provider.run(task, t.opts()))).reason).toBe(
      "unavailable",
    );
  });

  test("any other spawn error is failed with its message", async () => {
    const t = setup(() => {
      const c = new FakeChild();
      setImmediate(() => c.fail(new Error("EACCES: permission denied")));
      return c;
    });
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toContain("EACCES");
  });

  test("a run longer than the timeout is killed and fails with timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let child: FakeChild | undefined;
    const t = setup(
      () => {
        child = new FakeChild(); // says nothing, never exits by itself
        return child;
      },
      { timeoutMs: 1_000 },
    );
    const pending = rejection(t.provider.run(task, t.opts()));
    await vi.advanceTimersByTimeAsync(999);
    expect(child?.killed).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    const e = await pending;
    expect(e.reason).toBe("timeout");
    expect(child?.killed).toBe("SIGTERM");
    expect(t.progress.at(-1)).toMatchObject({ kind: "failed" });
  });

  test("a finished run clears its timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = setup(() => scripted(answerStream()), { timeoutMs: 1_000 });
    const pending = t.provider.run(task, t.opts());
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("aborting kills the child and fails with cancelled", async () => {
    let child: FakeChild | undefined;
    const t = setup(() => {
      child = new FakeChild();
      return child;
    });
    const ac = new AbortController();
    const pending = rejection(t.provider.run(task, t.opts(ac.signal)));
    await vi.waitFor(() => expect(t.spawn).toHaveBeenCalled());
    ac.abort();
    const e = await pending;
    expect(e.reason).toBe("cancelled");
    expect(child?.killed).toBe("SIGTERM");
  });

  test("a non-zero exit fails with the last line of standard error, cut to 300 characters", async () => {
    const long = `${"x".repeat(400)}`;
    const t = setup(() =>
      scripted([], { code: 1, stderr: `first line\n${long}\n\n` }),
    );
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toBe("x".repeat(300));
  });

  test("a stderr line that echoes the prompt is replaced by a fixed sentence", async () => {
    const t = setup(() => {
      // the CLI complaining about its own argument: the line holds the tail of the prompt
      return scripted([], {
        code: 1,
        stderr:
          "something\nerror: unknown option '---\nname: x\nBODY MARKER: suggest counts for each chapter.'\n",
      });
    });
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.message).toBe(
      "Claude could not read the request. Please tell Alberto.",
    );
  });

  test("any stderr line holding 40 characters of the prompt is replaced", async () => {
    let prompt = "";
    const t = setup(() => {
      // spawn is called before the child is built, so the prompt is known by then
      prompt = t.calls[0]?.args[1] ?? "";
      const line =
        prompt.split("\n").find((l) => l.startsWith("BODY MARKER")) ?? "";
      return scripted([], {
        code: 1,
        stderr: `failed on: ${line.slice(0, 42)} (end)\n`,
      });
    });
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(prompt).toContain("BODY MARKER");
    expect(e.message).toBe(
      "Claude could not read the request. Please tell Alberto.",
    );
  });

  test("a stderr line that echoes the prompt is replaced even when it is not the last line", async () => {
    const sentence = "Claude could not read the request. Please tell Alberto.";
    const t = setup(() => {
      const prompt = t.calls[0]?.args[1] ?? "";
      const echoed =
        prompt.split("\n").find((l) => l.startsWith("BODY MARKER")) ?? "";
      return scripted([], {
        code: 1,
        stderr: `bad input: ${echoed.slice(0, 42)} (end)\nRate limited\n`,
      });
    });
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.message).toBe(sentence);
    expect(e.message).not.toContain("BODY MARKER");
  });

  test("an error result that echoes the prompt is replaced by the fixed sentence", async () => {
    const t = setup(() => {
      const prompt = t.calls[0]?.args[1] ?? "";
      const echoed =
        prompt.split("\n").find((l) => l.startsWith("BODY MARKER")) ?? "";
      return scripted(
        withResult((r) => {
          r.is_error = true;
          r.subtype = "error_during_execution";
          r.result = `Could not parse: ${echoed.slice(0, 42)}`;
          delete r.structured_output;
        }),
      );
    });
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toBe(
      "Claude could not read the request. Please tell Alberto.",
    );
  });

  test("an unknown-option error is replaced even when it shows none of the prompt", async () => {
    const t = setup(() =>
      scripted([], { code: 1, stderr: "error: unknown option '--zzz'\n" }),
    );
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.message).toBe(
      "Claude could not read the request. Please tell Alberto.",
    );
  });

  test("an ordinary stderr line is still shown", async () => {
    const t = setup(() => scripted([], { code: 1, stderr: "Rate limited\n" }));
    expect((await rejection(t.provider.run(task, t.opts()))).message).toBe(
      "Rate limited",
    );
  });

  test("an error result and an invalid-output message are cut to 300 characters", async () => {
    const long = "y".repeat(500);
    const t = setup(() =>
      scripted(
        withResult((r) => {
          r.is_error = true;
          r.subtype = "error_during_execution";
          r.result = long;
          delete r.structured_output;
        }),
      ),
    );
    expect(
      (await rejection(t.provider.run(task, t.opts()))).message.length,
    ).toBeLessThanOrEqual(300);
    const bad = setup(() =>
      scripted(
        withResult((r) => {
          r.structured_output = { suggestions: [{ itemId: long }] };
        }),
      ),
    );
    const e = await rejection(bad.provider.run(task, bad.opts()));
    expect(e.reason).toBe("invalid-output");
    expect(e.message.length).toBeLessThanOrEqual(300);
    expect(e.message).not.toContain("\n");
    expect(e.message).not.toContain(long);
  });

  test("a child that ignores SIGTERM is sent SIGKILL 5 seconds later", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let child: FakeChild | undefined;
    const t = setup(
      () => {
        child = new FakeChild();
        child.ignoreTerm = true;
        return child;
      },
      { timeoutMs: 1_000 },
    );
    const pending = rejection(t.provider.run(task, t.opts()));
    await vi.advanceTimersByTimeAsync(1_001);
    expect((await pending).reason).toBe("timeout");
    expect(child?.signals).toEqual(["SIGTERM"]);
    await vi.advanceTimersByTimeAsync(4_900);
    expect(child?.signals).toEqual(["SIGTERM"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(child?.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("a child that exits after SIGTERM is not sent SIGKILL", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let child: FakeChild | undefined;
    const t = setup(
      () => {
        child = new FakeChild();
        return child;
      },
      { timeoutMs: 1_000 },
    );
    const pending = rejection(t.provider.run(task, t.opts()));
    await vi.advanceTimersByTimeAsync(1_001);
    await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(child?.signals).toEqual(["SIGTERM"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a child that errors after SIGTERM leaves no SIGKILL timer behind", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let child: FakeChild | undefined;
    const t = setup(
      () => {
        child = new FakeChild();
        child.ignoreTerm = true;
        return child;
      },
      { timeoutMs: 1_000 },
    );
    const pending = rejection(t.provider.run(task, t.opts()));
    await vi.advanceTimersByTimeAsync(1_001);
    expect((await pending).reason).toBe("timeout");
    child?.fail(new Error("spawn EPERM"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(child?.signals).toEqual(["SIGTERM"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a non-zero exit with nothing on standard error still says the code", async () => {
    const t = setup(() => scripted([], { code: 3 }));
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toMatch(/3/);
  });

  test("a stream that ends without a result fails with failed", async () => {
    const t = setup(() => scripted(recordedLines.slice(0, 4)));
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toMatch(/without an answer/);
  });

  test("an error result fails with Claude's words", async () => {
    const t = setup(() =>
      scripted(
        withResult((r) => {
          r.is_error = true;
          r.subtype = "error_during_execution";
          r.result = "Overloaded";
          delete r.structured_output;
        }),
      ),
    );
    const e = await rejection(t.provider.run(task, t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toContain("Overloaded");
  });
});

describe("available", () => {
  test("a signed-in account is ok, and the status command is `claude auth status`", async () => {
    const t = setup(() => scripted([authStatus]));
    await expect(t.provider.available()).resolves.toEqual({ ok: true });
    expect(t.calls[0]?.command).toBe("claude");
    expect(t.calls[0]?.args).toEqual(["auth", "status"]);
    expect(t.calls[0]?.options.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  test("auth status with loggedIn false is signed-out", async () => {
    const t = setup(() =>
      scripted([
        JSON.stringify({ ...JSON.parse(authStatus), loggedIn: false }),
      ]),
    );
    const res = await t.provider.available();
    expect(res.ok).toBe(false);
    expect(res).toEqual({
      ok: false,
      reason:
        "Claude Code is signed out. Run `claude` in a terminal and sign in, then try again.",
    });
  });

  test("a missing claude command is not available, with a sentence she can act on", async () => {
    const spawn = vi.fn<SpawnLike>(() => {
      throw Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    });
    const provider = new ClaudeCodeCliProvider({
      spawn,
      env: {},
      readSkillText: async () => "S",
    });
    const res = await provider.available();
    expect(res.ok).toBe(false);
    expect(res).toEqual({
      ok: false,
      reason:
        "Claude Code is not installed on this Mac. Everything else still works.",
    });
  });

  test("any other outcome is one fixed sentence: raw stderr and spawn errors are never passed on", async () => {
    const generic =
      "Claude Code did not say whether you are signed in. Open it in a terminal and check.";
    const failing = setup(() =>
      scripted([], { code: 1, stderr: "boom at /Users/someone/x" }),
    );
    expect(await failing.provider.available()).toEqual({
      ok: false,
      reason: generic,
    });
    const odd = new ClaudeCodeCliProvider({
      spawn: () => {
        throw Object.assign(new Error("spawn /opt/bin/claude EPERM"), {
          code: "EPERM",
        });
      },
      env: {},
      readSkillText: async () => "S",
    });
    expect(await odd.available()).toEqual({ ok: false, reason: generic });
  });

  test("output that is not JSON, or a failing command, is not available", async () => {
    const garbage = setup(() => scripted(["not json"]));
    expect((await garbage.provider.available()).ok).toBe(false);
    const failing = setup(() => scripted([], { code: 1, stderr: "boom" }));
    const res = await failing.provider.available();
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).not.toContain("boom");
  });

  test("the auth check never sees an API key either", async () => {
    const t = setup(() => scripted([authStatus]), {
      env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-test-1" },
    });
    await t.provider.available();
    expect(t.calls[0]?.options.env).toEqual({ PATH: "/bin" });
  });
});

// ---- tasks with an image (ADR-007: --input-format stream-json, one line on a piped stdin) ----

const imageFixture = JSON.parse(
  readFileSync(join(here, "__fixtures__/claude-stdin-image.ndjson"), "utf8"),
) as {
  type: string;
  message: {
    role: string;
    content: [
      {
        type: string;
        source: { type: string; media_type: string; data: string };
      },
      { type: string; text: string },
    ];
  };
};
const PNG_BYTES = Buffer.from(
  imageFixture.message.content[0].source.data,
  "base64",
);

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});
/** A data folder with an uploads folder, and a file outside it. */
function world() {
  const root = mkdtempSync(join(tmpdir(), "planner-ai-uploads-"));
  roots.push(root);
  const uploads = join(root, "data", "uploads");
  mkdirSync(uploads, { recursive: true });
  const outside = join(root, "elsewhere");
  mkdirSync(outside);
  return { root, uploads, outside };
}
const withImage = (path: string, mediaType = "image/png"): AiTask<unknown> => ({
  ...task,
  attachments: [{ path, mediaType }],
});

describe("run: a task with an image", () => {
  test("the image and the prompt travel as ONE stream-json line on a piped standard input, and every other flag is unchanged", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-000000000001.png");
    writeFileSync(file, PNG_BYTES);
    const t = setup(() => scripted(answerStream()), { uploadsDir: w.uploads });
    await t.provider.run(withImage(file), t.opts());

    const call = t.calls[0];
    expect(call?.options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    // no prompt argument: it travels on standard input
    expect(call?.args.slice(0, 3)).toEqual([
      "-p",
      "--input-format",
      "stream-json",
    ]);
    const plain = buildArgs("P", "sonnet", jsonSchemaFor(lessonCounts), []);
    // exactly the plain set, with `--input-format stream-json` after -p and no prompt
    expect(call?.args).toEqual([
      "-p",
      "--input-format",
      "stream-json",
      ...plain.slice(2),
    ]);

    const child = t.children[0] as FakeChild;
    expect(child.written).toHaveLength(1);
    expect(child.stdinEnded).toBe(true);
    const sent = child.written[0] ?? "";
    // one line, then the end of input
    expect(sent.trimEnd().split("\n")).toHaveLength(1);
    const line = JSON.parse(sent) as typeof imageFixture;
    // the same shape the controller proved against the real CLI
    expect(line.type).toBe(imageFixture.type);
    expect(line.message.role).toBe(imageFixture.message.role);
    expect(line.message.content[0]).toEqual(imageFixture.message.content[0]);
    const prompt = line.message.content[1].text;
    expect(prompt.startsWith(`${FIRST_LINE}\n`)).toBe(true);
    expect(prompt).toContain("BODY MARKER");
    expect(prompt).not.toContain(imageFixture.message.content[0].source.data);
  });

  test("a JPEG goes as image/jpeg", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-000000000002.jpg");
    writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    const t = setup(() => scripted(answerStream()), { uploadsDir: w.uploads });
    await t.provider.run(withImage(file, "image/jpeg"), t.opts());
    const line = JSON.parse(
      (t.children[0] as FakeChild).written[0] ?? "",
    ) as typeof imageFixture;
    expect(line.message.content[0].source.media_type).toBe("image/jpeg");
  });

  test("a task without an image keeps the old arguments, and standard input stays closed", async () => {
    const t = setup(() => scripted(answerStream()));
    await t.provider.run(task, t.opts());
    expect(t.calls[0]?.args[0]).toBe("-p");
    expect(t.calls[0]?.args[1]?.startsWith(FIRST_LINE)).toBe(true);
    expect(t.calls[0]?.args).not.toContain("--input-format");
    expect(t.calls[0]?.options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect((t.children[0] as FakeChild).written).toEqual([]);
  });

  test("a path outside data/uploads is refused before anything is read or spawned", async () => {
    const w = world();
    const outside = join(w.outside, "t.png");
    writeFileSync(outside, PNG_BYTES);
    // a link inside uploads that leads out
    const link = join(w.uploads, "0b6f1e0e-0000-4000-8000-000000000003.png");
    symlinkSync(outside, link);
    for (const path of [
      outside,
      link,
      join(w.uploads, "..", "elsewhere", "t.png"),
      join(w.uploads, "missing.png"),
    ]) {
      const t = setup(() => scripted(answerStream()), {
        uploadsDir: w.uploads,
      });
      const e = await rejection(t.provider.run(withImage(path), t.opts()));
      expect(e.reason, path).toBe("failed");
      expect(e.message, path).toMatch(/uploads/);
      expect(e.message).not.toContain(w.root);
      expect(t.spawn, path).not.toHaveBeenCalled();
    }
  });

  test("with no uploads folder configured, any attachment is refused", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-000000000004.png");
    writeFileSync(file, PNG_BYTES);
    const t = setup(() => scripted(answerStream()));
    const e = await rejection(t.provider.run(withImage(file), t.opts()));
    expect(e.reason).toBe("failed");
    expect(t.spawn).not.toHaveBeenCalled();
  });

  test("only a PNG or JPEG whose first bytes agree, at most 5 MB, is sent", async () => {
    const w = world();
    const cases: [string, Buffer, string][] = [
      [
        "0b6f1e0e-0000-4000-8000-000000000005.png",
        Buffer.from("%PDF-1.4 not a png"),
        "image/png",
      ],
      [
        "0b6f1e0e-0000-4000-8000-000000000006.pdf",
        Buffer.from("%PDF-1.4"),
        "application/pdf",
      ],
      [
        "0b6f1e0e-0000-4000-8000-000000000007.png",
        Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]),
        "image/png",
      ],
    ];
    for (const [name, bytes, mediaType] of cases) {
      const file = join(w.uploads, name);
      writeFileSync(file, bytes);
      const t = setup(() => scripted(answerStream()), {
        uploadsDir: w.uploads,
      });
      const e = await rejection(
        t.provider.run(withImage(file, mediaType), t.opts()),
      );
      expect(e.reason, name).toBe("failed");
      expect(t.spawn, name).not.toHaveBeenCalled();
    }
  });

  test("the picture's data is never shown: not in stderr, not in the model's own words, and every message is cut to 300 characters", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-000000000008.png");
    writeFileSync(file, PNG_BYTES);
    const data = imageFixture.message.content[0].source.data;
    // a CLI error that repeats part of the request, in the middle of other words
    const echo = scripted([], {
      code: 1,
      stderr: `bad request ${data.slice(10, 90)} end\n`,
    });
    const t = setup(() => echo, { uploadsDir: w.uploads });
    const e = await rejection(t.provider.run(withImage(file), t.opts()));
    expect(e.message).not.toContain(data.slice(10, 50));
    expect(e.message).toBe(
      "Claude could not read the request. Please tell Alberto.",
    );

    // an error result whose text holds the data
    const bad = withResult((r) => {
      r.is_error = true;
      r.subtype = "error_during_execution";
      r.result = `trouble ${data}`;
      delete r.structured_output;
    });
    const t2 = setup(() => scripted(bad), { uploadsDir: w.uploads });
    const e2 = await rejection(t2.provider.run(withImage(file), t2.opts()));
    expect(e2.message).not.toContain(data.slice(0, 40));
    expect(e2.message.length).toBeLessThanOrEqual(300);
  });

  test("a real, asynchronous EPIPE on the pipe does not crash the planner, and the CLI's own reason is what she sees", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-000000000009.png");
    writeFileSync(file, PNG_BYTES);
    const t = setup(
      () => {
        const child = scripted([], {
          code: 1,
          stderr: "Claude Code is signed out. Run `claude` and sign in.\n",
        });
        // a real stream that fails the way a closed pipe does: asynchronously, through 'error'
        child.stdin = new Writable({
          write(_chunk, _encoding, done) {
            done(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
          },
        });
        return child;
      },
      { uploadsDir: w.uploads },
    );
    const e = await rejection(t.provider.run(withImage(file), t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toBe(
      "Claude Code is signed out. Run `claude` and sign in.",
    );
  });

  test("with a dead pipe and nothing on stderr she gets a fixed sentence, never the pipe error", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-00000000000a.png");
    writeFileSync(file, PNG_BYTES);
    const t = setup(
      () => {
        const child = scripted([], { code: 1 });
        child.stdin = new Writable({
          write(_c, _e, done) {
            done(
              Object.assign(new Error("write EPIPE /Users/x"), {
                code: "EPIPE",
              }),
            );
          },
        });
        return child;
      },
      { uploadsDir: w.uploads },
    );
    const e = await rejection(t.provider.run(withImage(file), t.opts()));
    expect(e.message).toMatch(/exit code 1/);
    expect(e.message).not.toMatch(/EPIPE|Users/);
  });

  test("base64 wrapped at 20 characters in stderr is still caught", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-00000000000b.png");
    writeFileSync(file, PNG_BYTES);
    const data = imageFixture.message.content[0].source.data;
    const wrapped = (data.match(/.{1,20}/g) ?? []).join("\n");
    const t = setup(() => scripted([], { code: 1, stderr: `${wrapped}\n` }), {
      uploadsDir: w.uploads,
    });
    const e = await rejection(t.provider.run(withImage(file), t.opts()));
    expect(e.message).toBe(
      "Claude could not read the request. Please tell Alberto.",
    );
  });

  test("an ordinary sentence with no digits is not mistaken for base64 once whitespace is removed", async () => {
    const w = world();
    const file = join(w.uploads, "0b6f1e0e-0000-4000-8000-00000000000c.png");
    writeFileSync(file, PNG_BYTES);
    const t = setup(
      () =>
        scripted([], {
          code: 1,
          stderr: "Claude Code is signed out and needs you to sign in again\n",
        }),
      { uploadsDir: w.uploads },
    );
    const e = await rejection(t.provider.run(withImage(file), t.opts()));
    expect(e.message).toBe(
      "Claude Code is signed out and needs you to sign in again",
    );
  });

  test("a file with a second hard link is refused, and a read error never names a path", async () => {
    const w = world();
    const outside = join(w.outside, "t.png");
    writeFileSync(outside, PNG_BYTES);
    const linked = join(w.uploads, "0b6f1e0e-0000-4000-8000-00000000000d.png");
    linkSync(outside, linked); // a hard link: realpath cannot tell it from a real upload
    const t = setup(() => scripted(answerStream()), { uploadsDir: w.uploads });
    const e = await rejection(t.provider.run(withImage(linked), t.opts()));
    expect(e.reason).toBe("failed");
    expect(e.message).toMatch(/uploads/);
    expect(t.spawn).not.toHaveBeenCalled();

    // a file she cannot read: the raw error holds the path, so it must not reach her
    const locked = join(w.uploads, "0b6f1e0e-0000-4000-8000-00000000000e.png");
    writeFileSync(locked, PNG_BYTES, { mode: 0o000 });
    const t2 = setup(() => scripted(answerStream()), { uploadsDir: w.uploads });
    const e2 = await rejection(t2.provider.run(withImage(locked), t2.opts()));
    expect(e2.message).not.toMatch(/EACCES|Users|var\/folders|tmp/);
    expect(t2.spawn).not.toHaveBeenCalled();
  });

  test("a relative path is resolved against the working directory and is still confined", async () => {
    const w = world();
    const inside = join(w.uploads, "0b6f1e0e-0000-4000-8000-00000000000f.png");
    writeFileSync(inside, PNG_BYTES);
    const outside = join(w.outside, "t.png");
    writeFileSync(outside, PNG_BYTES);
    const here = process.cwd();
    try {
      process.chdir(w.root);
      // relative, inside uploads: accepted
      const ok = setup(() => scripted(answerStream()), {
        uploadsDir: w.uploads,
      });
      await ok.provider.run(
        withImage(`data/uploads/${basename(inside)}`),
        ok.opts(),
      );
      expect(ok.spawn).toHaveBeenCalledTimes(1);
      // a ".." that comes back inside: accepted
      const back = setup(() => scripted(answerStream()), {
        uploadsDir: w.uploads,
      });
      await back.provider.run(
        withImage(`elsewhere/../data/uploads/${basename(inside)}`),
        back.opts(),
      );
      expect(back.spawn).toHaveBeenCalledTimes(1);
      // relative, outside: refused
      for (const path of [
        "elsewhere/t.png",
        "data/uploads/../../elsewhere/t.png",
        "data/uploads",
        "data",
      ]) {
        const t = setup(() => scripted(answerStream()), {
          uploadsDir: w.uploads,
        });
        const e = await rejection(t.provider.run(withImage(path), t.opts()));
        expect(e.reason, path).toBe("failed");
        expect(t.spawn, path).not.toHaveBeenCalled();
      }
    } finally {
      process.chdir(here);
    }
  });
});

describe("buildArgs for a task whose prompt is on standard input", () => {
  test("starts -p --input-format stream-json, has no prompt argument, and keeps every other flag", () => {
    const args = buildArgs("P", "sonnet", { type: "object" }, [], true);
    expect(args.slice(0, 3)).toEqual(["-p", "--input-format", "stream-json"]);
    expect(args).not.toContain("P");
    expect(args).toContain("--no-session-persistence");
    expect(args).not.toContain("--bare");
  });
});
