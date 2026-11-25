import {
  acceptProposal,
  type CourseId,
  type IsoDate,
  type PlanChain,
  type PlanRevision,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { proposePlan } from "./propose-plan.ts";

const STALE =
  "The plan changed after this preview was made, so it was not applied. Look at the new preview.";

/**
 * Stores the proposal she saw. The plan is computed again from what is stored
 * now: if the head moved on, or the new candidate is not the one she saw (the
 * scheme, positions or calendar changed), nothing is stored. All of it runs
 * synchronously in one transaction, so nothing can change in between.
 */
export function acceptPlan(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  today: IsoDate,
  body: { baseRevisionId: string | null; candidateKey: string },
  meta: { id: string; createdAt: string },
): PlanRevision {
  return repos.transaction(() => {
    const head = repos.plans.head(courseId);
    if ((head?.id ?? null) !== body.baseRevisionId)
      throw new ApiError(409, "stale-proposal", STALE);
    const proposal = proposePlan(repos, packs, courseId, today);
    if (proposal.candidateKey !== body.candidateKey)
      throw new ApiError(409, "stale-proposal", STALE);
    const chain: PlanChain = {
      planId: courseId,
      headId: head?.id ?? null,
      revisions: head ? { [head.id]: head } : {},
    };
    const out = acceptProposal(chain, proposal, meta);
    if (!out.ok) throw new ApiError(409, "stale-proposal", STALE);
    const revision = out.chain.revisions[meta.id] as PlanRevision;
    repos.plans.insertHead(revision, courseId);
    return revision;
  });
}
