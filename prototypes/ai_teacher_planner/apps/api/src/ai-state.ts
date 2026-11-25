import { AiError, type AiProvider } from "@planner/ai";
import type { Config } from "./config.ts";
import type { Repos } from "./repos/ports.ts";
import {
  AI_NOT_SET_UP,
  AI_OFF,
  FAILURE,
  type JobContext,
  knownSentence,
} from "./usecases/ai-jobs.ts";

type Availability = { available: boolean; reason: string | null };
const CACHE_MS = 60_000;

/** For the browser tests: Claude Code, signed out. */
const signedOut: AiProvider = {
  id: "signed-out",
  available: async () => ({ ok: false, reason: FAILURE["signed-out"] }),
  async run() {
    throw new AiError("signed-out");
  },
};

/**
 * The AI the app is using right now: the job context, the mode she is told, and whether it
 * works. The browser tests may switch it (`switchTo`) and put it back (`restore`).
 */
export function createAiState(opts: {
  config: Config;
  ai: AiProvider | null;
  repos: Repos;
  now: () => Date;
}) {
  const { config, repos, now } = opts;
  let mode: Config["ai"] = config.ai;
  const ctx: JobContext = {
    repos,
    ai: config.ai === "off" ? null : opts.ai,
    now,
    config,
  };
  let cache: {
    provider: AiProvider;
    at: number;
    value: Promise<Availability>;
  } | null = null;

  async function probe(provider: AiProvider): Promise<Availability> {
    try {
      const r = await provider.available();
      return r.ok
        ? { available: true, reason: null }
        : { available: false, reason: knownSentence(r.reason) };
    } catch {
      return { available: false, reason: FAILURE.failed };
    }
  }

  /** Checked at start-up and at most once a minute after that. */
  function availability(): Promise<Availability> {
    if (mode === "off" || !ctx.ai)
      return Promise.resolve({
        available: false,
        reason: mode === "off" ? null : AI_NOT_SET_UP,
      });
    const at = now().getTime();
    if (!cache || cache.provider !== ctx.ai || at - cache.at >= CACHE_MS)
      cache = { provider: ctx.ai, at, value: probe(ctx.ai) };
    return cache.value;
  }

  return {
    ctx,
    mode: () => mode,
    availability,
    /** A fresh check, for starting a job. */
    async check(): Promise<
      { ok: true } | { ok: false; code: string; reason: string }
    > {
      if (mode === "off") return { ok: false, code: "ai-off", reason: AI_OFF };
      const provider = ctx.ai;
      if (!provider)
        return { ok: false, code: "ai-unavailable", reason: AI_NOT_SET_UP };
      const value = probe(provider);
      cache = { provider, at: now().getTime(), value };
      const result = await value;
      return result.available
        ? { ok: true }
        : { ok: false, code: "ai-unavailable", reason: result.reason ?? "" };
    },
    switchTo(to: "fake" | "off" | "signed-out") {
      cache = null;
      if (to === "off") {
        mode = "off";
        ctx.ai = null;
      } else if (to === "signed-out") {
        mode = config.ai === "off" ? "fake" : config.ai;
        ctx.ai = signedOut;
      } else this.restore();
    },
    /** Back to what the app started with. */
    restore() {
      cache = null;
      mode = config.ai;
      ctx.ai = config.ai === "off" ? null : opts.ai;
    },
  };
}
export type AiState = ReturnType<typeof createAiState>;
