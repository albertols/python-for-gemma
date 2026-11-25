import { createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import type { AiState } from "../ai-state.ts";
import { ApiError } from "../errors.ts";
import {
  cancelJob,
  type JobEvent,
  startJob,
  subscribeToJob,
} from "../usecases/ai-jobs.ts";
import { reviewItem } from "../usecases/review-item.ts";
import { guard, type Principal } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { aiRun, errorResponse, SKILL_IDS } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ id: z.string() });

const reviewState = z.enum(["suggested", "accepted", "edited", "rejected"]);
const aiItem = z.object({
  id: z.string(),
  runId: z.string(),
  kind: z.string(),
  target: z.string(),
  courseId: z.string().nullable(),
  data: z.unknown(),
  review: reviewState,
  reviewedAt: z.string().nullable(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable(),
      opened: z.boolean(),
    }),
  ),
});

const start = createRoute({
  method: "post",
  path: "/api/ai/jobs",
  ...guard("lesson-plans", "edit"),
  request: {
    body: {
      content: json(
        z.object({
          skillId: z.enum(SKILL_IDS),
          input: z.unknown(),
          text: z.string().nullable().default(null),
          attachments: z.array(z.string()).default([]),
        }),
      ),
      required: true,
    },
  },
  responses: {
    202: { description: "The job is queued", content: json(aiRun) },
    409: errorResponse("The AI is switched off or not available, with why"),
    422: errorResponse("The request is not in the right shape"),
  },
});
const getJob = createRoute({
  method: "get",
  path: "/api/ai/jobs/{id}",
  request: { params },
  responses: {
    200: { description: "The run", content: json(aiRun) },
    404: errorResponse("There is no such job"),
  },
});
const jobEvents = createRoute({
  method: "get",
  path: "/api/ai/jobs/{id}/events",
  request: { params },
  responses: {
    200: {
      description:
        "Server-sent events: `progress` for each step, then `run` with the final run",
      content: { "text/event-stream": { schema: z.string() } },
    },
    404: errorResponse("There is no such job"),
  },
});
const cancel = createRoute({
  method: "post",
  path: "/api/ai/jobs/{id}/cancel",
  ...guard("lesson-plans", "edit"),
  request: { params },
  responses: {
    200: { description: "The cancelled run", content: json(aiRun) },
    404: errorResponse("There is no such job"),
    409: errorResponse("The job has already finished"),
  },
});
const runs = createRoute({
  method: "get",
  path: "/api/ai/runs",
  responses: {
    200: {
      description: "Every run, newest first",
      content: json(z.array(aiRun)),
    },
  },
});
const items = createRoute({
  method: "get",
  path: "/api/ai/items",
  request: { query: z.object({ review: reviewState.optional() }) },
  responses: {
    200: {
      description:
        "AI items, in the order they were made; `review` keeps one state",
      content: json(z.array(aiItem)),
    },
  },
});
const review = createRoute({
  method: "post",
  path: "/api/ai/items/{id}/review",
  ...guard("lesson-plans", "edit"),
  request: {
    params,
    body: {
      content: json(
        z.object({
          state: z.enum(["accepted", "edited", "rejected"]),
          data: z.unknown().optional(),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: { description: "The reviewed item", content: json(aiItem) },
    403: errorResponse("She may not change what this item would change"),
    404: errorResponse("There is no such item"),
    409: errorResponse("The item was already reviewed"),
    422: errorResponse("An edit needs data, and only an edit takes it"),
  },
});

export function aiRoutes(deps: { state: AiState }) {
  const { state } = deps;
  const { ctx } = state;
  const runOf = (id: string) => {
    const run = ctx.repos.ai.getRun(id);
    if (!run) throw new ApiError(404, "not-found", "There is no such job.");
    return run;
  };
  return createRouter()
    .openapi(start, async (c) => {
      const gate = await state.check();
      if (!gate.ok) throw new ApiError(409, gate.code, gate.reason);
      const body = c.req.valid("json");
      return c.json(
        startJob(ctx, {
          skillId: body.skillId,
          input: body.input,
          text: body.text,
          attachments: body.attachments,
        }),
        202,
      );
    })
    .openapi(getJob, (c) => c.json(runOf(c.req.valid("param").id), 200))
    .openapi(jobEvents, (async (c: {
      req: { valid(k: "param"): { id: string } };
      header(k: string, v: string): void;
    }) => {
      const run = runOf(c.req.valid("param").id);
      // streamSSE needs the real Hono context
      return streamSSE(c as never, async (stream) => {
        const send = (e: JobEvent) =>
          stream.writeSSE(
            e.type === "run"
              ? { event: "run", data: JSON.stringify(e.run) }
              : { event: "progress", data: JSON.stringify(e.progress) },
          );
        let finish: () => void = () => {};
        const ended = new Promise<void>((resolve) => {
          finish = resolve;
        });
        let chain: Promise<void> = Promise.resolve();
        const { stop, known } = subscribeToJob(ctx, run.id, (e) => {
          chain = chain
            .then(() => send(e))
            .then(() => {
              if (e.type === "run") finish();
            });
        });
        stream.onAbort(() => {
          stop();
          finish();
        });
        const live = run.status === "queued" || run.status === "running";
        if (!known && !live) {
          // a run from an earlier session: no history, just how it ended
          stop();
          await send({ type: "run", run });
          return;
        }
        await ended;
        await chain;
        stop();
      });
    }) as never)
    .openapi(cancel, (c) =>
      c.json(cancelJob(ctx, c.req.valid("param").id), 200),
    )
    .openapi(runs, (c) => c.json(ctx.repos.ai.listRuns(), 200))
    .openapi(items, (c) =>
      c.json(
        ctx.repos.ai.listItems(
          c.req.valid("query").review
            ? { review: c.req.valid("query").review as never }
            : undefined,
        ),
        200,
      ),
    )
    .openapi(review, async (c) => {
      const principal = c.get("principal" as never) as Principal;
      const body = c.req.valid("json");
      return c.json(
        await reviewItem(ctx, principal, c.req.valid("param").id, {
          state: body.state,
          ...(body.data === undefined ? {} : { data: body.data }),
        }),
        200,
      );
    });
}
