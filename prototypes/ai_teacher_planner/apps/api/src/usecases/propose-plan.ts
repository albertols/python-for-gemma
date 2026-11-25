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
  type Slot,
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

/** A lesson or assessment of the head, from today on, whose slot is not in the calendar and timetable any more. */
export interface WithoutSlot {
  groupId: string;
  /** The lesson id, or the assessment's item id. */
  id: string;
  kind: "lesson" | "assessment";
  slotKey: string;
}

export interface PlanStatus {
  head: PlanRevision | null;
  canUndo: boolean;
  /** False when there is no plan, or a new plan made today would differ (see `isUpToDate`). */
  upToDate: boolean;
  /**
   * The head's lessons and assessments from today on whose slot no longer
   * exists (her timetable or a week label changed), so the board has no cell
   * for them. Spare lessons are left out: losing one is not a lesson to teach.
   */
  withoutSlot: WithoutSlot[];
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
  if (!head)
    return { head: null, canUndo: false, upToDate: false, withoutSlot: [] };
  const inputs =
    packs.locked(courseId) !== null
      ? loadPlanInputs(repos, packs, courseId, today)
      : null;
  return {
    head,
    canUndo: head.parentId !== null,
    upToDate: inputs !== null && upToDateFrom(inputs, head),
    withoutSlot: inputs ? withoutSlot(head, inputs.slots, today) : [],
  };
}

const dateOf = (slotKey: string) => slotKey.split("|")[1] ?? "";

function withoutSlot(
  head: PlanRevision,
  slots: readonly Slot[],
  today: IsoDate,
): WithoutSlot[] {
  const keys = new Set(slots.map((s) => s.key));
  const missing = (slotKey: string | null): slotKey is string =>
    slotKey !== null && dateOf(slotKey) >= today && !keys.has(slotKey);
  const out: WithoutSlot[] = [];
  for (const p of head.snapshot.placements)
    if (
      p.state === "planned" &&
      !p.lessonId.startsWith("flex:") &&
      missing(p.slotKey)
    )
      out.push({
        groupId: p.groupId,
        id: p.lessonId,
        kind: "lesson",
        slotKey: p.slotKey,
      });
  for (const a of head.snapshot.assessments)
    if (missing(a.slotKey))
      out.push({
        groupId: a.groupId,
        id: a.itemId,
        kind: "assessment",
        slotKey: a.slotKey,
      });
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return out.sort(
    (x, y) =>
      cmp(dateOf(x.slotKey), dateOf(y.slotKey)) ||
      cmp(x.slotKey, y.slotKey) ||
      cmp(x.id, y.id),
  );
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
