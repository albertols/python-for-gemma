import fs from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { createRoute, z } from "@hono/zod-openapi";
import type { AiProvider } from "@planner/ai";
import { HTTPException } from "hono/http-exception";
import { createAiState } from "./ai-state.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/connection.ts";
import { ApiError } from "./errors.ts";
import type { ResourceGateway } from "./gateway/resource-gateway.ts";
import { createMaterialStore } from "./materials/store.ts";
import { createRepos } from "./repos/sqlite/index.ts";
import { createPackStore } from "./repos/sqlite/pack-store.ts";
import { aiRoutes } from "./routes/ai.ts";
import { calendarRoutes } from "./routes/calendar.ts";
import { checkInRoutes } from "./routes/checkin.ts";
import { courseRoutes } from "./routes/courses.ts";
import { disruptionRoutes } from "./routes/disruptions.ts";
import { eventRoutes } from "./routes/events.ts";
import { examRoutes } from "./routes/exams.ts";
import { lessonNoteRoutes } from "./routes/lesson-notes.ts";
import { packRoutes } from "./routes/packs.ts";
import { planRoutes } from "./routes/plans.ts";
import type { Principal } from "./routes/require-access.ts";
import { createRouter } from "./routes/router.ts";
import { schemeRoutes } from "./routes/scheme.ts";
import { slotRoutes } from "./routes/slots.ts";
import { testRoutes } from "./routes/test-reset.ts";
import { timetableRoutes } from "./routes/timetable.ts";
import { todayRoutes } from "./routes/today.ts";
import { todoRoutes } from "./routes/todos.ts";
import { todayOf } from "./today.ts";
import { failInterrupted } from "./usecases/ai-jobs.ts";
import { firstRun } from "./usecases/first-run.ts";
import { registerLessonCountHandler } from "./usecases/suggest-counts.ts";

export interface AppDeps {
  config: Config;
  db: Database;
  now: () => Date;
  gateway: ResourceGateway;
  /** The AI, or null when there is none. main.ts picks it from PLANNER_AI. */
  ai: AiProvider | null;
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
  // pack files live beside the database; nothing is written there until a pack is saved
  const packs = createPackStore(db, path.join(config.dataDir, "packs"));
  // attached files live beside the database; the folder is made when the first file arrives
  const materials = createMaterialStore(path.join(config.dataDir, "materials"));
  firstRun(repos);
  registerLessonCountHandler();
  // a job that was running when the planner closed can never finish
  failInterrupted(repos);
  const ai = createAiState({ config, ai: deps.ai, repos, now });
  void ai.availability(); // checked at start-up, then at most once a minute
  const base = createRouter();
  // Hono runs middleware in registration order, so this goes before every route.
  base.use("*", async (c, next) => {
    c.set("principal" as never, deps.principal as never);
    await next();
  });
  const app = base
    .openapi(health, (c) => c.json({ ok: true as const }, 200))
    .openapi(configRoute, async (c) => {
      const { available, reason } = await ai.availability();
      return c.json(
        {
          today: todayOf(config, now()),
          timeZone: config.timeZone,
          ai: { mode: ai.mode(), available, reason },
        },
        200,
      );
    })
    .route("/", calendarRoutes({ config, repos, gateway, now }))
    .route("/", timetableRoutes({ repos }))
    .route("/", slotRoutes({ repos }))
    .route("/", disruptionRoutes({ repos, now }))
    .route("/", eventRoutes({ repos, now }))
    .route("/", examRoutes({ repos }))
    .route("/", todoRoutes({ repos, now }))
    .route("/", lessonNoteRoutes({ repos, store: materials, now }))
    .route("/", todayRoutes({ config, repos, now }))
    .route("/", aiRoutes({ state: ai }))
    .route("/", courseRoutes({ repos, packs }))
    .route("/", packRoutes({ repos, packs, now }))
    .route("/", schemeRoutes({ ai, config, gateway, repos, packs, now }))
    .route("/", planRoutes({ config, repos, packs, now }))
    .route("/", checkInRoutes({ config, repos, packs, now }));

  if (config.testRoutes)
    app.route(
      "/",
      testRoutes({ db, repos, packs, dataDir: config.dataDir, now, ai }),
    );

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
