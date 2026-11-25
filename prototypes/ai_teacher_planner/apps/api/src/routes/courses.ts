import { createRoute, z } from "@hono/zod-openapi";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { packState } from "../usecases/packs.ts";
import { courseOrThrow, groupsOf } from "../usecases/plan-inputs.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { course, errorResponse, group } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ courseId: z.string() });

const list = createRoute({
  method: "get",
  path: "/api/courses",
  responses: {
    200: {
      description:
        "Her courses by id, each with its groups, its pack's state and whether it has a plan",
      content: json(
        z.array(
          course.extend({
            groups: z.array(group),
            pack: z.enum(["none", "draft", "locked"]),
            hasPlan: z.boolean(),
          }),
        ),
      ),
    },
  },
});
const put = createRoute({
  method: "put",
  path: "/api/courses/{courseId}",
  ...guard("scheme-of-work", "edit"),
  request: {
    params,
    body: {
      content: json(
        z.object({
          revisionWeeks: z.number().int().nonnegative().openapi({
            description:
              "Weeks of revision before the official exam; 0 turns it off",
          }),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: { description: "The stored course", content: json(course) },
    404: errorResponse("There is no such course"),
    422: errorResponse("Not a whole number of weeks, 0 or more"),
  },
});

export function courseRoutes(deps: { repos: Repos; packs: PackStore }) {
  const { repos, packs } = deps;
  return createRouter()
    .openapi(list, (c) =>
      c.json(
        repos.courses.list().map((x) => ({
          ...x,
          groups: groupsOf(repos, x.id),
          pack: packState(packs, x.id),
          hasPlan: repos.plans.head(x.id) !== null,
        })),
        200,
      ),
    )
    .openapi(put, (c) => {
      const { courseId } = c.req.valid("param");
      courseOrThrow(repos, courseId);
      if (
        !repos.courses.setRevisionWeeks(
          courseId,
          c.req.valid("json").revisionWeeks,
        )
      )
        throw new ApiError(404, "not-found", "There is no such course.");
      return c.json(courseOrThrow(repos, courseId), 200);
    });
}
