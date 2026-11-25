import { createRoute, z } from "@hono/zod-openapi";
import type { Config } from "../config.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { todayOf } from "../today.ts";
import { acceptPlan } from "../usecases/accept-plan.ts";
import { placementsIn } from "../usecases/placements.ts";
import { courseOrThrow, loadPlanInputs } from "../usecases/plan-inputs.ts";
import { savePositions } from "../usecases/positions.ts";
import { planStatus, proposePlan } from "../usecases/propose-plan.ts";
import { undoPlan } from "../usecases/undo-plan.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import {
  assessmentView,
  errorResponse,
  isoDate,
  placementView,
  planInputs,
  planStatus as planStatusSchema,
  position,
  proposal,
} from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ courseId: z.string() });
const noCourse = errorResponse("There is no such course");

const status = createRoute({
  method: "get",
  path: "/api/plans/{courseId}",
  request: { params },
  responses: {
    200: {
      description:
        "The accepted plan, whether undo can go back, and whether it is still up to date",
      content: json(planStatusSchema),
    },
    404: noCourse,
  },
});
const inputs = createRoute({
  method: "get",
  path: "/api/plans/{courseId}/inputs",
  request: { params },
  responses: {
    200: {
      description: "The engine's inputs for today",
      content: json(planInputs),
    },
    404: noCourse,
    409: errorResponse("The pack is not locked yet"),
  },
});
const proposals = createRoute({
  method: "post",
  path: "/api/plans/{courseId}/proposals",
  ...guard("lesson-plans", "edit"),
  request: { params },
  responses: {
    200: {
      description: "A proposal from what is stored now. Nothing is stored",
      content: json(proposal),
    },
    404: noCourse,
    409: errorResponse("The pack is not locked yet"),
    422: errorResponse("A group has no position yet"),
  },
});
const accept = createRoute({
  method: "post",
  path: "/api/plans/{courseId}/accept",
  ...guard("lesson-plans", "edit"),
  request: {
    params,
    body: {
      content: json(
        z.object({
          baseRevisionId: z.string().nullable(),
          candidateKey: z.string().min(1),
        }),
      ),
      required: true,
    },
  },
  responses: {
    200: { description: "The new head", content: json(planStatusSchema) },
    404: noCourse,
    409: errorResponse(
      "stale-proposal: the head or the plan changed after the preview; nothing is stored",
    ),
    422: errorResponse("A group has no position yet"),
  },
});
const undo = createRoute({
  method: "post",
  path: "/api/plans/{courseId}/undo",
  ...guard("lesson-plans", "edit"),
  request: { params },
  responses: {
    200: {
      description: "The head is its parent again",
      content: json(planStatusSchema),
    },
    404: noCourse,
    409: errorResponse("nothing-to-undo"),
  },
});
const getPositions = createRoute({
  method: "get",
  path: "/api/positions/{courseId}",
  request: { params },
  responses: {
    200: {
      description: "Where each group is, by group",
      content: json(z.array(position)),
    },
    404: noCourse,
  },
});
const putPositions = createRoute({
  method: "put",
  path: "/api/positions/{courseId}",
  ...guard("lesson-plans", "edit"),
  request: {
    params,
    body: {
      content: json(z.object({ positions: z.array(position) })),
      required: true,
    },
  },
  responses: {
    200: { description: "Stored", content: json(z.array(position)) },
    404: noCourse,
    422: errorResponse(
      "A lesson or item that is not in the group's scheme, with the ids near it",
    ),
  },
});
const placements = createRoute({
  method: "get",
  path: "/api/placements",
  request: { query: z.object({ from: isoDate, to: isoDate }) },
  responses: {
    200: {
      description:
        "Every plan's head in the days from `from` to `to`: lessons with title, kind and provenance, and assessments, in slot order. The state shown is her logged outcome, else the stored history state, else assumed for a planned lesson before today; a past spare lesson she did not edit is left out",
      content: json(
        z.object({
          placements: z.array(placementView),
          assessments: z.array(assessmentView),
        }),
      ),
    },
  },
});

export function planRoutes(deps: {
  config: Config;
  repos: Repos;
  packs: PackStore;
  now: () => Date;
}) {
  const { config, repos, packs, now } = deps;
  const today = () => todayOf(config, now());
  const statusOf = (courseId: string) =>
    planStatus(repos, packs, courseId, today());
  return createRouter()
    .openapi(status, (c) =>
      c.json(statusOf(c.req.valid("param").courseId), 200),
    )
    .openapi(inputs, (c) =>
      c.json(
        loadPlanInputs(repos, packs, c.req.valid("param").courseId, today()),
        200,
      ),
    )
    .openapi(proposals, (c) =>
      c.json(
        proposePlan(repos, packs, c.req.valid("param").courseId, today()),
        200,
      ),
    )
    .openapi(accept, (c) => {
      const { courseId } = c.req.valid("param");
      acceptPlan(repos, packs, courseId, today(), c.req.valid("json"), {
        id: `r:${crypto.randomUUID()}`,
        createdAt: now().toISOString(),
      });
      return c.json(statusOf(courseId), 200);
    })
    .openapi(undo, (c) => {
      const { courseId } = c.req.valid("param");
      undoPlan(repos, courseId);
      return c.json(statusOf(courseId), 200);
    })
    .openapi(getPositions, (c) => {
      const { courseId } = c.req.valid("param");
      courseOrThrow(repos, courseId);
      return c.json(repos.facts.positions(courseId), 200);
    })
    .openapi(putPositions, (c) => {
      const { courseId } = c.req.valid("param");
      savePositions(repos, courseId, c.req.valid("json").positions);
      return c.json(repos.facts.positions(courseId), 200);
    })
    .openapi(placements, (c) => {
      const { from, to } = c.req.valid("query");
      return c.json(placementsIn(repos, from, to, today()), 200);
    });
}
