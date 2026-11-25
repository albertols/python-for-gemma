import { z } from "zod";
import type { SkillDefinition } from "../registry.ts";

/** The picture is not part of the input: it travels as an attachment. The version id travels with it and is dropped here. */
const input = z.object({
  /** The group codes her planner already has, so the model can match what it reads. It must still copy codes as written. */
  knownGroups: z.array(z.string()),
});

const week = z.enum(["W1", "W2"]);
const weekday = z.number().int().min(1).max(5);
const period = z.number().int().min(1).max(6);

const output = z.object({
  entries: z.array(
    z.object({
      week,
      weekday,
      period,
      groupId: z.string().min(1),
      room: z.string().nullable(),
    }),
  ),
  duties: z.array(
    z.object({
      week,
      weekday,
      period,
      label: z.string().min(1),
    }),
  ),
  /** Cells the model could not read. They are left out of `entries` and `duties`, and she is told. */
  unsure: z.array(
    z.object({
      week,
      weekday,
      period,
      note: z.string(),
    }),
  ),
});

export type ImportTimetableInput = z.infer<typeof input>;
export type ImportTimetableOutput = z.infer<typeof output>;

export const importTimetable: SkillDefinition<
  ImportTimetableInput,
  ImportTimetableOutput
> = {
  id: "planner-import-timetable",
  input,
  output,
  tools: [],
  model: "sonnet",
  promptPath: ".claude/skills/planner-import-timetable/SKILL.md",
};
