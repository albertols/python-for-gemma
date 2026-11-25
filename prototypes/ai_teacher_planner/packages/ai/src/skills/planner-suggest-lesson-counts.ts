import { z } from "zod";
import type { SkillDefinition } from "../registry.ts";

const input = z.object({
  courseTitle: z.string(),
  mode: z.enum(["differences", "split"]),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      lessons: z.number().int().min(0).nullable(),
    }),
  ),
  unitTotals: z.array(
    z.object({ unitId: z.string(), lessons: z.number().int().min(0) }),
  ),
});

const output = z.object({
  suggestions: z.array(
    z.object({
      itemId: z.string(),
      lessons: z.number().int().min(0),
      reason: z.string(),
      tricky: z.boolean(),
    }),
  ),
});

export type SuggestLessonCountsInput = z.infer<typeof input>;
export type SuggestLessonCountsOutput = z.infer<typeof output>;

export const suggestLessonCounts: SkillDefinition<
  SuggestLessonCountsInput,
  SuggestLessonCountsOutput
> = {
  id: "planner-suggest-lesson-counts",
  input,
  output,
  tools: [],
  model: "sonnet",
  promptPath: ".claude/skills/planner-suggest-lesson-counts/SKILL.md",
};
