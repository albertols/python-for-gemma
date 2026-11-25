import { createRoute, z } from "@hono/zod-openapi";
import { fitFor } from "@planner/domain";
import type { Config } from "../config.ts";
import type { ResourceGateway } from "../gateway/resource-gateway.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { todayOf } from "../today.ts";
import { importScheme, importSources } from "../usecases/import-scheme.ts";
import { courseOrThrow, loadPlanInputs } from "../usecases/plan-inputs.ts";
import { saveScheme } from "../usecases/scheme.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { errorResponse, groupOverride, isoDate, sowItem } from "./schemas.ts";

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

const importSourcesRoute = createRoute({
  method: "get",
  path: "/api/scheme/{courseId}/import-sources",
  request: { params },
  responses: {
    200: {
      description:
        "The planning sheets (.xlsx) and assessment schedules (.docx) she can import for this course, from its board's Planning folder",
      content: json(
        z.object({
          planning: z.array(z.string()),
          schedules: z.array(z.string()),
        }),
      ),
    },
    404: errorResponse("There is no such course"),
  },
});
const importRoute = createRoute({
  method: "post",
  path: "/api/scheme/{courseId}/import",
  ...guard("scheme-of-work", "edit"),
  request: {
    params,
    body: {
      content: json(
        z.object({
          planningFile: z.string().min(1),
          scheduleFile: z.string().min(1).nullable(),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: {
      description:
        "A preview, nothing stored: the items the files make, what they raise, and what would change in the stored scheme",
      content: json(
        z.object({
          items: z.array(sowItem),
          findings: z.array(
            z.object({
              kind: z.string(),
              severity: z.enum(["error", "warning", "info"]),
              sheetRow: z.number().nullable(),
              date: isoDate.nullable(),
              message: z.string(),
            }),
          ),
          changes: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              change: z.enum(["added", "removed", "changed"]),
            }),
          ),
        }),
      ),
    },
    404: errorResponse("There is no such course"),
    409: errorResponse("The pack is not locked yet"),
    422: errorResponse(
      "The file is not one of the planning files, or cannot be read as one",
    ),
  },
});

export function schemeRoutes(deps: {
  config: Config;
  gateway: ResourceGateway;
  repos: Repos;
  packs: PackStore;
  now: () => Date;
}) {
  const { config, gateway, repos, packs, now } = deps;
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
    .openapi(importSourcesRoute, async (c) => {
      const { courseId } = c.req.valid("param");
      return c.json(await importSources(gateway, repos, courseId), 200);
    })
    .openapi(importRoute, async (c) => {
      const { courseId } = c.req.valid("param");
      return c.json(
        await importScheme(
          { repos, packs, gateway },
          courseId,
          c.req.valid("json"),
          todayOf(config, now()),
        ),
        200,
      );
    })
    .openapi(put, (c) => {
      const { items, overrides } = c.req.valid("json");
      saveScheme(repos, packs, c.req.valid("param").courseId, items, overrides);
      return c.json({ ok: true as const }, 200);
    });
}
