import { createRoute, z } from "@hono/zod-openapi";
import { fitFor } from "@planner/domain";
import type { Config } from "../config.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { todayOf } from "../today.ts";
import { courseOrThrow, loadPlanInputs } from "../usecases/plan-inputs.ts";
import { saveScheme } from "../usecases/scheme.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { errorResponse, groupOverride, sowItem } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ courseId: z.string() });
const fit = z.object({
  lessonsLeft: z.number().int(),
  fits: z.boolean(),
  over: z.number().int(),
});

const get = createRoute({
  method: "get",
  path: "/api/scheme/{courseId}",
  request: { params },
  responses: {
    200: {
      description:
        "The scheme, and per group whether it fits (fitFor): the lessons left and the slots left. Empty per group until the pack is locked",
      content: json(
        z.object({
          items: z.array(sowItem),
          overrides: z.array(groupOverride),
          totals: z.record(z.string(), fit),
          slotsLeft: z.record(z.string(), z.number().int()),
        }),
      ),
    },
    404: errorResponse("There is no such course"),
  },
});
const put = createRoute({
  method: "put",
  path: "/api/scheme/{courseId}",
  ...guard("scheme-of-work", "edit"),
  request: {
    params,
    body: {
      content: json(
        z.object({
          items: z.array(sowItem),
          overrides: z.array(groupOverride),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: {
      description: "Stored",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no such course"),
    409: errorResponse("The pack is not locked yet"),
    422: errorResponse(
      "The items or the group counts make no sense, one sentence each",
    ),
  },
});

export function schemeRoutes(deps: {
  config: Config;
  repos: Repos;
  packs: PackStore;
  now: () => Date;
}) {
  const { config, repos, packs, now } = deps;
  return createRouter()
    .openapi(get, (c) => {
      const { courseId } = c.req.valid("param");
      courseOrThrow(repos, courseId);
      const totals: Record<string, z.infer<typeof fit>> = {};
      const slotsLeft: Record<string, number> = {};
      if (packs.locked(courseId) !== null)
        for (const f of fitFor(
          loadPlanInputs(repos, packs, courseId, todayOf(config, now())),
        )) {
          totals[f.groupId] = {
            lessonsLeft: f.lessonsLeft,
            fits: f.fits,
            over: f.over,
          };
          slotsLeft[f.groupId] = f.slotsLeft;
        }
      return c.json(
        {
          items: repos.scheme.items(courseId),
          overrides: repos.scheme.overrides(courseId),
          totals,
          slotsLeft,
        },
        200,
      );
    })
    .openapi(put, (c) => {
      const { items, overrides } = c.req.valid("json");
      saveScheme(repos, packs, c.req.valid("param").courseId, items, overrides);
      return c.json({ ok: true as const }, 200);
    });
}
