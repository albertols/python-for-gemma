import { createRoute, z } from "@hono/zod-openapi";
import { LOG_NOTE_LIMIT } from "@planner/domain";
import type { Config } from "../config.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { todayOf } from "../today.ts";
import { checkInWeeks, recordCheckIn } from "../usecases/check-in.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { errorResponse, isoDate } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

const lesson = z.object({
  courseId: z.string(),
  groupId: z.string(),
  lessonId: z.string(),
  slotKey: z.string(),
  date: isoDate,
  title: z.string(),
  index: z.number().int().nullable(),
  of: z.number().int().nullable(),
});
const list = createRoute({
  method: "get",
  path: "/api/checkin",
  responses: {
    200: {
      description:
        "Past lessons assumed to have happened as planned and not confirmed yet, one section per week (the Monday), oldest first",
      content: json(
        z.object({
          weeks: z.array(
            z.object({ weekOf: isoDate, lessons: z.array(lesson) }),
          ),
        }),
      ),
    },
  },
});
const record = createRoute({
  method: "post",
  path: "/api/checkin",
  ...guard("lesson-plans", "edit"),
  request: {
    body: {
      content: json(
        z.object({
          entries: z
            .array(
              z.object({
                groupId: z.string(),
                lessonId: z.string(),
                outcome: z.enum(["taught", "cover", "skipped", "homework"]),
                note: z
                  .string()
                  .nullable()
                  .openapi({
                    description: `Her words, at most ${LOG_NOTE_LIMIT} characters. No student names.`,
                  }),
              }),
            )
            .min(1),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: {
      description:
        "Written to the lesson log; the courses of these lessons whose plan is no longer up to date",
      content: json(
        z.object({
          written: z.number().int(),
          outOfDate: z.array(z.string()),
        }),
      ),
    },
    422: errorResponse(
      "A lesson that is not waiting for her answer, or a note that is too long; nothing is written",
    ),
  },
});

export function checkInRoutes(deps: {
  config: Config;
  repos: Repos;
  packs: PackStore;
  now: () => Date;
}) {
  const { config, repos, packs, now } = deps;
  const today = () => todayOf(config, now());
  return createRouter()
    .openapi(list, (c) =>
      c.json({ weeks: checkInWeeks(repos, packs, today()) }, 200),
    )
    .openapi(record, (c) =>
      c.json(
        recordCheckIn(repos, packs, today(), c.req.valid("json").entries),
        200,
      ),
    );
}
