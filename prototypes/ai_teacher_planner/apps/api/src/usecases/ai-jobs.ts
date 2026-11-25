import type { AiProvider } from "@planner/ai";
import {
  AiError,
  type AiErrorReason,
  type AiProgress,
  getSkill,
  type SkillId,
} from "@planner/ai";
import type { CourseId, Resource } from "@planner/domain";
import type { Config } from "../config.ts";
import { ApiError } from "../errors.ts";
import { JobEvents, JobQueue } from "../jobs/queue.ts";
import type { AiItem, AiRun, Repos } from "../repos/ports.ts";

export type { AiItem, AiRun };

/** What a job or an item handler may use. It is not the whole app. */
export interface JobContext {
  repos: Repos;
  ai: AiProvider | null;
  now: () => Date;
  config: Config;
}

/** Turns a skill's output into items, and applies an item once she has accepted it. */
export interface ItemHandler {
  kind: string;
  /** What she must be allowed to edit to review one of these items. */
  resource: Resource;
  toItems(
    output: unknown,
    input: unknown,
  ): { target: string; courseId: CourseId | null; data: unknown }[];
  /** A sentence about what toItems left out (counts only, never the model's words), shown on the finished run. */
  report?(output: unknown, input: unknown): string | null;
  apply(item: AiItem, ctx: JobContext): Promise<void>;
}

export interface JobRequest {
  skillId: SkillId;
  input: unknown;
  text: string | null;
  attachments: string[];
}

/** What the browser hears while a job runs. Never prompt text, a file path or extracted text. */
export type PublicProgress =
  | { kind: "started" | "done" }
  | { kind: "working"; note: string }
  | { kind: "failed"; reason: string };
export type JobEvent =
  | { type: "progress"; progress: PublicProgress }
  | { type: "run"; run: AiRun };

export const AI_OFF = "AI is switched off.";
export const AI_NOT_SET_UP = "The AI is not set up on this server.";
export const CANCELLED = "Cancelled. Nothing was saved.";
export const CLOSED = "The planner was closed while this was running.";

/** One sentence per reason. A provider's own message is never shown. */
export const FAILURE: Record<AiErrorReason, string> = {
  unavailable:
    "Claude Code is not installed on this Mac. Everything else still works.",
  "signed-out":
    "Claude Code is signed out. Run `claude` in a terminal and sign in, then try again.",
  timeout: "Claude took too long and was stopped. Nothing was saved.",
  "invalid-output":
    "Claude returned something the planner could not use. Nothing was saved.",
  cancelled: CANCELLED,
  failed: "Claude stopped with an error. Nothing was saved.",
};

/** A provider's reason, only when it is one of our own sentences; anything else is the generic one. */
export function knownSentence(text: string): string {
  return (Object.values(FAILURE) as string[]).includes(text)
    ? text
    : FAILURE.failed;
}

// ---- item handlers ----

const handlers = new Map<SkillId, ItemHandler>();
export function registerItemHandler(
  skillId: SkillId,
  handler: ItemHandler,
): void {
  handlers.set(skillId, handler);
}
export function getItemHandler(skillId: SkillId): ItemHandler | undefined {
  return handlers.get(skillId);
}

// Each skill's handler registers itself in its own use case file (suggest-counts.ts, ...);
// routes/ai.ts imports them, so every handler exists before a review can come in.

// ---- jobs ----

interface Runner {
  queue: JobQueue;
  events: JobEvents<JobEvent>;
}
// one queue per database, so jobs run one at a time whoever starts them
const runners = new WeakMap<Repos, Runner>();
function runnerOf(ctx: JobContext): Runner {
  let runner = runners.get(ctx.repos);
  if (!runner) {
    runner = { queue: new JobQueue(), events: new JobEvents() };
    runners.set(ctx.repos, runner);
  }
  return runner;
}

export function whenIdle(ctx: JobContext): Promise<void> {
  return runnerOf(ctx).queue.whenIdle();
}

/** Every event so far, then each new one. Returns the way to stop listening. */
export function subscribeToJob(
  ctx: JobContext,
  id: string,
  listener: (e: JobEvent) => void,
): { stop: () => void; known: boolean } {
  const { events } = runnerOf(ctx);
  const known = events.has(id);
  return { stop: events.subscribe(id, listener), known };
}

/** Marks every queued or running run as failed: the planner was closed under them. */
export function failInterrupted(repos: Repos): number {
  return repos.ai.failUnfinished(CLOSED);
}

export function startJob(ctx: JobContext, request: JobRequest): AiRun {
  const runner = runnerOf(ctx);
  const run: Omit<AiRun, "itemIds"> = {
    id: crypto.randomUUID(),
    skillId: request.skillId,
    status: "queued",
    startedAt: ctx.now().toISOString(),
    durationMs: null,
    provider: null,
    model: null,
    failure: null,
  };
  ctx.repos.ai.insertRun(run);
  runner.queue.enqueue({
    id: run.id,
    run: (signal) => execute(ctx, runner, run.id, request, signal),
    onCancelledWhileQueued: () => {
      markCancelled(ctx, run.id);
      emitRun(ctx, runner, run.id);
    },
  });
  return { ...run, itemIds: [] };
}

export function cancelJob(ctx: JobContext, id: string): AiRun {
  const runner = runnerOf(ctx);
  const run = ctx.repos.ai.getRun(id);
  if (!run) throw new ApiError(404, "not-found", "There is no such job.");
  if (run.status !== "queued" && run.status !== "running")
    throw new ApiError(409, "job-finished", "This job has already finished.");
  const was = runner.queue.cancel(id);
  if (was !== "queued") {
    // a running job sees this and stores nothing when its provider settles, then announces the end
    markCancelled(ctx, id);
    if (was === "none") emitRun(ctx, runner, id);
  }
  return ctx.repos.ai.getRun(id) as AiRun;
}

function markCancelled(ctx: JobContext, id: string): void {
  ctx.repos.ai.updateRun(id, { status: "cancelled", failure: CANCELLED });
}

function emitRun(ctx: JobContext, runner: Runner, id: string): void {
  const run = ctx.repos.ai.getRun(id);
  if (run) runner.events.emit(id, { type: "run", run });
}

async function execute(
  ctx: JobContext,
  runner: Runner,
  id: string,
  request: JobRequest,
  signal: AbortSignal,
): Promise<void> {
  const { repos } = ctx;
  const say = (progress: PublicProgress) =>
    runner.events.emit(id, { type: "progress", progress });
  const secrets = secretsOf(request);
  const startedAt = Date.parse(repos.ai.getRun(id)?.startedAt ?? "");
  const fail = (sentence: string) => {
    if (repos.ai.getRun(id)?.status === "cancelled") return;
    const took = ctx.now().getTime() - startedAt;
    repos.ai.updateRun(id, {
      status: "failed",
      failure: sentence,
      durationMs: Number.isFinite(took) ? took : null,
    });
    say({ kind: "failed", reason: sentence });
  };

  repos.ai.updateRun(id, { status: "running", provider: ctx.ai?.id ?? null });
  try {
    const ai = ctx.ai;
    if (!ai) throw new Refusal(AI_OFF);
    // every job asks first: she may have signed out since the last one
    const available = await ai.available();
    if (!available.ok) throw new Refusal(knownSentence(available.reason));
    if (signal.aborted) throw new AiError("cancelled");

    const skill = getSkill(request.skillId);
    const result = await ai.run(
      {
        skillId: request.skillId,
        input: request.input,
        text: request.text,
        attachments: request.attachments.map((path) => ({
          path,
          mediaType: mediaTypeOf(path),
        })),
        schema: skill.output,
        tools: skill.tools,
      },
      {
        signal,
        onProgress: (p) => {
          const safe = publicProgress(p, secrets);
          if (safe) say(safe);
        },
      },
    );
    if (repos.ai.getRun(id)?.status === "cancelled") return;

    const handler = getItemHandler(request.skillId);
    if (!handler) throw new AiError("failed");
    let made: ReturnType<ItemHandler["toItems"]>;
    try {
      made = handler.toItems(result.data, request.input);
    } catch {
      throw new AiError("invalid-output");
    }
    repos.transaction(() => {
      for (const m of made)
        repos.ai.insertItem({
          id: crypto.randomUUID(),
          runId: id,
          kind: handler.kind,
          target: m.target,
          courseId: m.courseId,
          data: m.data,
          review: "suggested",
          reviewedAt: null,
          sources: result.meta.sources,
        });
      repos.ai.updateRun(id, {
        status: "done",
        durationMs: result.meta.durationMs,
        provider: result.meta.provider,
        model: result.meta.model,
        failure: handler.report?.(result.data, request.input) ?? null,
      });
    });
  } catch (e) {
    if (e instanceof Refusal) fail(e.sentence);
    else {
      // the cause stays in the server log; the browser gets one sentence
      if (!(e instanceof AiError)) console.error(e);
      fail(FAILURE[e instanceof AiError ? e.reason : "failed"]);
    }
  } finally {
    emitRun(ctx, runner, id);
  }
}

/** A reason the AI cannot run, already written as a sentence. */
class Refusal extends Error {
  readonly sentence: string;
  constructor(sentence: string) {
    super(sentence);
    this.sentence = sentence;
  }
}

function mediaTypeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      pdf: "application/pdf",
    }[ext] ?? "application/octet-stream"
  );
}

// ---- what the browser may hear ----

function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) stringsIn(v, out);
  return out;
}

/** Her text and the long strings of the input: a progress note may not repeat any of them. */
function secretsOf(request: JobRequest): string[] {
  return [
    ...(request.text === null ? [] : [request.text]),
    ...stringsIn(request.input),
    ...request.attachments,
  ].filter((s) => s.length >= 8);
}

const PLAIN_NOTE = /^[A-Za-z][A-Za-z ,.'-]{0,79}$/;

function echoes(note: string, secrets: readonly string[]): boolean {
  const lower = note.toLowerCase();
  return secrets.some((secret) => {
    const s = secret.toLowerCase();
    if (lower.includes(s) || s.includes(lower)) return true;
    const window = Math.min(20, s.length);
    for (let i = 0; i + window <= s.length; i++)
      if (lower.includes(s.slice(i, i + window))) return true;
    return false;
  });
}

/**
 * A progress note she may see: plain words only, nothing with a slash or a digit, nothing that
 * repeats her text or the input. Anything else becomes "Working". The provider's own failure
 * text is dropped: the job announces its own sentence instead.
 */
function publicProgress(
  p: AiProgress,
  secrets: readonly string[],
): PublicProgress | null {
  if (p.kind === "failed") return null;
  if (p.kind !== "working") return { kind: p.kind };
  const note = p.note.trim();
  return {
    kind: "working",
    note: PLAIN_NOTE.test(note) && !echoes(note, secrets) ? note : "Working",
  };
}
