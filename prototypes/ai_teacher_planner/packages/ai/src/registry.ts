import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SkillId } from "./port.ts";
import { suggestLessonCounts } from "./skills/planner-suggest-lesson-counts.ts";

export interface SkillDefinition<I, O> {
  id: SkillId;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  tools: ("WebSearch" | "WebFetch")[];
  model: "haiku" | "sonnet" | "opus";
  /** `.claude/skills/<id>/SKILL.md`, from the repo root. */
  promptPath: string;
}

// Skills are stored as SkillDefinition<unknown, unknown>: callers validate through the Zod schemas.
function register<I, O>(
  s: SkillDefinition<I, O>,
): SkillDefinition<unknown, unknown> {
  return s as unknown as SkillDefinition<unknown, unknown>;
}

export const skills: Partial<
  Record<SkillId, SkillDefinition<unknown, unknown>>
> = {
  "planner-suggest-lesson-counts": register(suggestLessonCounts),
};

/**
 * Skills whose SKILL.md (and generated schema.json) has not been written yet.
 * The task that writes a skill's SKILL.md removes its id here, in the same commit.
 */
export const PENDING_SKILL_TEXT: readonly SkillId[] = [
  "planner-suggest-lesson-counts",
];

export function getSkill(id: SkillId): SkillDefinition<unknown, unknown> {
  const skill = skills[id];
  if (!skill) throw new Error(`No skill is registered with the id "${id}"`);
  return skill;
}

/** The repo root, found from this file so the working directory does not matter. */
export function repoRoot(): string {
  // packages/ai/src -> ai -> packages -> ai_teacher_planner -> prototypes -> repo
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
}

export function readSkillText(
  skill: SkillDefinition<unknown, unknown>,
): string {
  return readFileSync(resolve(repoRoot(), skill.promptPath), "utf8");
}

/** The `description:` line of a SKILL.md front matter, or "" when there is none. */
export function descriptionOf(text: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const line = front?.[1]
    ?.split(/\r?\n/)
    .find((l) => l.startsWith("description:"));
  return line ? line.slice("description:".length).trim() : "";
}

const RESOURCES_PATH = /prototypes\/resources/;

/**
 * The text a model sees: the skill text, then the input as JSON, then the extracted text.
 * The input is parsed with the skill's own schema, which drops any key it does not name,
 * so a stray file path cannot ride along. A path into the resources folder is refused.
 */
export function buildPrompt(
  skill: SkillDefinition<unknown, unknown>,
  skillText: string,
  input: unknown,
  text: string | null,
): string {
  const clean = skill.input.parse(input);
  const json = JSON.stringify(clean, null, 2);
  const parts = [
    skillText.trimEnd(),
    `## Input\n\n\`\`\`json\n${json}\n\`\`\``,
  ];
  if (text !== null) parts.push(`## Extracted text\n\n${text}`);
  const prompt = parts.join("\n\n");
  if (RESOURCES_PATH.test(json) || (text !== null && RESOURCES_PATH.test(text)))
    throw new Error(
      "A prompt may not contain a path into the resources folder",
    );
  return prompt;
}

export function jsonSchemaFor(
  skill: SkillDefinition<unknown, unknown>,
): object {
  return z.toJSONSchema(skill.output);
}
