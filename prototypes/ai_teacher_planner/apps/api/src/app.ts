import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Config } from "./config.ts";
import type { Database } from "./db/connection.ts";
import { localIsoDate } from "./today.ts";

export interface AppDeps {
  config: Config;
  db: Database;
  now: () => Date;
}

const health = createRoute({
  method: "get",
  path: "/api/health",
  responses: {
    200: {
      description: "The server is up",
      content: {
        "application/json": { schema: z.object({ ok: z.literal(true) }) },
      },
    },
  },
});

const configRoute = createRoute({
  method: "get",
  path: "/api/config",
  responses: {
    200: {
      description:
        "Today's date, the time zone and whether the AI is available",
      content: {
        "application/json": {
          schema: z.object({
            today: z.string(),
            timeZone: z.string(),
            ai: z.object({
              mode: z.enum(["claude", "fake", "off"]),
              available: z.boolean(),
              reason: z.string().nullable(),
            }),
          }),
        },
      },
    },
  },
});

export function createApp(deps: AppDeps) {
  const { config, now } = deps;
  const app = new OpenAPIHono();

  app.openapi(health, (c) => c.json({ ok: true as const }, 200));

  app.openapi(configRoute, (c) =>
    c.json(
      {
        today: config.fixedToday ?? localIsoDate(now(), config.timeZone),
        timeZone: config.timeZone,
        // Until Task 2.9 the AI is not built, unless it is switched off on purpose.
        ai: {
          mode: config.ai,
          available: false,
          reason: config.ai === "off" ? null : "not built yet",
        },
      },
      200,
    ),
  );

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "AI Teacher Planner", version: "0.0.0" },
  });

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "not-found",
          message: "There is nothing at this address.",
        },
      },
      404,
    ),
  );
  app.onError((err, c) => {
    // The cause goes to the server log only; the browser never sees a stack.
    console.error(err);
    return c.json(
      {
        error: {
          code: "internal",
          message: "Something went wrong on the server.",
        },
      },
      500,
    );
  });
  return app;
}
export type AppType = ReturnType<typeof createApp>;
