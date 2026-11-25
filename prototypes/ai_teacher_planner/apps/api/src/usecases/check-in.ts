import {
  type CourseId,
  type GroupId,
  type IsoDate,
  type LessonLogEntry,
  LOG_NOTE_LIMIT,
  lessonsFor,
  mondayOf,
  type SlotKey,
  sequence,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { loadPlanInputs } from "./plan-inputs.ts";
import { planStatus } from "./propose-plan.ts";

export interface CheckInLesson {
  courseId: CourseId;
  groupId: GroupId;
  lessonId: string;
  slotKey: SlotKey;
  date: IsoDate;
  title: string;
  /** "Demand 2 of 3": the lesson's number and the item's count for this group. Null for a spare lesson. */
  index: number | null;
  of: number | null;
}
export interface CheckInWeek {
  /** The Monday. */
  weekOf: IsoDate;
  lessons: CheckInLesson[];
}
export interface CheckInEntry {
  groupId: GroupId;
  lessonId: string;
  outcome: LessonLogEntry["outcome"];
  note: string | null;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const period = (key: SlotKey) => Number(key.split("|")[2] ?? 0);

/**
 * Past lessons that were planned and that she has not said anything about, for
 * every course with a plan. They are the `assumed` placements of a plan made
 * today on top of the head. A past spare lesson she did not edit is never one
 * (a new plan drops it, ruling 14); one she edited (a title or a purpose) is a
 * lesson she planned, so it is listed. A lesson she logged is no longer one.
 */
function assumedLessons(
  repos: Repos,
  packs: PackStore,
  today: IsoDate,
): CheckInLesson[] {
  const out: CheckInLesson[] = [];
  for (const head of repos.plans.heads()) {
    const courseId = head.planId;
    if (packs.locked(courseId) === null) continue;
    const inputs = loadPlanInputs(repos, packs, courseId, today);
    const itemsById = new Map(inputs.items.map((i) => [i.id, i]));
    const flexTitles = new Map(
      inputs.flexEdits.map((e) => [e.flexId, e.title ?? "Spare lesson"]),
    );
    const fresh = sequence(inputs);
    for (const p of fresh.placements) {
      if (p.state !== "assumed" || p.slotKey === null) continue;
      const [itemId = "", n = ""] = p.lessonId.split("#");
      const item = itemsById.get(itemId);
      const spare = p.lessonId.startsWith("flex:");
      out.push({
        courseId,
        groupId: p.groupId,
        lessonId: p.lessonId,
        slotKey: p.slotKey,
        date: p.slotKey.split("|")[1] ?? "",
        title: spare
          ? (flexTitles.get(p.lessonId) ?? "Spare lesson")
          : (item?.title ?? itemId),
        index: spare || !item ? null : Number(n),
        of:
          spare || !item ? null : lessonsFor(item, inputs.overrides, p.groupId),
      });
    }
  }
  return out.sort(
    (a, b) =>
      cmp(a.date, b.date) ||
      period(a.slotKey) - period(b.slotKey) ||
      cmp(a.groupId, b.groupId) ||
      cmp(a.lessonId, b.lessonId),
  );
}

/** "Did these happen as planned?": the assumed lessons, one section per week, oldest first. */
export function checkInWeeks(
  repos: Repos,
  packs: PackStore,
  today: IsoDate,
): CheckInWeek[] {
  const weeks = new Map<IsoDate, CheckInLesson[]>();
  for (const l of assumedLessons(repos, packs, today)) {
    const monday = mondayOf(l.date);
    weeks.set(monday, [...(weeks.get(monday) ?? []), l]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([weekOf, lessons]) => ({ weekOf, lessons }));
}

/**
 * Writes her answers to the lesson log, recorded today, each on the slot the
 * lesson was assumed on. Refused as a whole (422) when an entry is not waiting
 * for her answer or its note is too long. Returns the courses of the entries
 * whose plan is not up to date any more, such as after a skip.
 */
export function recordCheckIn(
  repos: Repos,
  packs: PackStore,
  today: IsoDate,
  entries: readonly CheckInEntry[],
): { written: number; outOfDate: CourseId[] } {
  return repos.transaction(() => {
    const waiting = new Map(
      assumedLessons(repos, packs, today).map((l) => [
        `${l.groupId}\u0000${l.lessonId}`,
        l,
      ]),
    );
    const issues: string[] = [];
    let notWaiting = false;
    const log: LessonLogEntry[] = [];
    const courses = new Set<CourseId>();
    const seen = new Set<string>();
    for (const e of entries) {
      const key = `${e.groupId}\u0000${e.lessonId}`;
      const lesson = waiting.get(key);
      const note = e.note?.trim() || null;
      if (!lesson || seen.has(key)) {
        notWaiting = true;
        issues.push(
          `${e.groupId} ${e.lessonId} is not waiting for an answer${seen.has(key) ? " (it is given twice)" : ""}.`,
        );
        continue;
      }
      seen.add(key);
      if (note !== null && [...note].length > LOG_NOTE_LIMIT) {
        issues.push(
          `The note for ${e.groupId} ${e.lessonId} is longer than ${LOG_NOTE_LIMIT} characters.`,
        );
        continue;
      }
      courses.add(lesson.courseId);
      log.push({
        groupId: e.groupId,
        lessonId: e.lessonId,
        slotKey: lesson.slotKey,
        outcome: e.outcome,
        recordedOn: today,
        note,
      });
    }
    if (issues.length > 0)
      throw new ApiError(
        422,
        notWaiting ? "not-assumed" : "invalid-checkin",
        "Nothing was saved from this check-in.",
        issues,
      );
    repos.facts.append(log);
    const outOfDate = [...courses]
      .sort()
      .filter((c) => !planStatus(repos, packs, c, today).upToDate);
    return { written: log.length, outOfDate };
  });
}
