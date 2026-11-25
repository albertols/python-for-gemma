import { createHash } from "node:crypto";
import {
  type CourseId,
  type IsoDate,
  isUpToDate,
  type PlanInputs,
  type PlanRevision,
  type PlanSnapshot,
  type Proposal,
  propose,
  sequence,
  snapshotKey,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { courseOrThrow, loadPlanInputs } from "./plan-inputs.ts";

/** A proposal and the key of its candidate, which the accept sends back. */
export type PlanProposal = Proposal & { candidateKey: string };

/**
 * Names one candidate plan exactly. SHA-256 of `snapshotKey`, hashed here with
 * node:crypto because it must be synchronous: the accept recomputes the plan,
 * compares keys and stores it with nothing able to run in between.
 */
export function candidateKey(snapshot: PlanSnapshot): string {
  return createHash("sha256").update(snapshotKey(snapshot)).digest("hex");
}

/** Every group of the course needs a position before a plan can be made: we never guess where she is. */
function requirePositions(inputs: PlanInputs): void {
  const have = new Set(inputs.positions.map((p) => p.groupId));
  const missing = inputs.groups
    .map((g) => g.id)
    .filter((g) => !have.has(g))
    .sort();
  if (missing.length > 0)
    throw new ApiError(
      422,
      "positions-needed",
      `Say where each group is in the scheme before planning: ${missing.join(", ")}.`,
    );
}

/** A proposal from what is stored now, on the current head. Stores nothing. */
export function proposePlan(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  today: IsoDate,
): PlanProposal {
  const inputs = loadPlanInputs(repos, packs, courseId, today);
  requirePositions(inputs);
  const head = repos.plans.head(courseId);
  const proposal = propose({
    planId: courseId,
    baseRevisionId: head?.id ?? null,
    head: head?.snapshot ?? null,
    inputs,
    label: head ? `Re-plan on ${today}` : "First plan",
  });
  return { ...proposal, candidateKey: candidateKey(proposal.candidate) };
}

export interface PlanStatus {
  head: PlanRevision | null;
  canUndo: boolean;
  /** False when there is no plan, or a new plan made today would differ (see `isUpToDate`). */
  upToDate: boolean;
}

/** The head, whether undo can go back, and whether the head is still the plan. */
export function planStatus(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  today: IsoDate,
): PlanStatus {
  courseOrThrow(repos, courseId);
  const head = repos.plans.head(courseId);
  if (!head) return { head: null, canUndo: false, upToDate: false };
  return {
    head,
    canUndo: head.parentId !== null,
    upToDate:
      packs.locked(courseId) !== null &&
      upToDateFrom(loadPlanInputs(repos, packs, courseId, today), head),
  };
}

function upToDateFrom(inputs: PlanInputs, head: PlanRevision): boolean {
  const fresh = sequence({ ...inputs, previous: head.snapshot });
  return isUpToDate({
    head: head.snapshot,
    fresh,
    slots: inputs.slots,
    flexEdits: inputs.flexEdits,
  });
}
