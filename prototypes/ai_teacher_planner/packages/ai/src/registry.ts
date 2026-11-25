import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
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
  const root = resolve(repoRoot(), ".claude/skills");
  const file = resolve(repoRoot(), skill.promptPath);
  if (!file.startsWith(`${root}${sep}`))
    throw new Error(
      `A skill prompt must be under .claude/skills, not "${skill.promptPath}"`,
    );
  return readFileSync(file, "utf8");
}

/** The `description:` line of a SKILL.md front matter, or "" when there is none. */
export function descriptionOf(text: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const line = front?.[1]
    ?.split(/\r?\n/)
    .find((l) => l.startsWith("description:"));
  return line ? line.slice("description:".length).trim() : "";
}

/** Lower-case, forward slashes, no `//` or `/./`, and `x/../` resolved textually. */
function normalisePath(raw: string): string {
  let s = raw.toLowerCase().replaceAll("\\", "/");
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s
      .replace(/\/{2,}/g, "/")
      .replace(/\/\.(?=\/)/g, "")
      .replace(/[^/\s"']+\/\.\.(?:\/|$)/g, (m) =>
        m.startsWith("..") ? m : "",
      );
  }
  return s;
}

/** Does this one string look like a path into the resources folder? */
function pointsAtResources(
  raw: string,
  extraRoot: string | undefined,
): boolean {
  const s = normalisePath(raw);
  if (s.includes("prototypes/resources")) return true;
  if (/(^|[^a-z0-9_.-])\.\.\/resources(\/|$)/.test(s)) return true;
  if (/(^|\n)\s*resources\//.test(s)) return true;
  if (extraRoot) {
    const root = normalisePath(extraRoot).replace(/\/+$/, "");
    if (root !== "" && s.includes(root)) return true;
  }
  return false;
}

function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) stringsIn(v, out);
  return out;
}

/**
 * Second line of defence. The real guard is that a skill receives extracted text only
 * and the model has no file tools. This refuses a string that looks like a path into the
 * resources folder (any case, slash style or `..` trick), or into `resourcesRoot` when given.
 */
export function assertPromptSafe(
  cleanInput: unknown,
  text: string | null,
  opts: { resourcesRoot?: string } = {},
): void {
  const strings = [...stringsIn(cleanInput), ...(text === null ? [] : [text])];
  if (strings.some((s) => pointsAtResources(s, opts.resourcesRoot)))
    throw new Error(
      "A prompt may not contain a path into the resources folder",
    );
}

/**
 * The text a model sees: the skill text, then the input as JSON, then the extracted text.
 * The input is parsed with the skill's own schema, which drops any key it does not name,
 * so a stray file path cannot ride along.
 */
export function buildPrompt(
  skill: SkillDefinition<unknown, unknown>,
  skillText: string,
  input: unknown,
  text: string | null,
  opts: { resourcesRoot?: string } = {},
): string {
  const clean = skill.input.parse(input);
  assertPromptSafe(clean, text, opts);
  const parts = [
    skillText.trimEnd(),
    `## Input\n\n\`\`\`json\n${JSON.stringify(clean, null, 2)}\n\`\`\``,
  ];
  if (text !== null) parts.push(`## Extracted text\n\n${text}`);
  return parts.join("\n\n");
}

/**
 * Problems between the registry, the pending list and the files on disk, under `root`:
 * a pending skill that has a SKILL.md, a live skill without one or with a stale schema.json,
 * and every planner-* or content-* SKILL.md (registered or not) whose description lacks the
 * "for the app, not interactive" opening (ruling 41).
 */
export function skillFileProblems(
  root: string,
  pending: readonly SkillId[],
): string[] {
  const problems: string[] = [];
  const skillsDir = resolve(root, ".claude/skills");
  const textOf = (id: string) => resolve(skillsDir, id, "SKILL.md");
  for (const skill of Object.values(skills)) {
    if (!skill) continue;
    const exists = existsSync(textOf(skill.id));
    if (pending.includes(skill.id)) {
      if (exists)
        problems.push(
          `${skill.id}: SKILL.md exists but the id is still in PENDING_SKILL_TEXT`,
        );
      continue;
    }
    if (!exists) {
      problems.push(`${skill.id}: no SKILL.md`);
      continue;
    }
    const schemaFile = resolve(skillsDir, skill.id, "schema.json");
    const expected = JSON.stringify(jsonSchemaFor(skill));
    const onDisk = existsSync(schemaFile)
      ? JSON.stringify(JSON.parse(readFileSync(schemaFile, "utf8")))
      : null;
    if (onDisk !== JSON.stringify(JSON.parse(expected)))
      problems.push(`${skill.id}: schema.json is missing or stale`);
  }
  const dirs = existsSync(skillsDir) ? readdirSync(skillsDir).sort() : [];
  for (const id of dirs) {
    if (!/^(planner|content)-/.test(id) || INTERACTIVE_SKILLS.includes(id))
      continue;
    if (!existsSync(textOf(id))) continue;
    if (!APP_ONLY.test(descriptionOf(readFileSync(textOf(id), "utf8"))))
      problems.push(
        `${id}: description must start "Used by the AI Teacher Planner app (headless). Not for interactive use."`,
      );
  }
  return problems;
}

/** Planner skills that are meant for interactive sessions. */
const INTERACTIVE_SKILLS = ["planner-run-and-verify"];
const APP_ONLY =
  /^Used by the AI Teacher Planner app \(headless\)\. Not for interactive use\./;

export function jsonSchemaFor(
  skill: SkillDefinition<unknown, unknown>,
): object {
  return z.toJSONSchema(skill.output);
}
