import { type CourseId, type PlanChain, undo } from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";
import { courseOrThrow } from "./plan-inputs.ts";

/** The head goes back to its parent. The undone revision is kept, and no fact (the log) is touched. */
export function undoPlan(repos: Repos, courseId: CourseId): void {
  courseOrThrow(repos, courseId);
  repos.transaction(() => {
    const head = repos.plans.head(courseId);
    const chain: PlanChain = {
      planId: courseId,
      headId: head?.id ?? null,
      revisions: head ? { [head.id]: head } : {},
    };
    const out = undo(chain);
    if (!out.ok || out.chain.headId === null)
      throw new ApiError(
        409,
        "nothing-to-undo",
        "There is no earlier plan to go back to.",
      );
    repos.plans.setHead(courseId, out.chain.headId);
  });
}
