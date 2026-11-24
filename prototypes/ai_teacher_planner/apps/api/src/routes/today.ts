import { createRoute, z } from "@hono/zod-openapi";
import type { Config } from "../config.ts";
import type { Repos } from "../repos/ports.ts";
import { todayOf } from "../today.ts";
import { todayView } from "../usecases/today-view.ts";
import { createRouter } from "./router.ts";
import { isoDate, reminder, slot, weekLabel } from "./schemas.ts";

const getToday = createRoute({
  method: "get",
  path: "/api/today",
  responses: {
    200: {
      description: "Today's lessons, the next teaching day and reminders",
      content: {
        "application/json": {
          schema: z.object({
            date: isoDate,
            kind: z.enum([
              "pupil",
              "weekend",
              "outside-term",
              "unlabelled",
              "no-calendar",
            ]),
            weekLabel: weekLabel.nullable(),
            lessons: z.array(
              z.object({ slot, start: z.string(), end: z.string() }),
            ),
            nextTeachingDay: isoDate.nullable(),
            reminders: z.array(reminder),
          }),
        },
      },
    },
  },
});

export function todayRoutes(deps: {
  config: Config;
  repos: Repos;
  now: () => Date;
}) {
  return createRouter().openapi(getToday, (c) =>
    c.json(todayView(deps.repos, todayOf(deps.config, deps.now())), 200),
  );
}
