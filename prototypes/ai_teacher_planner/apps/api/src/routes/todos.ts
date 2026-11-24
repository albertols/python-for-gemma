import { createRoute, z } from "@hono/zod-openapi";
import type { Repos } from "../repos/ports.ts";
import {
  createTodo,
  listTodos,
  removeTodo,
  updateTodo,
} from "../usecases/todos.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import {
  errorResponse,
  isoDate,
  todoInput,
  todoLists,
  todoNote,
  todoPatch,
} from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ id: z.string() });

const list = createRoute({
  method: "get",
  path: "/api/todos",
  request: { query: z.object({ date: isoDate }) },
  responses: {
    200: {
      description:
        "That day's notes, that week's notes, and undone notes from earlier days or weeks",
      content: json(todoLists),
    },
  },
});
const create = createRoute({
  method: "post",
  path: "/api/todos",
  ...guard("lesson-plans", "edit"),
  request: { body: { content: json(todoInput), required: true } },
  responses: {
    201: { description: "The stored note", content: json(todoNote) },
    422: errorResponse(
      "The text is empty or over 200 characters, or the date is wrong",
    ),
  },
});
const patch = createRoute({
  method: "patch",
  path: "/api/todos/{id}",
  ...guard("lesson-plans", "edit"),
  request: { params, body: { content: json(todoPatch), required: true } },
  responses: {
    200: { description: "The changed note", content: json(todoNote) },
    404: errorResponse("There is no such note"),
    422: errorResponse(
      "The text is empty or over 200 characters, or nothing to change",
    ),
  },
});
const remove = createRoute({
  method: "delete",
  path: "/api/todos/{id}",
  ...guard("lesson-plans", "edit"),
  request: { params },
  responses: {
    200: {
      description: "Removed",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no such note"),
  },
});

export function todoRoutes(deps: { repos: Repos; now: () => Date }) {
  const { repos, now } = deps;
  return createRouter()
    .openapi(list, (c) =>
      c.json(listTodos(repos, c.req.valid("query").date), 200),
    )
    .openapi(create, (c) =>
      c.json(createTodo(repos, c.req.valid("json"), now()), 201),
    )
    .openapi(patch, (c) =>
      c.json(
        updateTodo(repos, c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
    )
    .openapi(remove, (c) => {
      removeTodo(repos, c.req.valid("param").id);
      return c.json({ ok: true as const }, 200);
    });
}
