import { createRoute, z } from "@hono/zod-openapi";
import type { Config } from "../config.ts";
import { ApiError } from "../errors.ts";
import type { ResourceGateway } from "../gateway/resource-gateway.ts";
import type { Repos } from "../repos/ports.ts";
import {
  removeLabelCorrection,
  removeResolution,
  setLabelCorrection,
  setResolution,
} from "../usecases/corrections.ts";
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
  weekLabel,
} from "./schemas.ts";

const finding = z.object({
  kind: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  sheetRow: z.number().nullable(),
  date: isoDate.nullable(),
  message: z.string(),
});
const resolution = z.object({
  date: isoDate,
  decision: z.enum(["teaching-day", "no-lessons"]),
  reason: z.string().nullable(),
});
const labelCorrection = z.object({
  date: isoDate,
  weekLabel: weekLabel,
  note: z.string().nullable(),
});
const summary = z.object({
  ok: z.boolean(),
  /** What she still has to look at. */
  shown: z.array(finding),
  /** Notes on weekends or outside every term, not needed for planning. */
  outsideYear: z.array(finding),
  resolved: z.array(z.object({ finding, resolution })),
  staleCorrections: z.array(
    z.object({ type: z.enum(["label", "resolution"]), date: isoDate }),
  ),
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

const dateParam = z.object({ date: isoDate });
const corrections = z.object({
  labels: z.array(labelCorrection),
  resolutions: z.array(resolution),
});
const getCorrections = createRoute({
  method: "get",
  path: "/api/calendar/corrections",
  responses: {
    200: {
      description: "Her label corrections and her decisions on import notes",
      content: json(corrections),
    },
  },
});
const putLabel = createRoute({
  method: "put",
  path: "/api/calendar/corrections/labels/{date}",
  ...guard("report-calendar", "edit"),
  request: {
    params: dateParam,
    body: {
      content: json(
        z.object({ weekLabel, note: z.string().nullable().default(null) }),
      ),
      required: true,
    },
  },
  responses: {
    200: {
      description: "The stored correction",
      content: json(labelCorrection),
    },
    422: errorResponse("Not a weekday in term, or the note is too long"),
  },
});
const deleteLabel = createRoute({
  method: "delete",
  path: "/api/calendar/corrections/labels/{date}",
  ...guard("report-calendar", "edit"),
  request: { params: dateParam },
  responses: {
    200: {
      description: "Removed",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no correction on that date"),
  },
});
const putResolution = createRoute({
  method: "put",
  path: "/api/calendar/corrections/resolutions/{date}",
  ...guard("report-calendar", "edit"),
  request: {
    params: dateParam,
    body: {
      content: json(
        z.object({
          decision: z.enum(["teaching-day", "no-lessons"]),
          reason: z.string().nullable().default(null),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: { description: "The stored decision", content: json(resolution) },
    422: errorResponse(
      "There is nothing to settle on that date, or the reason is too long",
    ),
  },
});
const deleteResolution = createRoute({
  method: "delete",
  path: "/api/calendar/corrections/resolutions/{date}",
  ...guard("report-calendar", "edit"),
  request: { params: dateParam },
  responses: {
    200: {
      description: "Removed, and the lessons are back",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no decision on that date"),
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
    .openapi(getCorrections, (c) =>
      c.json(
        {
          labels: repos.corrections.labels(),
          resolutions: repos.corrections.resolutions(),
        },
        200,
      ),
    )
    .openapi(putLabel, (c) => {
      const { date } = c.req.valid("param");
      const { weekLabel, note } = c.req.valid("json");
      return c.json(
        setLabelCorrection(repos, { date, weekLabel, note }, now()),
        200,
      );
    })
    .openapi(deleteLabel, (c) => {
      removeLabelCorrection(repos, c.req.valid("param").date);
      return c.json({ ok: true as const }, 200);
    })
    .openapi(putResolution, (c) => {
      const { date } = c.req.valid("param");
      const { decision, reason } = c.req.valid("json");
      return c.json(
        setResolution(repos, { date, decision, reason }, now()),
        200,
      );
    })
    .openapi(deleteResolution, (c) => {
      removeResolution(repos, c.req.valid("param").date);
      return c.json({ ok: true as const }, 200);
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
