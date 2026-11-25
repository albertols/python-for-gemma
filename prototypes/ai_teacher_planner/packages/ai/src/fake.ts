import {
  AiError,
  type AiProgress,
  type AiProvider,
  type AiResult,
  type AiTask,
  type SkillId,
} from "./port.ts";
import { assertPromptSafe, getSkill } from "./registry.ts";

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

    // like the real adapter, until an image path is proven (Task 2.20)
    if (task.attachments.length > 0)
      fail(
        "failed",
        "Attachments are not supported yet by the Claude Code adapter",
      );
    if (opts.signal.aborted) fail("cancelled");
    if (this.opts.delayMs) await wait(this.opts.delayMs, opts.signal, fail);
    if (this.opts.fail) fail(this.opts.fail);

    try {
      const skill = getSkill(task.skillId);
      if (task.schema !== skill.output)
        fail(
          "failed",
          "The task's schema is not the registered skill's output",
        );
      if (
        task.tools.length !== skill.tools.length ||
        !task.tools.every((t) => skill.tools.includes(t))
      )
        fail("failed", "The task's tools are not the registered skill's tools");
      assertPromptSafe(skill.input.parse(task.input), task.text);
    } catch (e) {
      if (e instanceof AiError) throw e;
      return fail("failed", e instanceof Error ? e.message : String(e));
    }

    if (!(task.skillId in this.fixtures))
      fail("failed", `The fake has no fixture for ${task.skillId}`);
    const fixture = this.fixtures[task.skillId];
    let raw: unknown;
    try {
      raw = typeof fixture === "function" ? fixture(task.input) : fixture;
    } catch (e) {
      return fail("failed", e instanceof Error ? e.message : String(e));
    }
    const parsed = task.schema.safeParse(raw);
    if (!parsed.success) return fail("invalid-output", parsed.error.message);

    opts.onProgress({ kind: "done" });
    return {
      data: parsed.data,
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
