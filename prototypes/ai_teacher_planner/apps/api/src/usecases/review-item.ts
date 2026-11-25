import { can, type Provenance } from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Principal } from "../routes/require-access.ts";
import { type AiItem, getItemHandler, type JobContext } from "./ai-jobs.ts";

/** Who made an AI item and how: the run's provider, model, skill and start, and its review state. */
export function provenanceOf(ctx: JobContext, item: AiItem): Provenance {
  const run = ctx.repos.ai.getRun(item.runId);
  if (!run) throw new Error(`Item ${item.id} has no run`);
  return {
    origin: "ai",
    ai: {
      runId: run.id,
      provider: run.provider ?? "unknown",
      model: run.model ?? "unknown",
      skillId: run.skillId,
      at: run.startedAt,
      sources: item.sources,
      review: item.review,
    },
  };
}

/**
 * Her decision on one suggestion. Accepting or editing applies it, once; rejecting applies
 * nothing. Only the first review of an item counts: the claim is a single database update,
 * so two reviews at the same moment cannot both apply it.
 */
export async function reviewItem(
  ctx: JobContext,
  principal: Principal,
  itemId: string,
  body: { state: "accepted" | "edited" | "rejected"; data?: unknown },
): Promise<AiItem> {
  const { repos } = ctx;
  const item = repos.ai.getItem(itemId);
  const run = item ? repos.ai.getRun(item.runId) : null;
  if (!item || !run)
    throw new ApiError(404, "not-found", "There is no such suggestion.");
  const handler = getItemHandler(run.skillId);
  if (!handler) throw new Error(`No handler for ${run.skillId}`);
  if (!can(principal.role, handler.resource, "edit"))
    throw new ApiError(
      403,
      "forbidden",
      `You are not allowed to change ${handler.resource.replaceAll("-", " ")}.`,
    );
  if (body.state === "edited" && body.data === undefined)
    throw new ApiError(
      422,
      "invalid-request",
      "An edit needs the changed data.",
    );
  if (body.state !== "edited" && body.data !== undefined)
    throw new ApiError(
      422,
      "invalid-request",
      "Only an edited suggestion takes data.",
    );

  // Applying an item writes to its course, so the course must be one of hers.
  if (
    body.state !== "rejected" &&
    item.courseId !== null &&
    repos.courses.get(item.courseId) === null
  )
    throw new ApiError(
      422,
      "unknown-course",
      `This suggestion is for a course the planner does not have (${item.courseId}), so it cannot be applied.`,
    );

  const before = repos.ai.claimReview(
    itemId,
    body.state,
    ctx.now().toISOString(),
    body.data,
  );
  if (!before)
    throw new ApiError(
      409,
      "already-reviewed",
      "This suggestion has already been reviewed.",
    );
  const reviewed = repos.ai.getItem(itemId) as AiItem;
  if (body.state === "rejected") return reviewed;
  try {
    await handler.apply(reviewed, ctx);
  } catch (e) {
    repos.ai.restoreItem(before);
    throw e;
  }
  return reviewed;
}
