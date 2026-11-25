import { z } from "zod";
import type { SkillDefinition } from "../registry.ts";

/** What the model hands back. The planner turns it into a CurriculumPack (see draftPack). */
const output = z.object({
  units: z.array(
    z.object({
      id: z.string().min(1),
      code: z.string(),
      title: z.string(),
      inScope: z.boolean(),
    }),
  ),
  specPoints: z.array(
    z.object({
      id: z.string().min(1),
      unitId: z.string().min(1),
      code: z.string(),
      title: z.string(),
      level: z.enum(["core", "hl-only"]),
      page: z.number().int().positive(),
    }),
  ),
  chapters: z.array(
    z.object({
      /** One of the chapter numbers she gave. */
      number: z.string(),
      /** The unit its linked points sit in; null when it has no link. */
      unitId: z.string().nullable(),
      links: z.array(
        z.object({
          specPointId: z.string().min(1),
          /** One sentence quoting the words that make the match. */
          reason: z.string().min(1),
        }),
      ),
    }),
  ),
  /** Anything the model could not decide, for her review screen: a chapter number or a spec code, and why. */
  unsure: z.array(z.object({ about: z.string(), note: z.string() })),
});

export type BuildCurriculumPackOutput = z.infer<typeof output>;

const input = z.object({
  courseId: z.string().min(1),
  board: z.string(),
  unitsInScope: z.array(z.string()),
  chapters: z.array(z.object({ number: z.string(), title: z.string() })),
  pages: z.array(
    z.object({ number: z.number().int().positive(), text: z.string() }),
  ),
  /** Set on the one repair attempt: the problems found in the previous answer. */
  repair: z
    .object({ problems: z.array(z.string()), previous: output })
    .optional(),
});

export type BuildCurriculumPackInput = z.infer<typeof input>;

export const buildCurriculumPack: SkillDefinition<
  BuildCurriculumPackInput,
  BuildCurriculumPackOutput
> = {
  id: "planner-build-curriculum-pack",
  input,
  output,
  tools: [],
  model: "sonnet",
  promptPath: ".claude/skills/planner-build-curriculum-pack/SKILL.md",
};
