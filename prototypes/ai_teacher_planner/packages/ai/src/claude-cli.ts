import { spawn as nodeSpawnProcess } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, sep } from "node:path";
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
  withoutSchemaKey,
} from "./registry.ts";
import { cutForUser, linesOf, parseStream } from "./stream.ts";

/** The part of a child process this adapter uses, so tests can fake it. */
export interface ChildLike {
  stdout: AsyncIterable<string | Uint8Array>;
  stderr: AsyncIterable<string | Uint8Array>;
  /** Present when the child was started with a piped standard input (a task with a picture). */
  stdin?: {
    end(data: string): unknown;
    on(event: "error", listener: (e: Error) => void): unknown;
  } | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "error", listener: (e: Error) => void): unknown;
  once(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): unknown;
}

/** Standard input is closed ("ignore") for every task except one with a picture, which pipes it (ADR-007). */
export type SpawnLike = (
  command: string,
  args: string[],
  options: {
    env: Record<string, string>;
    stdio: ["ignore" | "pipe", "pipe", "pipe"];
  },
) => ChildLike;

/** The real thing: Node's child_process. Tests never use it. */
export const nodeSpawn: SpawnLike = (command, args, options) =>
  // stdout and stderr are always piped; the wider stdio[0] type hides that from node's overloads
  nodeSpawnProcess(command, args, options) as unknown as ChildLike;

const UNAVAILABLE =
  "Claude Code is not installed on this Mac. Everything else still works.";
const SIGNED_OUT =
  "Claude Code is signed out. Run `claude` in a terminal and sign in, then try again.";
const UNKNOWN_STATUS =
  "Claude Code did not say whether you are signed in. Open it in a terminal and check.";
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
/** A picture may be at most this big (10 MB). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const NOT_IN_UPLOADS =
  "That picture is not in the planner's uploads folder, so it was not sent.";
const IMAGE_TYPES: Record<string, readonly number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};
/** 40 or more base64 characters in a row: a piece of a picture, which is never shown. */
const BASE64_RUN = /[A-Za-z0-9+/=]{40,}/;

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
  /** A task with a picture: the prompt goes on standard input as stream-json, so it is not an argument. */
  fromStdin = false,
): string[] {
  if (prompt.startsWith("-"))
    throw new AiError(
      "failed",
      "The request cannot start with a dash, because Claude would read it as an option",
    );
  return [
    ...(fromStdin ? ["-p", "--input-format", "stream-json"] : ["-p", prompt]),
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
    JSON.stringify(withoutSchemaKey(schema)),
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
function safeStderr(line: string, prompt: string, hasImage: boolean): string {
  return unsafeToShow(line, prompt, hasImage)
    ? UNREADABLE_REQUEST
    : cutForUser(line);
}

/** Does this text hold 40 characters of the prompt, or is it an "unknown option" error? */
function unsafeToShow(
  text: string,
  prompt: string,
  hasImage: boolean,
): boolean {
  if (text.startsWith("error: unknown option")) return true;
  if (hasImage && BASE64_RUN.test(text)) return true;
  const window = Math.min(40, prompt.length);
  if (window > 0)
    for (let i = 0; i + window <= prompt.length; i++)
      if (text.includes(prompt.slice(i, i + window))) return true;
  return false;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

interface Execution<T> {
  outcome: Outcome<T>;
  code: number | null;
  stderr: string;
}

/**
 * Sources from schema-validated data only: a skill whose schema declares a `sources` array
 * gets them. Only https URLs are kept, and none is marked as opened.
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
    return protocol === "https:";
  } catch {
    return false;
  }
}

/** One picture as it goes into the request. */
interface ImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
}

const startsWithBytes = (head: Uint8Array, bytes: readonly number[]) =>
  bytes.every((b, i) => head[i] === b);

/**
 * The pictures of a task, read only from `uploadsDir`. The path must resolve (every symlink
 * followed) to a file directly inside the folder, before anything is read; the type must be
 * PNG or JPEG with matching first bytes; at most 10 MB. A refusal never names a path.
 */
function readImages(
  attachments: AiTask<unknown>["attachments"],
  uploadsDir: string | undefined,
): ImageBlock[] {
  const refuse = (why: string) => new AiError("failed", why);
  if (uploadsDir === undefined) throw refuse(NOT_IN_UPLOADS);
  let root: string;
  try {
    root = realpathSync(uploadsDir);
  } catch {
    throw refuse(NOT_IN_UPLOADS);
  }
  const blocks: ImageBlock[] = [];
  for (const a of attachments) {
    const signature = IMAGE_TYPES[a.mediaType];
    if (!signature)
      throw refuse("Only a PNG or JPEG picture can be sent to Claude.");
    let real: string;
    try {
      real = realpathSync(a.path);
    } catch {
      throw refuse(NOT_IN_UPLOADS);
    }
    if (dirname(real) !== root || !real.startsWith(`${root}${sep}`))
      throw refuse(NOT_IN_UPLOADS);
    const info = statSync(real);
    if (!info.isFile()) throw refuse(NOT_IN_UPLOADS);
    if (info.size > MAX_IMAGE_BYTES)
      throw refuse("That picture is over 10 MB, so it was not sent.");
    const bytes = readFileSync(real);
    if (!startsWithBytes(bytes, signature))
      throw refuse("That file is not really a picture of its type.");
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: a.mediaType,
        data: bytes.toString("base64"),
      },
    });
  }
  return blocks;
}

/** The one line of standard input: the pictures, then the prompt, as a single user message. */
export function buildImageStdin(
  prompt: string,
  images: readonly ImageBlock[],
): string {
  return `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [...images, { type: "text", text: prompt }],
    },
  })}\n`;
}

export class ClaudeCodeCliProvider implements AiProvider {
  readonly id = "claude-code-cli";
  private readonly spawn: SpawnLike;
  private readonly env: Record<string, string>;
  private readonly readSkillText: (promptPath: string) => Promise<string>;
  private readonly timeoutMs: number | undefined;
  private readonly command: string;
  private readonly uploadsDir: string | undefined;

  constructor(opts: {
    spawn: SpawnLike;
    env: Record<string, string | undefined>;
    readSkillText: (promptPath: string) => Promise<string>;
    /** Overrides the default: 120 seconds without tools, 300 with. */
    timeoutMs?: number;
    command?: string;
    /** The only folder a task's pictures may come from (data/uploads). Without it, every attachment is refused. */
    uploadsDir?: string;
  }) {
    this.spawn = opts.spawn;
    this.readSkillText = opts.readSkillText;
    this.timeoutMs = opts.timeoutMs;
    this.command = opts.command ?? "claude";
    this.uploadsDir = opts.uploadsDir;
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
      // only a fixed sentence: a spawn error can hold a path
      return {
        ok: false,
        reason:
          spawnProblem(e).reason === "unavailable"
            ? UNAVAILABLE
            : UNKNOWN_STATUS,
      };
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
    return { ok: false, reason: UNKNOWN_STATUS };
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
    // Pictures come only from data/uploads and are read in memory: the request line is never written to disk.
    const hasImage = task.attachments.length > 0;
    const images = hasImage
      ? readImages(task.attachments, this.uploadsDir)
      : [];
    if (opts.signal.aborted) throw new AiError("cancelled");

    const args = buildArgs(
      prompt,
      skill.model,
      jsonSchemaFor(skill),
      task.tools,
      hasImage,
    );
    const run = await this.execute(
      args,
      {
        signal: opts.signal,
        timeoutMs: this.timeoutMs ?? defaultTimeoutMs(task.tools),
        ...(hasImage ? { stdin: buildImageStdin(prompt, images) } : {}),
      },
      (lines) =>
        parseStream(lines, opts.onProgress, (text) =>
          unsafeToShow(text, prompt, hasImage) ? UNREADABLE_REQUEST : text,
        ),
    );

    if (run.code !== 0) {
      // Every line is screened, not only the last: the CLI may echo the prompt anywhere.
      const lines = run.stderr
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== "");
      if (lines.some((l) => unsafeToShow(l, prompt, hasImage)))
        throw new AiError("failed", UNREADABLE_REQUEST);
      const said = lastLine(run.stderr);
      if (said !== "")
        throw new AiError("failed", safeStderr(said, prompt, hasImage));
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
    limits: { signal?: AbortSignal; timeoutMs?: number; stdin?: string },
    consume: (lines: AsyncIterable<string>) => Promise<T>,
  ): Promise<Execution<T>> {
    let child: ChildLike;
    try {
      child = this.spawn(this.command, args, {
        env: { ...this.env },
        stdio: [limits.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
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

    if (limits.stdin !== undefined) {
      const stdin = child.stdin;
      const closedEarly = () =>
        interrupt(
          new AiError(
            "failed",
            "Claude Code closed before it took the picture.",
          ),
        );
      if (!stdin) closedEarly();
      else {
        stdin.on("error", closedEarly);
        try {
          stdin.end(limits.stdin);
        } catch {
          closedEarly();
        }
      }
    }

    const closed = new Promise<number | null>((resolve, reject) => {
      child.once("error", (e) => {
        // an errored child may never close, so the pending SIGKILL has no one to wait for
        clearTimeout(killTimer);
        reject(spawnProblem(e));
      });
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
