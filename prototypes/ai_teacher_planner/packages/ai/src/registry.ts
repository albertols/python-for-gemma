import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SkillId } from "./port.ts";
import { buildCurriculumPack } from "./skills/planner-build-curriculum-pack.ts";
import { importTimetable } from "./skills/planner-import-timetable.ts";
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
  "planner-build-curriculum-pack": register(buildCurriculumPack),
  "planner-import-timetable": register(importTimetable),
};

/**
 * Skills whose SKILL.md (and generated schema.json) has not been written yet.
 * The task that writes a skill's SKILL.md removes its id here, in the same commit.
 */
export const PENDING_SKILL_TEXT: readonly SkillId[] = [];

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

/**
 * Reads a skill's text from `promptPath` (relative to the repo root). The file must be under
 * `.claude/skills`, both as written and after following every symlink, so a link inside that
 * folder cannot lead out of it. `root` is for tests.
 */
export function readSkillFile(
  promptPath: string,
  root: string = repoRoot(),
): string {
  const skillsDir = resolve(root, ".claude/skills");
  const file = resolve(root, promptPath);
  const refuse = () =>
    new Error(
      `A skill prompt must be under .claude/skills, not "${promptPath}"`,
    );
  if (!file.startsWith(`${skillsDir}${sep}`)) throw refuse();
  const realFile = realpathSync(file);
  if (!realFile.startsWith(`${realpathSync(skillsDir)}${sep}`)) throw refuse();
  return readFileSync(realFile, "utf8");
}

export function readSkillText(
  skill: SkillDefinition<unknown, unknown>,
  root: string = repoRoot(),
): string {
  return readSkillFile(skill.promptPath, root);
}

/** The text after a leading `---` ... `---` front-matter block (all of it when there is none). */
export function stripFrontMatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
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
  if (/(^|[^a-z0-9_.-])\.\/resources(\/|$)/.test(s)) return true;
  if (/(^|\n)\s*(\.\/)*resources\//.test(s)) return true;
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
 * and every SKILL.md whose description lacks the "for the app, not interactive" opening
 * (ruling 41): each registered skill, whatever its id, and each planner-* or content-* folder.
 */
export function skillFileProblems(
  root: string,
  pending: readonly SkillId[],
): string[] {
  const problems: string[] = [];
  const skillsDir = resolve(root, ".claude/skills");
  const textOf = (id: string) => resolve(skillsDir, id, "SKILL.md");
  // A skill's own promptPath is the file that counts, not a folder named after its id.
  const fileOf = (skill: SkillDefinition<unknown, unknown>) =>
    resolve(root, skill.promptPath);
  const checked = new Set<string>();
  for (const skill of Object.values(skills)) {
    if (!skill) continue;
    const exists = existsSync(fileOf(skill));
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
    const schemaFile = resolve(dirname(fileOf(skill)), "schema.json");
    const expected = JSON.stringify(jsonSchemaFor(skill));
    const onDisk = existsSync(schemaFile)
      ? JSON.stringify(JSON.parse(readFileSync(schemaFile, "utf8")))
      : null;
    if (onDisk !== JSON.stringify(JSON.parse(expected)))
      problems.push(`${skill.id}: schema.json is missing or stale`);
  }
  // Description check (ruling 41): every registered skill's own file, then every
  // planner-* or content-* folder that no registered skill points at.
  const toCheck: { label: string; file: string }[] = [];
  for (const skill of Object.values(skills))
    if (skill) toCheck.push({ label: skill.id, file: fileOf(skill) });
  const dirs = existsSync(skillsDir) ? readdirSync(skillsDir).sort() : [];
  for (const id of dirs)
    if (/^(planner|content)-/.test(id) && !INTERACTIVE_SKILLS.includes(id))
      toCheck.push({ label: id, file: textOf(id) });
  for (const { label, file } of toCheck) {
    if (checked.has(file) || !existsSync(file)) continue;
    checked.add(file);
    if (!APP_ONLY.test(descriptionOf(readFileSync(file, "utf8"))))
      problems.push(
        `${label}: description must start "Used by the AI Teacher Planner app (headless). Not for interactive use."`,
      );
  }
  return problems;
}

/** Planner skills that are meant for interactive sessions. */
const INTERACTIVE_SKILLS = ["planner-run-and-verify"];
const APP_ONLY =
  /^Used by the AI Teacher Planner app \(headless\)\. Not for interactive use\./;

/** A copy of the schema with every `$schema` key removed, at any depth. */
export function withoutSchemaKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSchemaKey);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== "$schema")
        .map(([k, v]) => [k, withoutSchemaKey(v)]),
    );
  return value;
}

/**
 * The schema the CLI gets: draft 7, which its validator knows, and no `$schema` key, because
 * the validator cannot resolve even the draft-7 URL. Also what is committed as schema.json.
 */
export function jsonSchemaFor(
  skill: SkillDefinition<unknown, unknown>,
): object {
  return withoutSchemaKey(
    z.toJSONSchema(skill.output, { target: "draft-7" }),
  ) as object;
}
