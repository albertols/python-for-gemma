import fs from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { Config } from "./config.ts";
import type { Database } from "./db/connection.ts";
import { ApiError } from "./errors.ts";
import type { ResourceGateway } from "./gateway/resource-gateway.ts";
import { createRepos } from "./repos/sqlite/index.ts";
import { calendarRoutes } from "./routes/calendar.ts";
import { disruptionRoutes } from "./routes/disruptions.ts";
import { eventRoutes } from "./routes/events.ts";
import { examRoutes } from "./routes/exams.ts";
import type { Principal } from "./routes/require-access.ts";
import { createRouter } from "./routes/router.ts";
import { slotRoutes } from "./routes/slots.ts";
import { testRoutes } from "./routes/test-reset.ts";
import { timetableRoutes } from "./routes/timetable.ts";
import { todayRoutes } from "./routes/today.ts";
import { todayOf } from "./today.ts";
import { firstRun } from "./usecases/first-run.ts";

export interface AppDeps {
  config: Config;
  db: Database;
  now: () => Date;
  gateway: ResourceGateway;
  /** Who is asking. v1 always passes TEACHER_PRINCIPAL. */
  principal: Principal;
  /** The built web app. When set, it is served, with index.html for any page address. */
  webDir?: string;
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
  const { config, now, db, gateway, webDir } = deps;
  const repos = createRepos(db);
  firstRun(repos);
  const base = createRouter();
  // Hono runs middleware in registration order, so this goes before every route.
  base.use("*", async (c, next) => {
    c.set("principal" as never, deps.principal as never);
    await next();
  });
  const app = base
    .openapi(health, (c) => c.json({ ok: true as const }, 200))
    .openapi(configRoute, (c) =>
      c.json(
        {
          today: todayOf(config, now()),
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
    )
    .route("/", calendarRoutes({ config, repos, gateway, now }))
    .route("/", timetableRoutes({ repos }))
    .route("/", slotRoutes({ repos }))
    .route("/", disruptionRoutes({ repos, now }))
    .route("/", eventRoutes({ repos, now }))
    .route("/", examRoutes({ repos }))
    .route("/", todayRoutes({ config, repos, now }));

  if (config.testRoutes) app.route("/", testRoutes({ db, repos, now }));

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "AI Teacher Planner", version: "0.0.0" },
  });

  if (webDir) {
    const indexHtml = path.join(webDir, "index.html");
    const files = serveStatic({ root: webDir });
    app.use("*", async (c, next) => {
      // /api/* never falls through to the web page: its 404s stay JSON.
      if (c.req.path.startsWith("/api/")) return next();
      return files(c, next);
    });
    app.get("*", async (c, next) => {
      if (c.req.path.startsWith("/api/") || !fs.existsSync(indexHtml))
        return next();
      return c.html(fs.readFileSync(indexHtml, "utf8"));
    });
  }

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
    if (err instanceof ApiError) {
      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            ...(err.issues ? { issues: err.issues } : {}),
          },
        },
        err.status,
      );
    }
    if (err instanceof HTTPException) {
      // Hono's own errors, such as malformed JSON, keep their status.
      return c.json(
        {
          error: {
            code: err.status === 400 ? "bad-request" : "http-error",
            message: err.message || "The request could not be handled.",
          },
        },
        err.status,
      );
    }
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
