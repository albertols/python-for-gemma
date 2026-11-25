import type { ImportTimetableOutput } from "@planner/ai";
import {
  type DutyEntry,
  type TimetableEntry,
  type TimetableVersion,
  validateTimetable,
} from "@planner/domain";
import { z } from "zod";
import { ApiError } from "../errors.ts";
import {
  type AiRun,
  type ItemHandler,
  type JobContext,
  registerItemHandler,
  startJob,
} from "./ai-jobs.ts";

const SKILL = "planner-import-timetable" as const;

/**
 * Asks Claude to read a picture of her timetable. The picture is a file already stored in
 * data/uploads; the model gets it as an attachment, and the group codes she already has. The
 * version id travels in the input so the item knows which grid it is for; the skill's own
 * input schema drops it before the model sees anything. Nothing changes until she accepts.
 */
export function suggestGridFromPicture(
  ctx: JobContext,
  args: { versionId: string; picturePath: string },
): AiRun {
  return startJob(ctx, {
    skillId: SKILL,
    input: {
      versionId: args.versionId,
      knownGroups: ctx.repos.timetable.groups().map((g) => g.id),
    },
    text: null,
    attachments: [args.picturePath],
  });
}

const cell = {
  week: z.enum(["W1", "W2"]),
  weekday: z.number().int().min(1).max(5),
  period: z.number().int().min(1).max(6),
};
/** What an item holds, and what accepting it writes. An edit is checked against the same shape. */
const gridData = z.object({
  versionId: z.string().min(1),
  entries: z.array(
    z.object({
      ...cell,
      groupId: z.string().min(1),
      room: z.string().nullable(),
    }),
  ),
  duties: z.array(z.object({ ...cell, label: z.string().min(1) })),
  unsure: z.array(z.object({ ...cell, note: z.string() })),
});

const versionOf = (input: unknown) =>
  (input as { versionId?: unknown } | null)?.versionId;

/**
 * The suggested grid is one item. Nothing is made when the picture gave no lesson at all: a
 * grid with nothing in it would empty her timetable when accepted.
 */
export const timetableGridHandler: ItemHandler = {
  kind: "timetable-grid",
  resource: "lesson-plans",
  toItems(output, input) {
    const versionId = versionOf(input);
    if (typeof versionId !== "string") throw new Error("no version");
    const grid = output as ImportTimetableOutput;
    if (grid.entries.length === 0) return [];
    return [
      {
        target: versionId,
        courseId: null,
        data: {
          versionId,
          entries: grid.entries,
          duties: grid.duties,
          unsure: grid.unsure,
        },
      },
    ];
  },
  report(output) {
    return (output as ImportTimetableOutput).entries.length === 0
      ? "No lessons could be read from the picture, so there is nothing to compare."
      : null;
  },
  async apply(item, ctx) {
    const grid = gridData.safeParse(item.data);
    if (!grid.success)
      throw new ApiError(
        422,
        "invalid-grid",
        "This suggested timetable is not in the right shape, so it was not applied.",
      );
    const { repos } = ctx;
    const current = repos.timetable
      .versions()
      .find((v) => v.id === grid.data.versionId);
    if (!current)
      throw new ApiError(
        404,
        "no-such-version",
        "That timetable version is not in the planner any more, so the suggestion was not applied.",
      );
    const next: TimetableVersion = {
      ...current,
      // the days and periods were range-checked by gridData
      entries: grid.data.entries as TimetableEntry[],
      duties: grid.data.duties as DutyEntry[],
    };
    const problems = validateTimetable(next, repos.timetable.groups());
    if (problems.length > 0)
      throw new ApiError(
        422,
        "invalid-timetable",
        "This suggested timetable has problems. Nothing was changed.",
        problems,
      );
    repos.timetable.saveVersion(next);
  },
};

/** Makes this the handler for reviews of timetable suggestions. Called once where the app is built. */
export function registerTimetableGridHandler(): void {
  registerItemHandler(SKILL, timetableGridHandler);
}
