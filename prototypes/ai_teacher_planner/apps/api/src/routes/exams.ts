import { createRoute, z } from "@hono/zod-openapi";
import type { Repos } from "../repos/ports.ts";
import { createExam, removeExam, updateExam } from "../usecases/exams.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { errorResponse, exam, examInput } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ id: z.string() });
const body = { content: json(examInput), required: true } as const;

const list = createRoute({
  method: "get",
  path: "/api/exams",
  responses: {
    200: {
      description: "Her official exams, by date then code",
      content: json(z.array(exam)),
    },
  },
});
const create = createRoute({
  method: "post",
  path: "/api/exams",
  ...guard("report-calendar", "edit"),
  request: { body },
  responses: {
    201: { description: "The stored exam", content: json(exam) },
    409: errorResponse("Another exam has this code"),
    422: errorResponse("The text, date, length or groups make no sense"),
  },
});
const put = createRoute({
  method: "put",
  path: "/api/exams/{id}",
  ...guard("report-calendar", "edit"),
  request: { params, body },
  responses: {
    200: { description: "The stored exam", content: json(exam) },
    404: errorResponse("There is no such exam"),
    409: errorResponse("Another exam has this code"),
    422: errorResponse("The text, date, length or groups make no sense"),
  },
});
const remove = createRoute({
  method: "delete",
  path: "/api/exams/{id}",
  ...guard("report-calendar", "edit"),
  request: { params },
  responses: {
    200: {
      description: "Removed. It is not added back on a later start",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no such exam"),
  },
});

export function examRoutes(deps: { repos: Repos }) {
  const { repos } = deps;
  return createRouter()
    .openapi(list, (c) => c.json(repos.exams.list(), 200))
    .openapi(create, (c) => c.json(createExam(repos, c.req.valid("json")), 201))
    .openapi(put, (c) =>
      c.json(
        updateExam(repos, c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
    )
    .openapi(remove, (c) => {
      removeExam(repos, c.req.valid("param").id);
      return c.json({ ok: true as const }, 200);
    });
}
