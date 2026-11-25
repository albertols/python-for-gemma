import {
  AiError,
  type AiProgress,
  type AiProvider,
  type AiResult,
  type AiTask,
  type SkillId,
} from "./port.ts";

type Fixture = unknown | ((input: unknown) => unknown);

/** The provider every test uses. It never calls Claude: it answers from fixtures. */
export class FakeAiProvider implements AiProvider {
  readonly id = "fake";
  readonly calls: AiTask<unknown>[] = [];

  private readonly fixtures: Partial<Record<SkillId, Fixture>>;
  private readonly opts: { delayMs?: number; fail?: AiError["reason"] };

  constructor(
    fixtures: Partial<Record<SkillId, Fixture>>,
    opts: { delayMs?: number; fail?: AiError["reason"] } = {},
  ) {
    this.fixtures = fixtures;
    this.opts = opts;
  }

  async available(): Promise<{ ok: true } | { ok: false; reason: string }> {
    return { ok: true };
  }

  async run<T>(
    task: AiTask<T>,
    opts: { signal: AbortSignal; onProgress: (p: AiProgress) => void },
  ): Promise<AiResult<T>> {
    const startedAt = new Date();
    this.calls.push(task as AiTask<unknown>);
    opts.onProgress({ kind: "started" });
    const fail = (reason: AiError["reason"], message?: string): never => {
      opts.onProgress({ kind: "failed", reason: message ?? reason });
      throw new AiError(reason, message);
    };

    if (opts.signal.aborted) fail("cancelled");
    if (this.opts.delayMs) await wait(this.opts.delayMs, opts.signal, fail);
    if (this.opts.fail) fail(this.opts.fail);

    if (!(task.skillId in this.fixtures))
      fail("failed", `The fake has no fixture for ${task.skillId}`);
    const fixture = this.fixtures[task.skillId];
    const raw = typeof fixture === "function" ? fixture(task.input) : fixture;
    const parsed = task.schema.safeParse(raw);
    if (!parsed.success) fail("invalid-output", parsed.error.message);

    opts.onProgress({ kind: "done" });
    return {
      data: (parsed as { data: T }).data,
      meta: {
        provider: this.id,
        model: "fake",
        skillId: task.skillId,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        sources: [],
      },
    };
  }
}

function wait(
  ms: number,
  signal: AbortSignal,
  fail: (reason: AiError["reason"]) => never,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      try {
        fail("cancelled");
      } catch (e) {
        reject(e);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
