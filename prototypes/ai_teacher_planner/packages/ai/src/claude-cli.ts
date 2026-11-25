import { spawn as nodeSpawnProcess } from "node:child_process";
import type { Source } from "@planner/domain";
import {
  AiError,
  type AiProgress,
  type AiProvider,
  type AiResult,
  type AiTask,
} from "./port.ts";
import {
  buildPrompt,
  getSkill,
  jsonSchemaFor,
  stripFrontMatter,
} from "./registry.ts";
import { cutForUser, linesOf, parseStream } from "./stream.ts";

/** The part of a child process this adapter uses, so tests can fake it. */
export interface ChildLike {
  stdout: AsyncIterable<string | Uint8Array>;
  stderr: AsyncIterable<string | Uint8Array>;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "error", listener: (e: Error) => void): unknown;
  once(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): unknown;
}

// Task 2.20 may widen stdio[0] to "ignore" | "pipe".
export type SpawnLike = (
  command: string,
  args: string[],
  options: { env: Record<string, string>; stdio: ["ignore", "pipe", "pipe"] },
) => ChildLike;

/** The real thing: Node's child_process. Tests never use it. */
export const nodeSpawn: SpawnLike = (command, args, options) =>
  nodeSpawnProcess(command, args, options);

const UNAVAILABLE =
  "Claude Code is not installed on this Mac, or the app cannot find it. Install Claude Code, sign in, then try again.";
const SIGNED_OUT =
  "Claude Code is signed out. Open Claude Code in a terminal, sign in, then try again.";
const UNREADABLE_REQUEST =
  "Claude could not read the request. Please tell Alberto.";
const SIGKILL_AFTER_MS = 5_000;
/**
 * Every prompt starts with this line. The CLI reads a prompt that begins with `-` (such as
 * a SKILL.md's `---` front matter) as an unknown option, so nothing else may come first.
 */
export const PROMPT_PREAMBLE = "You are a skill of the AI Teacher Planner app.";
const AUTH_STATUS_TIMEOUT_MS = 30_000;
const SECRETS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

/** 120 seconds without tools, 300 with. */
export function defaultTimeoutMs(tools: readonly string[]): number {
  return tools.length === 0 ? 120_000 : 300_000;
}

/**
 * The proven flag set (ADR-007). Never `--bare`: it ignores the subscription sign-in.
 * Web skills get `--tools "WebSearch,WebFetch"`; there is no `--allowedTools` (unproven).
 */
export function buildArgs(
  prompt: string,
  model: string,
  schema: object,
  tools: readonly string[],
): string[] {
  if (prompt.startsWith("-"))
    throw new AiError(
      "failed",
      "The request cannot start with a dash, because Claude would read it as an option",
    );
  return [
    "-p",
    prompt,
    "--model",
    model,
    "--tools",
    tools.join(","),
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
    JSON.stringify(schema),
    "--no-session-persistence",
  ];
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function spawnProblem(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if ((e as NodeJS.ErrnoException | undefined)?.code === "ENOENT")
    return new AiError("unavailable", UNAVAILABLE);
  return new AiError("failed", messageOf(e));
}

async function collect(chunks: AsyncIterable<string | Uint8Array>) {
  let text = "";
  for await (const line of linesOf(chunks)) text += `${line}\n`;
  return text;
}

/** The last non-empty line, whole. */
function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return lines.at(-1) ?? "";
}

/**
 * A stderr line she may see. The CLI sometimes repeats the prompt (her extracted text) in an
 * error, so a line holding 40 characters of the prompt, or an "unknown option" error, is
 * replaced by a fixed sentence. Otherwise the line, cut to 300 characters.
 */
function safeStderr(line: string, prompt: string): string {
  if (line.startsWith("error: unknown option")) return UNREADABLE_REQUEST;
  const window = Math.min(40, prompt.length);
  if (window > 0)
    for (let i = 0; i + window <= prompt.length; i++)
      if (line.includes(prompt.slice(i, i + window))) return UNREADABLE_REQUEST;
  return cutForUser(line);
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

interface Execution<T> {
  outcome: Outcome<T>;
  code: number | null;
  stderr: string;
}

/**
 * Sources from schema-validated data only: a skill whose schema declares a `sources` array
 * gets them. Only http and https URLs are kept, and none is marked as opened.
 */
function sourcesOf(data: unknown): Source[] {
  const list = (data as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(list)) return [];
  const sources: Source[] = [];
  for (const s of list) {
    const url = (s as { url?: unknown } | null)?.url;
    if (typeof url !== "string" || !isWebUrl(url)) continue;
    const title = (s as { title?: unknown }).title;
    sources.push({
      url,
      title: typeof title === "string" ? title : null,
      opened: false,
    });
  }
  return sources;
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export class ClaudeCodeCliProvider implements AiProvider {
  readonly id = "claude-code-cli";
  private readonly spawn: SpawnLike;
  private readonly env: Record<string, string>;
  private readonly readSkillText: (promptPath: string) => Promise<string>;
  private readonly timeoutMs: number | undefined;
  private readonly command: string;

  constructor(opts: {
    spawn: SpawnLike;
    env: Record<string, string | undefined>;
    readSkillText: (promptPath: string) => Promise<string>;
    /** Overrides the default: 120 seconds without tools, 300 with. */
    timeoutMs?: number;
    command?: string;
  }) {
    this.spawn = opts.spawn;
    this.readSkillText = opts.readSkillText;
    this.timeoutMs = opts.timeoutMs;
    this.command = opts.command ?? "claude";
    // The child never sees an API key or auth token: a stray key could cause a bill.
    this.env = {};
    for (const [k, v] of Object.entries(opts.env))
      if (v !== undefined && !SECRETS.includes(k)) this.env[k] = v;
  }

  async available(): Promise<{ ok: true } | { ok: false; reason: string }> {
    let run: Execution<string>;
    try {
      run = await this.execute(
        ["auth", "status"],
        { timeoutMs: AUTH_STATUS_TIMEOUT_MS },
        collect,
      );
    } catch (e) {
      return { ok: false, reason: messageOf(e) };
    }
    // `claude auth status` may exit non-zero when signed out, so the JSON comes first.
    if (run.outcome.ok) {
      try {
        const status = JSON.parse(run.outcome.value) as { loggedIn?: unknown };
        if (status.loggedIn === true) return { ok: true };
        if (status.loggedIn === false) return { ok: false, reason: SIGNED_OUT };
      } catch {
        // fall through to the generic sentence
      }
    }
    const said = cutForUser(lastLine(run.stderr));
    return {
      ok: false,
      reason:
        said !== ""
          ? said
          : "Claude Code did not say whether you are signed in. Open it in a terminal and check.",
    };
  }

  async run<T>(
    task: AiTask<T>,
    opts: { signal: AbortSignal; onProgress: (p: AiProgress) => void },
  ): Promise<AiResult<T>> {
    opts.onProgress({ kind: "started" });
    try {
      const result = await this.runTask(task, opts);
      opts.onProgress({ kind: "done" });
      return result;
    } catch (e) {
      const error =
        e instanceof AiError
          ? e.message.length > 300
            ? new AiError(e.reason, cutForUser(e.message))
            : e
          : new AiError("failed", cutForUser(messageOf(e)));
      opts.onProgress({ kind: "failed", reason: error.message });
      throw error;
    }
  }

  private async runTask<T>(
    task: AiTask<T>,
    opts: { signal: AbortSignal; onProgress: (p: AiProgress) => void },
  ): Promise<AiResult<T>> {
    const startedAt = new Date();
    // Task 2.20 proves an image path and replaces this refusal. When it allows attachments,
    // their paths must be confined to data/uploads/ (resolved, no symlink out, no resources).
    if (task.attachments.length > 0)
      throw new AiError(
        "failed",
        "Attachments are not supported yet by the Claude Code adapter",
      );
    if (opts.signal.aborted) throw new AiError("cancelled");

    const skill = getSkill(task.skillId);
    if (task.schema !== skill.output)
      throw new AiError(
        "failed",
        "The task's schema is not the registered skill's output",
      );
    if (
      task.tools.length !== skill.tools.length ||
      !task.tools.every((t) => skill.tools.includes(t))
    )
      throw new AiError(
        "failed",
        "The task's tools are not the registered skill's tools",
      );

    let raw: string;
    try {
      raw = await this.readSkillText(skill.promptPath);
    } catch {
      // the fs message holds a home path: name the skill instead
      throw new AiError(
        "failed",
        `The instructions for ${skill.id} could not be read.`,
      );
    }
    const skillText = `${PROMPT_PREAMBLE}\n\n${stripFrontMatter(raw).trim()}`;
    const prompt = buildPrompt(skill, skillText, task.input, task.text);
    if (opts.signal.aborted) throw new AiError("cancelled");

    const args = buildArgs(
      prompt,
      skill.model,
      jsonSchemaFor(skill),
      task.tools,
    );
    const run = await this.execute(
      args,
      {
        signal: opts.signal,
        timeoutMs: this.timeoutMs ?? defaultTimeoutMs(task.tools),
      },
      (lines) => parseStream(lines, opts.onProgress),
    );

    if (run.code !== 0) {
      const said = lastLine(run.stderr);
      if (said !== "") throw new AiError("failed", safeStderr(said, prompt));
      const exit =
        run.code === null
          ? "Claude Code was stopped before it finished"
          : `Claude Code stopped with exit code ${run.code}`;
      if (!run.outcome.ok && run.outcome.error instanceof AiError)
        throw new AiError(
          "failed",
          cutForUser(`${run.outcome.error.message} (${exit})`),
        );
      throw new AiError("failed", exit);
    }
    if (!run.outcome.ok) throw run.outcome.error;

    const { output, model } = run.outcome.value;
    const parsed = task.schema.safeParse(output);
    if (!parsed.success)
      throw new AiError(
        "invalid-output",
        "Claude's answer did not match what the planner expects.",
      );
    return {
      data: parsed.data,
      meta: {
        provider: this.id,
        model,
        skillId: task.skillId,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        sources: sourcesOf(parsed.data),
      },
    };
  }

  /**
   * Spawns the command, feeds its standard output lines to `consume`, collects standard error,
   * and waits for it to close. A timeout or an abort kills the child and throws at once.
   */
  private async execute<T>(
    args: string[],
    limits: { signal?: AbortSignal; timeoutMs?: number },
    consume: (lines: AsyncIterable<string>) => Promise<T>,
  ): Promise<Execution<T>> {
    let child: ChildLike;
    try {
      child = this.spawn(this.command, args, {
        env: { ...this.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      throw spawnProblem(e);
    }

    let stopped = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let interrupt: (e: AiError) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      interrupt = (e) => {
        if (stopped) return;
        stopped = true;
        // a child that ignores SIGTERM must not keep the queue's slot; the timer is set
        // first because a child may close the moment it is killed, which clears it
        killTimer = setTimeout(() => child.kill("SIGKILL"), SIGKILL_AFTER_MS);
        child.kill("SIGTERM");
        reject(e);
      };
    });
    interrupted.catch(() => {});

    const timer =
      limits.timeoutMs === undefined
        ? undefined
        : setTimeout(
            () =>
              interrupt(
                new AiError(
                  "timeout",
                  `Claude took longer than ${Math.round((limits.timeoutMs ?? 0) / 1000)} seconds, so the planner stopped it`,
                ),
              ),
            limits.timeoutMs,
          );
    const onAbort = () => interrupt(new AiError("cancelled"));
    limits.signal?.addEventListener("abort", onAbort, { once: true });

    const closed = new Promise<number | null>((resolve, reject) => {
      child.once("error", (e) => reject(spawnProblem(e)));
      child.once("close", (code) => {
        clearTimeout(killTimer);
        resolve(code);
      });
    });
    closed.catch(() => {});

    const work = async (): Promise<Execution<T>> => {
      const consumed: Promise<Outcome<T>> = consume(linesOf(child.stdout)).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const [outcome, stderr, code] = await Promise.all([
        consumed,
        collect(child.stderr),
        closed,
      ]);
      return { outcome, code, stderr };
    };

    try {
      return await Promise.race([work(), interrupted]);
    } finally {
      clearTimeout(timer);
      limits.signal?.removeEventListener("abort", onAbort);
    }
  }
}
