// Writes .claude/skills/<id>/schema.json for every registered skill, from its Zod output.
// Run with `pnpm ai:schemas`. A test fails when a committed schema.json is stale.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  jsonSchemaFor,
  PENDING_SKILL_TEXT,
  repoRoot,
  type SkillDefinition,
  skills,
} from "../src/registry.ts";

for (const skill of Object.values(skills) as SkillDefinition<
  unknown,
  unknown
>[]) {
  if (PENDING_SKILL_TEXT.includes(skill.id)) {
    console.log(`skipped ${skill.id} (SKILL.md not written yet)`);
    continue;
  }
  const file = resolve(repoRoot(), dirname(skill.promptPath), "schema.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(jsonSchemaFor(skill), null, 2)}\n`);
  console.log(`wrote ${file}`);
}
