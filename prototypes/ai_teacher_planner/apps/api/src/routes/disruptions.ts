import { createRoute, z } from "@hono/zod-openapi";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";
import {
  createDisruption,
  previewDisruption,
} from "../usecases/disruptions.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import {
  disruptionInput,
  errorResponse,
  isoDate,
  period,
  storedDisruption,
} from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const body = { content: json(disruptionInput), required: true } as const;

const list = createRoute({
  method: "get",
  path: "/api/disruptions",
  responses: {
    200: {
      description: "Every lesson cancellation, by first day then id",
      content: json(z.array(storedDisruption)),
    },
  },
});
const preview = createRoute({
  method: "post",
  path: "/api/disruptions/preview",
  ...guard("report-calendar", "edit"),
  request: { body },
  responses: {
    200: {
      description: "The lessons that would be cancelled. Nothing is stored",
      content: json(
        z.object({
          hits: z.array(
            z.object({ groupId: z.string(), date: isoDate, period }),
          ),
        }),
      ),
    },
    422: errorResponse("The scope, dates or periods make no sense"),
  },
});
const create = createRoute({
  method: "post",
  path: "/api/disruptions",
  ...guard("report-calendar", "edit"),
  request: { body },
  responses: {
    201: {
      description: "The stored rows, one per group for a group cancellation",
      content: json(z.array(storedDisruption)),
    },
    422: errorResponse(
      "A backwards range, a bad reason, or no lesson in the dates",
    ),
  },
});
const remove = createRoute({
  method: "delete",
  path: "/api/disruptions/batch/{batchId}",
  ...guard("report-calendar", "edit"),
  request: { params: z.object({ batchId: z.string() }) },
  responses: {
    200: {
      description: "How many rows were removed",
      content: json(z.object({ removed: z.number() })),
    },
    404: errorResponse("There is no such cancellation"),
  },
});

export function disruptionRoutes(deps: { repos: Repos; now: () => Date }) {
  const { repos, now } = deps;
  return createRouter()
    .openapi(list, (c) => c.json(repos.disruptions.list(), 200))
    .openapi(preview, (c) =>
      c.json({ hits: previewDisruption(repos, c.req.valid("json")) }, 200),
    )
    .openapi(create, (c) =>
      c.json(createDisruption(repos, c.req.valid("json"), now()), 201),
    )
    .openapi(remove, (c) => {
      const removed = repos.disruptions.removeBatch(
        c.req.valid("param").batchId,
      );
      if (removed === 0)
        throw new ApiError(
          404,
          "no-such-batch",
          "There is no such cancellation to remove.",
        );
      return c.json({ removed }, 200);
    });
}
