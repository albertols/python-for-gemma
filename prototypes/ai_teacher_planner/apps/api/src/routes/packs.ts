import { createRoute, z } from "@hono/zod-openapi";
import { curriculumPackSchema } from "@planner/importers";
import type { PackStore, Repos } from "../repos/ports.ts";
import { lockDraft, saveDraft } from "../usecases/packs.ts";
import { courseOrThrow } from "../usecases/plan-inputs.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { curriculumPack, draftNotes, errorResponse } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const params = z.object({ courseId: z.string() });

const get = createRoute({
  method: "get",
  path: "/api/packs/{courseId}",
  request: { params },
  responses: {
    200: {
      description:
        "The draft, the locked pack and the AI's notes beside the draft, each null when there is none",
      content: json(
        z.object({
          draft: curriculumPack.nullable(),
          locked: curriculumPack.nullable(),
          review: draftNotes.nullable(),
        }),
      ),
    },
    404: errorResponse("There is no such course"),
  },
});
const putDraft = createRoute({
  method: "put",
  path: "/api/packs/{courseId}/draft",
  ...guard("scheme-of-work", "edit"),
  request: {
    params,
    body: { content: json(curriculumPackSchema), required: true },
  },
  responses: {
    200: { description: "The stored draft", content: json(curriculumPack) },
    404: errorResponse("There is no such course"),
    422: errorResponse("Not a pack, or a pack for another course"),
  },
});
const lock = createRoute({
  method: "post",
  path: "/api/packs/{courseId}/lock",
  ...guard("scheme-of-work", "edit"),
  request: { params },
  responses: {
    200: {
      description: "The locked pack, with its hash",
      content: json(curriculumPack),
    },
    404: errorResponse("There is no such course, or no draft"),
    422: errorResponse(
      "Broken references or spec points linked to no chapter, one sentence each",
    ),
  },
});

export function packRoutes(deps: {
  repos: Repos;
  packs: PackStore;
  now: () => Date;
}) {
  const { repos, packs, now } = deps;
  return createRouter()
    .openapi(get, (c) => {
      const { courseId } = c.req.valid("param");
      courseOrThrow(repos, courseId);
      const draft = packs.draft(courseId);
      return c.json(
        {
          draft,
          locked: packs.locked(courseId),
          // notes without a draft would be about a pack that is gone
          review: draft ? packs.draftReview(courseId) : null,
        },
        200,
      );
    })
    .openapi(putDraft, (c) =>
      c.json(
        saveDraft(
          repos,
          packs,
          c.req.valid("param").courseId,
          c.req.valid("json"),
        ),
        200,
      ),
    )
    .openapi(lock, async (c) =>
      c.json(
        await lockDraft(repos, packs, c.req.valid("param").courseId, now()),
        200,
      ),
    );
}
