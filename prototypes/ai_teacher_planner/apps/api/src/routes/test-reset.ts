import { createRoute, z } from "@hono/zod-openapi";
import type { AiState } from "../ai-state.ts";
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

const switchAi = createRoute({
  method: "post",
  path: "/api/test/ai",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ mode: z.enum(["fake", "off", "signed-out"]) }),
        },
      },
      required: true,
    },
  },
  responses: {
    403: reset.responses[403],
    200: {
      description: "The running app's AI is switched",
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
  ai: Pick<AiState, "switchTo" | "restore">;
}) {
  // A custom header cannot be set by a cross-site form post.
  const refused = () => ({
    error: {
      code: "forbidden",
      message: "The test routes need the x-planner-test header.",
    },
  });
  return createRouter()
    .openapi(reset, async (c) => {
      if (c.req.header("x-planner-test") !== "1") return c.json(refused(), 403);
      await resetToSeed(deps.db, deps.repos, deps.now);
      deps.ai.restore();
      return c.json({ ok: true as const }, 200);
    })
    .openapi(switchAi, (c) => {
      if (c.req.header("x-planner-test") !== "1") return c.json(refused(), 403);
      deps.ai.switchTo(c.req.valid("json").mode);
      return c.json({ ok: true as const }, 200);
    });
}
