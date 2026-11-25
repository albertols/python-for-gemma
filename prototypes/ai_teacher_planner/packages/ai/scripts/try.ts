// Runs one skill through the real Claude Code CLI, by hand: `pnpm ai:try <skill-id> <input.json> [picture]`.
// A picture must be a PNG or JPEG inside <PLANNER_DATA_DIR or data>/uploads/ (the only folder the adapter reads pictures from).
// This is the only place that starts `claude` outside the app. No test does.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ClaudeCodeCliProvider, nodeSpawn } from "../src/claude-cli.ts";
import type { SkillId } from "../src/port.ts";
import { getSkill, readSkillFile } from "../src/registry.ts";

const [skillId, inputFile, picture] = process.argv.slice(2);
if (!skillId || !inputFile) {
  console.error("Usage: pnpm ai:try <skill-id> <input.json> [picture]");
  process.exit(2);
}

const skill = getSkill(skillId as SkillId);
const input: unknown = JSON.parse(readFileSync(resolve(inputFile), "utf8"));
const provider = new ClaudeCodeCliProvider({
  spawn: nodeSpawn,
  env: process.env,
  readSkillText: async (promptPath) => readSkillFile(promptPath),
  uploadsDir: resolve(process.env.PLANNER_DATA_DIR ?? "data", "uploads"),
});

const status = await provider.available();
if (!status.ok) {
  console.error(status.reason);
  process.exit(1);
}
try {
  const result = await provider.run(
    {
      skillId: skill.id,
      input,
      text: null,
      attachments: picture
        ? [
            {
              path: resolve(picture),
              mediaType: /\.jpe?g$/i.test(picture) ? "image/jpeg" : "image/png",
            },
          ]
        : [],
      schema: skill.output,
      tools: skill.tools,
    },
    {
      signal: new AbortController().signal,
      onProgress: (p) => console.error(JSON.stringify(p)),
    },
  );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
