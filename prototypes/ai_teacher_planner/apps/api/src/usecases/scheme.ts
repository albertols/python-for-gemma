import {
  type CourseId,
  deleteBlockers,
  expandLessons,
  type GroupOverride,
  type Lesson,
  type Merge,
  type SowItem,
  validateScheme,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { courseOrThrow, groupsOf, requireLockedPack } from "./plan-inputs.ts";

/** Why the group counts cannot be stored; empty when they can. */
function overrideIssues(
  overrides: readonly GroupOverride[],
  items: readonly SowItem[],
  groupIds: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const badGroups = new Set<string>();
  for (const o of overrides) {
    if (!groupIds.has(o.groupId)) {
      if (!badGroups.has(o.groupId))
        issues.push(`${o.groupId} is not a group of this course.`);
      badGroups.add(o.groupId);
      continue;
    }
    const key = `${o.groupId}\u0000${o.itemId}`;
    if (seen.has(key)) {
      issues.push(`${o.groupId} has two counts for "${o.itemId}".`);
      continue;
    }
    seen.add(key);
    const item = byId.get(o.itemId);
    if (!item)
      issues.push(
        `${o.groupId} has a count for "${o.itemId}", and there is no such item.`,
      );
    else if (item.kind === "assessment")
      issues.push(
        `${o.groupId} has a count for "${o.itemId}", which is an assessment, not lessons.`,
      );
    if (o.lessons < 0)
      issues.push(
        `${o.groupId} has a negative number of lessons for "${o.itemId}" (${o.lessons}).`,
      );
  }
  return issues;
}

/**
 * Replaces the course's scheme: its items and the groups' own counts. Refused
 * (409) until the pack is locked, and (422) with one sentence per reason when
 * the items or counts make no sense. Assessment lengths are whole minutes; the
 * request schema refuses anything else.
 */
export function saveScheme(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  items: readonly SowItem[],
  overrides: readonly GroupOverride[],
): void {
  courseOrThrow(repos, courseId);
  requireLockedPack(packs, courseId);
  const chapters = new Set(
    (packs.locked(courseId)?.chapters ?? []).map((c) => c.id),
  );
  const issues = validateScheme(items);
  for (const i of items) {
    if (i.courseId !== courseId)
      issues.push(`"${i.id}" belongs to ${i.courseId}, not to this course.`);
    for (const ref of i.packRefs)
      if (!chapters.has(ref))
        issues.push(
          `"${i.id}" links to chapter "${ref}", which is not in the locked pack.`,
        );
  }
  const groups = new Set(groupsOf(repos, courseId).map((g) => g.id));
  issues.push(...overrideIssues(overrides, items, groups));
  // an item that something depends on stays: the dependants are named
  const kept = new Set(items.map((i) => i.id));
  const decisions = repos.decisions.forCourse(courseId);
  const standing = {
    pins: decisions.pins,
    merges: decisions.merges,
    positions: repos.facts.positions(courseId),
  };
  for (const gone of repos.scheme
    .items(courseId)
    .filter((i) => !kept.has(i.id))) {
    const why = deleteBlockers(items, gone, standing);
    if (why.length > 0)
      issues.push(`"${gone.title}" cannot be deleted: ${why.join("; ")}.`);
  }
  if (issues.length > 0)
    throw new ApiError(
      422,
      "invalid-scheme",
      "The scheme was not saved.",
      issues,
    );
  repos.scheme.replace(courseId, items, overrides);
}

/**
 * Replaces the course's merges. Refused (422), with a reason for each, when a
 * merge names a lesson the group does not have, shares a lesson with another
 * merge, merges a lesson with itself, or includes a buffer lesson: a buffer
 * lesson can be dropped to make room, and the lesson merged with it would go too.
 */
export function saveMerges(
  repos: Repos,
  courseId: CourseId,
  merges: readonly Merge[],
): void {
  courseOrThrow(repos, courseId);
  const items = repos.scheme.items(courseId);
  const overrides = repos.scheme.overrides(courseId);
  const groups = new Map(groupsOf(repos, courseId).map((g) => [g.id, g]));
  const lessonsOf = new Map<string, Map<string, Lesson>>();
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const m of merges) {
    if (ids.has(m.id)) issues.push(`The id "${m.id}" is used twice.`);
    ids.add(m.id);
  }
  if (issues.length > 0)
    throw new ApiError(
      422,
      "invalid-merges",
      "The merges were not saved.",
      issues,
    );

  const usedIn = new Map<string, string>();
  for (const m of [...merges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const group = groups.get(m.groupId);
    if (!group) {
      issues.push(`${m.id}: ${m.groupId} is not a group of this course.`);
      continue;
    }
    if (m.first === m.second) {
      issues.push(`${m.id}: a lesson cannot be merged with itself.`);
      continue;
    }
    let lessons = lessonsOf.get(group.id);
    if (!lessons) {
      lessons = new Map(
        expandLessons(items, overrides, group.id, group.track).map((l) => [
          l.id,
          l,
        ]),
      );
      lessonsOf.set(group.id, lessons);
    }
    let ok = true;
    for (const id of [m.first, m.second]) {
      const lesson = lessons.get(id);
      const earlier = usedIn.get(`${m.groupId}\u0000${id}`);
      if (!lesson)
        issues.push(`${m.id}: "${id}" is not a lesson of ${m.groupId}.`);
      else if (lesson.kind === "buffer")
        issues.push(
          `${m.id}: "${id}" is a buffer lesson. A buffer lesson can be dropped to make room, so it cannot be merged.`,
        );
      else if (earlier)
        issues.push(`${m.id}: "${id}" is already merged in ${earlier}.`);
      else continue;
      ok = false;
    }
    if (ok)
      for (const id of [m.first, m.second])
        usedIn.set(`${m.groupId}\u0000${id}`, m.id);
  }
  if (issues.length > 0)
    throw new ApiError(
      422,
      "invalid-merges",
      "The merges were not saved.",
      issues,
    );
  repos.decisions.replace(courseId, "merges", [...merges]);
}
