import { createRoute, z } from "@hono/zod-openapi";
import type { Database } from "../db/connection.ts";
import type { Repos } from "../repos/ports.ts";
import { resetToSeed } from "../usecases/reset-to-seed.ts";
import { createRouter } from "./router.ts";

const reset = createRoute({
  method: "post",
  path: "/api/test/reset",
  responses: {
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
    await resetToSeed(deps.db, deps.repos, deps.now);
    return c.json({ ok: true as const }, 200);
  });
}
