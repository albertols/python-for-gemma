import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildArgs,
  type ChildLike,
  ClaudeCodeCliProvider,
  defaultTimeoutMs,
  type SpawnLike,
} from "./claude-cli.ts";
import { AiError, type AiProgress, type AiTask } from "./port.ts";
import { getSkill, jsonSchemaFor } from "./registry.ts";
import { recordedLines, withResult } from "./stream.test.ts";

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
  killed: string | undefined;
  private closed = false;
  private onClose: ((code: number | null, signal: string | null) => void)[] =
    [];
  private onError: ((e: Error) => void)[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.killed = signal;
    this.finish(null, signal);
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
  const spawn = vi.fn<SpawnLike>((command, args, options) => {
    calls.push({ command, args, options });
    return make();
  });
  return { spawn, calls };
}

// ---- the task and the provider ----

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
  extra: { env?: Record<string, string | undefined>; timeoutMs?: number } = {},
) {
  const { spawn, calls } = spawnReturning(make);
  const provider = new ClaudeCodeCliProvider({
    spawn,
    env: extra.env ?? { PATH: "/bin" },
    readSkillText: async () => "SKILL TEXT",
    timeoutMs: extra.timeoutMs ?? 5_000,
  });
  const progress: AiProgress[] = [];
  const opts = (signal = new AbortController().signal) => ({
    signal,
    onProgress: (p: AiProgress) => progress.push(p),
  });
  return { provider, spawn, calls, progress, opts };
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

  test("it spawns `claude` with the skill's model, the schema, and a prompt of skill text then input", async () => {
    const t = setup(() => scripted(answerStream()));
    await t.provider.run(task, t.opts());
    expect(t.calls).toHaveLength(1);
    const call = t.calls[0] as SpawnCall;
    expect(call.command).toBe("claude");
    const prompt = call.args[1] ?? "";
    expect(prompt.startsWith("SKILL TEXT")).toBe(true);
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

  test("sources come from the output's own sources array, never marked as opened", async () => {
    const withSources = {
      ...answer,
      sources: [
        { url: "https://example.org/a", title: "A page" },
        { url: "https://example.org/b" },
        { title: "no url, dropped" },
        "not an object",
      ],
    };
    const t = setup(() =>
      scripted(
        withResult((r) => {
          r.structured_output = withSources;
        }),
      ),
    );
    const res = await t.provider.run(task, t.opts());
    expect(res.meta.sources).toEqual([
      { url: "https://example.org/a", title: "A page", opened: false },
      { url: "https://example.org/b", title: null, opened: false },
    ]);
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
  test("every attachment is refused for now, before anything is spawned", async () => {
    // Task 2.20 proves an image path and replaces this test. Until then:
    // when 2.20 allows attachments, their paths must be confined to data/uploads/.
    const t = setup(() => scripted(answerStream()));
    await expect(
      t.provider.run(
        {
          ...task,
          attachments: [{ path: "data/uploads/a.png", mediaType: "image/png" }],
        },
        t.opts(),
      ),
    ).rejects.toMatchObject({
      reason: "failed",
      message: expect.stringContaining("not supported yet"),
    });
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.progress).toContainEqual(
      expect.objectContaining({ kind: "failed" }),
    );
  });

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
    expect(res.ok === false && res.reason).toMatch(/signed out/i);
    expect(res.ok === false && res.reason).toMatch(/claude/i);
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
    expect(res.ok === false && res.reason).toMatch(/install/i);
  });

  test("output that is not JSON, or a failing command, is not available", async () => {
    const garbage = setup(() => scripted(["not json"]));
    expect((await garbage.provider.available()).ok).toBe(false);
    const failing = setup(() => scripted([], { code: 1, stderr: "boom" }));
    const res = await failing.provider.available();
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("boom");
  });

  test("the auth check never sees an API key either", async () => {
    const t = setup(() => scripted([authStatus]), {
      env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-test-1" },
    });
    await t.provider.available();
    expect(t.calls[0]?.options.env).toEqual({ PATH: "/bin" });
  });
});
