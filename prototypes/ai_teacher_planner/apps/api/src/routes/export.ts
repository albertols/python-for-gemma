import { createRoute, z } from "@hono/zod-openapi";
import { addDays, fortnights, type IsoDate } from "@planner/domain";
import { exportFortnightXlsx, teamsPostText } from "@planner/exporters";
import type { Config } from "../config.ts";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";
import { todayOf } from "../today.ts";
import { exportData } from "../usecases/export-data.ts";
import { loadPlanning } from "../usecases/planning.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { errorResponse, isoDate } from "./schemas.ts";

/** Set on both export responses when something was left out; the body says it too. */
export const WARNING_HEADER = "X-Planner-Warning";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fortnightXlsx = createRoute({
  method: "get",
  path: "/api/export/fortnight.xlsx",
  ...guard("lesson-plans", "view"),
  request: {
    query: z.object({
      w1: isoDate.openapi({
        description:
          "The first Monday of the fortnight (Week 1's, or Week 2's when it has no Week 1)",
      }),
    }),
  },
  responses: {
    200: {
      description: `The fortnight as a workbook. ${WARNING_HEADER} says what was left out, and the warning is also the workbook's description.`,
      content: {
        [XLSX_TYPE]: { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: errorResponse("There is no such fortnight"),
  },
});
const teams = createRoute({
  method: "get",
  path: "/api/export/teams",
  ...guard("lesson-plans", "view"),
  request: {
    query: z.object({
      groupId: z.string().min(1),
      weekOf: isoDate.openapi({ description: "The Monday of the week" }),
    }),
  },
  responses: {
    200: {
      description: `One group's week as plain text for a Teams post. ${WARNING_HEADER} repeats the warning.`,
      content: {
        "application/json": {
          schema: z.object({
            text: z.string(),
            warning: z.string().nullable(),
          }),
        },
      },
    },
    404: errorResponse("There is no such group"),
  },
});

export function exportRoutes(deps: {
  config: Config;
  repos: Repos;
  now: () => Date;
}) {
  const { config, repos, now } = deps;
  return createRouter()
    .openapi(fortnightXlsx, async (c) => {
      const { w1 } = c.req.valid("query");
      const fortnight = fortnights(loadPlanning(repos).days).find(
        (f) => (f.w1 ?? f.w2) === w1,
      );
      if (!fortnight)
        throw new ApiError(
          404,
          "not-found",
          "There is no fortnight starting on that date.",
        );
      const today = todayOf(config, now());
      const data = exportData(repos, {
        from: w1,
        to: addDays((fortnight.w2 ?? fortnight.w1) as IsoDate, 6),
        today,
      });
      if (!data)
        throw new ApiError(404, "not-found", "There is nothing to export.");
      const { file, warning } = await exportFortnightXlsx({
        w1: fortnight.w1,
        w2: fortnight.w2,
        lessons: data.lessons,
        generatedOn: today,
        heldBack: data.heldBack,
      });
      return c.body(file.buffer as ArrayBuffer, 200, {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="fortnight-${w1}.xlsx"`,
        ...(warning ? { [WARNING_HEADER]: warning } : {}),
      });
    })
    .openapi(teams, (c) => {
      const { groupId, weekOf } = c.req.valid("query");
      const data = exportData(repos, {
        from: weekOf,
        to: addDays(weekOf, 6),
        today: todayOf(config, now()),
        groupId,
      });
      if (!data)
        throw new ApiError(404, "not-found", "There is no such group.");
      const post = teamsPostText({
        groupId,
        weekOf,
        lessons: data.lessons,
        heldBack: data.heldBack,
      });
      if (post.warning) c.header(WARNING_HEADER, post.warning);
      return c.json(post, 200);
    });
}
