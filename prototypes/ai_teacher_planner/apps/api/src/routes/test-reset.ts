import { createRoute, z } from "@hono/zod-openapi";
import type { Database } from "../db/connection.ts";
import type { Repos } from "../repos/ports.ts";
import { resetToSeed } from "../usecases/reset-to-seed.ts";
import { createRouter } from "./router.ts";

const reset = createRoute({
  method: "post",
  path: "/api/test/reset",
  responses: {
    403: {
      description: "The x-planner-test header is missing",
      content: {
        "application/json": {
          schema: z.object({
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    200: {
      description: "The database is empty and seeded again",
      content: {
        "application/json": { schema: z.object({ ok: z.literal(true) }) },
      },
    },
  },
});

/** Mounted only when PLANNER_TEST_ROUTES=1, so the browser tests start every scenario from the seed. */
export function testRoutes(deps: {
  db: Database;
  repos: Repos;
  now: () => Date;
}) {
  return createRouter().openapi(reset, async (c) => {
    // A custom header cannot be set by a cross-site form post.
    if (c.req.header("x-planner-test") !== "1")
      return c.json(
        {
          error: {
            code: "forbidden",
            message: "The test reset needs the x-planner-test header.",
          },
        },
        403,
      );
    await resetToSeed(deps.db, deps.repos, deps.now);
    return c.json({ ok: true as const }, 200);
  });
}
