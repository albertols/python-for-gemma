import path from "node:path";
import {
  type AiProvider,
  ClaudeCodeCliProvider,
  nodeSpawn,
  readSkillFile,
  type SkillId,
} from "@planner/ai";
import { FakeAiProvider } from "@planner/ai/fake";
import { FAKE_AI_OUTPUTS } from "@planner/fixtures";
import type { Config } from "./config.ts";

/** Picks the AI for PLANNER_AI: none, the fake (answers from fixtures/src/fake-ai.ts), or Claude Code. */
export function providerFor(
  config: Pick<Config, "ai" | "dataDir">,
  env: Record<string, string | undefined>,
): AiProvider | null {
  if (config.ai === "off") return null;
  if (config.ai === "fake")
    return new FakeAiProvider(
      FAKE_AI_OUTPUTS as Partial<Record<SkillId, unknown>>,
    );
  return new ClaudeCodeCliProvider({
    spawn: nodeSpawn,
    env,
    readSkillText: async (promptPath) => readSkillFile(promptPath),
    // the only folder a picture may be read from
    uploadsDir: path.join(config.dataDir, "uploads"),
  });
}
