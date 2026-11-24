import { createRoute, z } from "@hono/zod-openapi";
import type { Config } from "../config.ts";
import { ApiError } from "../errors.ts";
import type { ResourceGateway } from "../gateway/resource-gateway.ts";
import type { Repos } from "../repos/ports.ts";
import { importCalendar, importSummary } from "../usecases/import-calendar.ts";
import { loadPlanning } from "../usecases/planning.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import {
  calendarDay,
  dateRangeQuery,
  errorResponse,
  isoDate,
  term,
} from "./schemas.ts";

const finding = z.object({
  kind: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  sheetRow: z.number().nullable(),
  date: isoDate.nullable(),
  message: z.string(),
});
const summary = z.object({
  ok: z.boolean(),
  findings: z.array(finding),
  counts: z.object({ W1: z.number(), W2: z.number() }),
  reportIssues: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["report-window", "parents-evening"]),
      label: z.string(),
      field: z.enum(["dataDeadline", "hodReview", "sentHome", "date"]),
      raw: z.string(),
    }),
  ),
  importedAt: z.string().nullable(),
});
const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

const postImport = createRoute({
  method: "post",
  path: "/api/calendar/import",
  ...guard("report-calendar", "edit"),
  responses: {
    200: { description: "What the import found", content: json(summary) },
    422: errorResponse("No workbook, or more than one"),
  },
});
const getImport = createRoute({
  method: "get",
  path: "/api/calendar/import",
  responses: {
    200: {
      description: "The latest import, or null",
      content: json(summary.nullable()),
    },
  },
});
const getDays = createRoute({
  method: "get",
  path: "/api/calendar/days",
  request: { query: dateRangeQuery },
  responses: {
    200: {
      description: "Calendar days, by date",
      content: json(z.array(calendarDay)),
    },
  },
});
const getTerms = createRoute({
  method: "get",
  path: "/api/terms",
  responses: {
    200: { description: "The three terms", content: json(z.array(term)) },
  },
});
const putTerms = createRoute({
  method: "put",
  path: "/api/terms",
  ...guard("lesson-plans", "edit"),
  request: {
    body: { content: json(z.array(term)), required: true },
  },
  responses: {
    200: { description: "The saved terms", content: json(z.array(term)) },
    422: errorResponse("A term runs backwards, or terms overlap"),
  },
});

const putWindowDate = createRoute({
  method: "put",
  path: "/api/reports/windows/{id}/date",
  ...guard("report-calendar", "edit"),
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: json(
        z.object({
          field: z.enum(["dataDeadline", "hodReview", "sentHome"]),
          date: isoDate,
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: { description: "The import summary", content: json(summary) },
    404: errorResponse("There is no such report window"),
    422: errorResponse("The date is not a real date"),
  },
});
const putEveningDate = createRoute({
  method: "put",
  path: "/api/reports/evenings/{id}/date",
  ...guard("report-calendar", "edit"),
  request: {
    params: z.object({ id: z.string() }),
    body: { content: json(z.object({ date: isoDate })), required: true },
  },
  responses: {
    200: { description: "The import summary", content: json(summary) },
    404: errorResponse("There is no such parents' evening"),
    422: errorResponse("The date is not a real date"),
  },
});

const byFirstDay = (
  a: { firstPupilDay: string },
  b: { firstPupilDay: string },
) =>
  a.firstPupilDay < b.firstPupilDay
    ? -1
    : a.firstPupilDay > b.firstPupilDay
      ? 1
      : 0;

function summaryOrThrow(repos: Repos) {
  const s = importSummary(repos);
  if (s === null)
    throw new ApiError(404, "no-import", "The calendar has not been imported.");
  return s;
}

export function calendarRoutes(deps: {
  config: Config;
  repos: Repos;
  gateway: ResourceGateway;
  now: () => Date;
}) {
  const { repos, gateway, now } = deps;
  return createRouter()
    .openapi(postImport, async (c) =>
      c.json(await importCalendar({ gateway, repos, now }), 200),
    )
    .openapi(getImport, (c) => c.json(importSummary(repos), 200))
    .openapi(putWindowDate, (c) => {
      const { id } = c.req.valid("param");
      const { field, date } = c.req.valid("json");
      if (!repos.calendar.setWindowDate(id, field, date))
        throw new ApiError(
          404,
          "no-such-report",
          `There is no report window "${id}".`,
        );
      return c.json(summaryOrThrow(repos), 200);
    })
    .openapi(putEveningDate, (c) => {
      const { id } = c.req.valid("param");
      const { date } = c.req.valid("json");
      if (!repos.calendar.setEveningDate(id, date))
        throw new ApiError(
          404,
          "no-such-report",
          `There is no parents' evening "${id}".`,
        );
      return c.json(summaryOrThrow(repos), 200);
    })
    .openapi(getDays, (c) => {
      const { from, to } = c.req.valid("query");
      const days = loadPlanning(repos).days.filter(
        (d) =>
          (from === undefined || d.date >= from) &&
          (to === undefined || d.date <= to),
      );
      return c.json(days, 200);
    })
    .openapi(getTerms, (c) => c.json(repos.settings.terms(), 200))
    .openapi(putTerms, (c) => {
      const terms = [...c.req.valid("json")].sort(byFirstDay);
      const problems: string[] = [];
      const ids = new Set(terms.map((t) => t.id));
      if (terms.length !== 3 || ids.size !== 3)
        problems.push("There must be exactly three terms: T1, T2 and T3.");
      for (const t of terms)
        if (t.firstPupilDay > t.lastPupilDay)
          problems.push(
            `${t.id} starts on ${t.firstPupilDay}, after it ends on ${t.lastPupilDay}.`,
          );
      terms.forEach((t, i) => {
        const next = terms[i + 1];
        if (next && t.lastPupilDay >= next.firstPupilDay)
          problems.push(`${t.id} and ${next.id} overlap.`);
      });
      if (problems.length > 0)
        throw new ApiError(
          422,
          "invalid-terms",
          "These terms cannot be saved. Nothing was changed.",
          problems.sort(),
        );
      repos.settings.saveTerms(terms);
      return c.json(repos.settings.terms(), 200);
    });
}
