import { createRoute, z } from "@hono/zod-openapi";
import type { Repos } from "../repos/ports.ts";
import {
  listEvents,
  listStale,
  removeClassification,
  saveClassification,
} from "../usecases/calendar-events.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import {
  errorResponse,
  eventCandidate,
  eventClassification,
  eventClassificationInput,
  isoDate,
} from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ id: z.string() });

const list = createRoute({
  method: "get",
  path: "/api/events",
  responses: {
    200: {
      description:
        "Each calendar event she could confirm, with its pre-sort (a suggestion only), her confirmations and the lessons it would hit",
      content: json(
        z.array(
          eventCandidate.extend({
            classifications: z.array(eventClassification),
            lessons: z.number(),
          }),
        ),
      ),
    },
  },
});
const stale = createRoute({
  method: "get",
  path: "/api/events/stale",
  responses: {
    200: {
      description:
        "Confirmations the calendar no longer matches: the wording changed, or a date went",
      content: json(
        z.array(
          z.object({
            classification: eventClassification,
            candidateGone: z.boolean(),
            missingDates: z.array(isoDate),
          }),
        ),
      ),
    },
  },
});
const put = createRoute({
  method: "put",
  path: "/api/events/classifications/{id}",
  ...guard("report-calendar", "edit"),
  request: {
    params,
    body: { content: json(eventClassificationInput), required: true },
  },
  responses: {
    200: {
      description: "The stored confirmation",
      content: json(eventClassification),
    },
    409: errorResponse(
      "Another confirmation of this event covers one of the dates",
    ),
    422: errorResponse(
      "The event, dates, groups, periods or end date make no sense",
    ),
  },
});
const remove = createRoute({
  method: "delete",
  path: "/api/events/classifications/{id}",
  ...guard("report-calendar", "edit"),
  request: { params },
  responses: {
    200: {
      description: "Undone",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no such confirmation"),
  },
});

export function eventRoutes(deps: { repos: Repos; now: () => Date }) {
  const { repos, now } = deps;
  return createRouter()
    .openapi(list, (c) => c.json(listEvents(repos), 200))
    .openapi(stale, (c) => c.json(listStale(repos), 200))
    .openapi(put, (c) =>
      c.json(
        saveClassification(
          repos,
          c.req.valid("param").id,
          c.req.valid("json"),
          now(),
        ),
        200,
      ),
    )
    .openapi(remove, (c) => {
      removeClassification(repos, c.req.valid("param").id);
      return c.json({ ok: true as const }, 200);
    });
}
