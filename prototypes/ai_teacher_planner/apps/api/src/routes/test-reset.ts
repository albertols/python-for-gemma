import { createRoute, z } from "@hono/zod-openapi";
import type { AiState } from "../ai-state.ts";
import type { Database } from "../db/connection.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { resetToSeed } from "../usecases/reset-to-seed.ts";
import { SEED_STATES } from "../usecases/seed-m2.ts";
import { createRouter } from "./router.ts";

/**
 * The body is optional and read by hand: the browser tests post no body, and an
 * empty body sent as JSON must still mean the default.
 */
const resetBody = z.object({ state: z.enum(SEED_STATES).optional() });

const reset = createRoute({
  method: "post",
  path: "/api/test/reset",
  description:
    'Body, optional: { state }, one of "m1b" (the default: no M2 data), "m2-draft-pack", "m2-no-positions", "m2-planned".',
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
    422: {
      description: "There is no such state",
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
  packs: PackStore;
  dataDir: string;
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
      const text = (await c.req.text()).trim();
      let body: unknown = {};
      try {
        if (text !== "") body = JSON.parse(text);
      } catch {
        body = null;
      }
      const parsed = resetBody.safeParse(body);
      if (!parsed.success)
        return c.json(
          {
            error: {
              code: "invalid-request",
              message: `state must be one of ${SEED_STATES.join(", ")}.`,
            },
          },
          422,
        );
      const { state } = parsed.data;
      await resetToSeed(
        deps.db,
        deps.repos,
        { packs: deps.packs, dataDir: deps.dataDir },
        deps.now,
        state ?? "m1b",
      );
      deps.ai.restore();
      return c.json({ ok: true as const }, 200);
    })
    .openapi(switchAi, (c) => {
      if (c.req.header("x-planner-test") !== "1") return c.json(refused(), 403);
      deps.ai.switchTo(c.req.valid("json").mode);
      return c.json({ ok: true as const }, 200);
    });
}
