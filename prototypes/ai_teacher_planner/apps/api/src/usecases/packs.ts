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
  packs.saveDraft(pack);
  return packs.draft(courseId) as CurriculumPack;
}

/**
 * Locks the draft: refused (422) with one sentence per broken reference or
 * in-scope spec point that no chapter links to. The hash is awaited before
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
  const locked = await lockPack(draft, now);
  packs.saveLocked(locked);
  return locked;
}
