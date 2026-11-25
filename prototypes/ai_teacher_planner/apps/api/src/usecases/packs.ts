import {
  type CourseId,
  type CurriculumPack,
  packIssues,
  unmappedSpecPoints,
} from "@planner/domain";
import { lockPack } from "@planner/importers";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { courseOrThrow } from "./plan-inputs.ts";

export type PackState = "none" | "draft" | "locked";

export function packState(packs: PackStore, courseId: CourseId): PackState {
  if (packs.locked(courseId)) return "locked";
  return packs.draft(courseId) ? "draft" : "none";
}

/**
 * What a unit is, for deciding whether she changed it: the unit, its spec points, and every
 * chapter that sits in it or links one of its points (so a changed link shows in both units it joins).
 */
function unitSignatures(pack: CurriculumPack): Map<string, string> {
  const out = new Map<string, string>();
  for (const unit of pack.units) {
    const points = pack.specPoints.filter((p) => p.unitId === unit.id);
    const ids = new Set(points.map((p) => p.id));
    const chapters = pack.chapters.filter(
      (c) => c.unitId === unit.id || c.specPointIds.some((id) => ids.has(id)),
    );
    out.set(unit.id, JSON.stringify([unit, points, chapters]));
  }
  return out;
}

/** Stores her corrections to the draft. The locked pack, if any, stays until she locks again. */
export function saveDraft(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  pack: CurriculumPack,
): CurriculumPack {
  courseOrThrow(repos, courseId);
  if (pack.courseId !== courseId)
    throw new ApiError(
      422,
      "invalid-pack",
      `This pack is for ${pack.courseId}, not for this course.`,
    );
  const before = packs.draft(courseId);
  packs.saveDraft(pack);
  // A unit she changed after ticking it must be checked again; the others keep their tick.
  const ticked = packs.draftReview(courseId)?.checkedUnits ?? [];
  if (before && ticked.length > 0) {
    const was = unitSignatures(before);
    const now = unitSignatures(pack);
    const kept = ticked.filter((id) => was.get(id) === now.get(id));
    if (kept.length !== ticked.length) packs.saveCheckedUnits(courseId, kept);
  }
  return packs.draft(courseId) as CurriculumPack;
}

/**
 * Ticks or unticks one unit as checked, in the notes beside the draft. Refused for a unit
 * the draft does not have (422) and for a course whose pack is locked (409).
 */
export function setUnitChecked(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  unitId: string,
  checked: boolean,
): string[] {
  courseOrThrow(repos, courseId);
  if (packs.locked(courseId))
    throw new ApiError(
      409,
      "pack-locked",
      "This pack is locked, so its units cannot be changed.",
    );
  const draft = packs.draft(courseId);
  if (!draft)
    throw new ApiError(
      404,
      "not-found",
      "There is no draft pack for this course.",
    );
  if (!draft.units.some((u) => u.id === unitId))
    throw new ApiError(422, "unknown-unit", `This pack has no unit ${unitId}.`);
  const kept = (packs.draftReview(courseId)?.checkedUnits ?? []).filter(
    (id) => id !== unitId,
  );
  const next = checked ? [...kept, unitId] : kept;
  packs.saveCheckedUnits(courseId, next);
  return next;
}

/**
 * Locks the draft: refused (422) with one sentence per broken reference or
 * in-scope spec point that no chapter links to, and (409) while an in-scope unit is unchecked. The hash is awaited before
 * anything is stored.
 */
export async function lockDraft(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  now: Date,
): Promise<CurriculumPack> {
  courseOrThrow(repos, courseId);
  const draft = packs.draft(courseId);
  if (!draft)
    throw new ApiError(404, "not-found", "There is no draft pack to lock.");
  const issues = [
    ...packIssues(draft),
    ...unmappedSpecPoints(draft).map(
      (p) => `Spec point ${p.code} (${p.title}) is linked to no chapter.`,
    ),
  ];
  if (issues.length > 0)
    throw new ApiError(
      422,
      "pack-not-ready",
      "The pack cannot be locked yet.",
      issues,
    );
  // her review: every in-scope unit marked as checked (409, so it is told apart from a broken pack)
  const checked = new Set(packs.draftReview(courseId)?.checkedUnits ?? []);
  const unchecked = draft.units.filter((u) => u.inScope && !checked.has(u.id));
  if (unchecked.length > 0)
    throw new ApiError(
      409,
      "pack-unchecked",
      `Units not checked yet: ${unchecked.map((u) => u.code).join(", ")}.`,
    );
  const locked = await lockPack(draft, now);
  packs.saveLocked(locked);
  return locked;
}
