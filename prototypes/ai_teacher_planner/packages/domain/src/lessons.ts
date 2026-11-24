import {
  type GroupOverride,
  type ItemKind,
  lessonsFor,
  type SowItem,
} from "./scheme.ts";
import type { GroupId } from "./timetable.ts";

export type LessonId = string;

export interface Lesson {
  id: LessonId;
  itemId: string;
  /** From 1. */
  index: number;
  /** How many lessons the item has for this group. */
  of: number;
  kind: Exclude<ItemKind, "assessment"> | "flex";
}

/**
 * The lessons a group teaches, in scheme order: each item of the group's track
 * becomes `${itemId}#1` to `#n`. Assessments are not lessons. A group's override
 * replaces the count, and 0 removes the item for that group.
 */
export function expandLessons(
  items: readonly SowItem[],
  overrides: readonly GroupOverride[],
  groupId: GroupId,
  track: "core" | "hl",
): Lesson[] {
  const ordered = items
    .filter((i) => i.kind !== "assessment" && i.track === track)
    .sort(
      (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const lessons: Lesson[] = [];
  for (const item of ordered) {
    if (item.kind === "assessment") continue;
    const of = lessonsFor(item, overrides, groupId);
    for (let index = 1; index <= of; index++)
      lessons.push({
        id: `${item.id}#${index}`,
        itemId: item.id,
        index,
        of,
        kind: item.kind,
      });
  }
  return lessons;
}
