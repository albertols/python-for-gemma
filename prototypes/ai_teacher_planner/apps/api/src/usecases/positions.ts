import { type CourseId, expandLessons, type Position } from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";
import { courseOrThrow, groupsOf } from "./plan-inputs.ts";

/** The group's lessons of the same item, or the first lesson of each item when the item is unknown too. */
function near(lessonIds: readonly string[], wanted: string): string[] {
  const item = wanted.split("#")[0] ?? "";
  const same = lessonIds.filter((id) => id.split("#")[0] === item);
  if (same.length > 0) return same;
  return lessonIds.filter((id) => id.endsWith("#1"));
}

/**
 * Replaces where each group of the course is. Refused (422) when a group is not
 * the course's, is given twice, or its next lesson or a done item is not in its
 * scheme; an unknown lesson is answered with the valid ids near it.
 */
export function savePositions(
  repos: Repos,
  courseId: CourseId,
  positions: readonly Position[],
): void {
  courseOrThrow(repos, courseId);
  const items = repos.scheme.items(courseId);
  const overrides = repos.scheme.overrides(courseId);
  const groups = new Map(groupsOf(repos, courseId).map((g) => [g.id, g]));
  const itemIds = new Set(items.map((i) => i.id));
  const issues: string[] = [];
  let unknownLesson = false;
  const seen = new Set<string>();
  for (const p of positions) {
    const group = groups.get(p.groupId);
    if (!group) {
      issues.push(`${p.groupId} is not a group of this course.`);
      continue;
    }
    if (seen.has(p.groupId)) {
      issues.push(`${p.groupId} is given twice.`);
      continue;
    }
    seen.add(p.groupId);
    const lessons = expandLessons(items, overrides, group.id, group.track).map(
      (l) => l.id,
    );
    if (p.nextLessonId !== null && !lessons.includes(p.nextLessonId)) {
      unknownLesson = true;
      const options = near(lessons, p.nextLessonId);
      issues.push(
        `${p.groupId}: "${p.nextLessonId}" is not one of its lessons.${options.length > 0 ? ` Lessons near it: ${options.join(", ")}.` : " Its scheme has no lessons yet."}`,
      );
    }
    for (const id of p.doneItemIds)
      if (!itemIds.has(id))
        issues.push(`${p.groupId}: "${id}" is not an item of the scheme.`);
  }
  if (issues.length > 0)
    throw new ApiError(
      422,
      unknownLesson ? "unknown-lesson" : "invalid-positions",
      "The positions were not saved.",
      issues,
    );
  repos.facts.setPositions(courseId, positions);
}
