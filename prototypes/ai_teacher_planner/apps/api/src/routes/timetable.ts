import { createRoute, z } from "@hono/zod-openapi";
import { validateTimetable } from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import {
  dutyEntry,
  errorResponse,
  group,
  isoDate,
  timetableEntry,
  timetableVersion,
} from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

const getTimetable = createRoute({
  method: "get",
  path: "/api/timetable",
  responses: {
    200: {
      description: "Every timetable version and her groups",
      content: json(
        z.object({
          versions: z.array(timetableVersion),
          groups: z.array(group),
        }),
      ),
    },
  },
});
const putVersion = createRoute({
  method: "put",
  path: "/api/timetable/{id}",
  ...guard("lesson-plans", "edit"),
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: json(
        z.object({
          entries: z.array(timetableEntry),
          duties: z.array(dutyEntry),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: { description: "The saved version", content: json(timetableVersion) },
    404: errorResponse("There is no such version"),
    422: errorResponse("The grid has problems; nothing was saved"),
  },
});
const postVersion = createRoute({
  method: "post",
  path: "/api/timetable/versions",
  ...guard("lesson-plans", "edit"),
  request: {
    body: {
      content: json(z.object({ validFrom: isoDate, copyOf: z.string() })),
      required: true,
    },
  },
  responses: {
    201: { description: "The new version", content: json(timetableVersion) },
    404: errorResponse("There is no version to copy"),
    422: errorResponse("A version already starts on that date"),
  },
});

export function timetableRoutes(deps: { repos: Repos }) {
  const { repos } = deps;
  return (
    createRouter()
      .openapi(getTimetable, (c) =>
        c.json(
          {
            versions: repos.timetable.versions(),
            groups: repos.timetable.groups(),
          },
          200,
        ),
      )
      // POST and PUT never share a path, so the order of these two does not matter.
      .openapi(postVersion, (c) => {
        const { validFrom, copyOf } = c.req.valid("json");
        const versions = repos.timetable.versions();
        const source = versions.find((v) => v.id === copyOf);
        if (!source)
          throw new ApiError(
            404,
            "no-such-version",
            `There is no timetable version "${copyOf}" to copy.`,
          );
        if (versions.some((v) => v.validFrom === validFrom))
          throw new ApiError(
            422,
            "version-date-taken",
            `A timetable version already starts on ${validFrom}. Choose another date.`,
          );
        const created = { ...source, id: `from-${validFrom}`, validFrom };
        repos.timetable.saveVersion(created);
        return c.json(created, 201);
      })
      .openapi(putVersion, (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const current = repos.timetable.versions().find((v) => v.id === id);
        if (!current)
          throw new ApiError(
            404,
            "no-such-version",
            `There is no timetable version "${id}".`,
          );
        const next = { ...current, entries: body.entries, duties: body.duties };
        const problems = validateTimetable(next, repos.timetable.groups());
        if (problems.length > 0)
          throw new ApiError(
            422,
            "invalid-timetable",
            "This timetable has problems. Nothing was saved.",
            problems,
          );
        repos.timetable.saveVersion(next);
        return c.json(next, 200);
      })
  );
}
