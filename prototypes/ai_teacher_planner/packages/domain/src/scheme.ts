import type { IsoDate } from "./dates.ts";
import type { Provenance } from "./provenance.ts";
import type { CourseId, GroupId } from "./timetable.ts";

export type ItemKind =
  | "teaching"
  | "project"
  | "revision"
  | "buffer"
  | "assessment";

export interface AssessmentSpec {
  date: IsoDate | null;
  type: string;
  marks: number | null;
  durationMinutes: number | null;
  slotUse: "whole" | "in-lesson";
  status: "planned" | "sat";
  /** Teaching item ids. */
  covers: string[];
}

export interface SowItem {
  id: string;
  courseId: CourseId;
  order: number;
  kind: ItemKind;
  title: string;
  lessons: number;
  track: "core" | "hl";
  packRefs: string[];
  prerequisites: string[];
  /** Used from M4. */
  availableFrom: IsoDate | null;
  note: string | null;
  assessment: AssessmentSpec | null;
  provenance: Provenance;
}

/**
 * A course she teaches: its exam board and how many revision weeks its plan keeps
 * before the official exam (0 turns the revision block off). Groups name it with
 * `Group.courseId`; `board` is the exam board, `Group.programme` stays as it is.
 */
export interface Course {
  id: CourseId;
  title: string;
  board: "IAL" | "IB" | "IGCSE";
  revisionWeeks: number;
}

/** One group teaches an item for a different number of lessons. 0 removes it for that group. */
export interface GroupOverride {
  groupId: GroupId;
  itemId: string;
  lessons: number;
}

const DEFAULT_PERIOD_MINUTES = 55;
/** Half of a 55-minute lesson: an assessment that needs more than this (with extra time) takes the whole lesson. */
const IN_LESSON_LIMIT = 27;

/**
 * IAL papers allow 1.5 minutes a mark. The other boards have no such rule, so the teacher sets the length.
 * Lengths are whole minutes: an odd number of marks gives half a minute, which is rounded up
 * (15 marks: 22.5, so 23), so the default never takes time away from her students.
 */
export function defaultDuration(
  board: "IAL" | "IB" | "IGCSE",
  marks: number | null,
): number | null {
  if (board !== "IAL" || marks === null) return null;
  return Math.ceil(marks * 1.5);
}

/** The length with 25% extra time, rounded down as she counts it. */
export function withExtraTime(durationMinutes: number): number {
  return Math.floor(durationMinutes * 1.25);
}

/** Whole lesson unless the assessment, with extra time, fits in half of one. An unknown length takes a whole lesson. */
export function defaultSlotUse(
  durationMinutes: number | null,
): "whole" | "in-lesson" {
  if (durationMinutes === null) return "whole";
  return withExtraTime(durationMinutes) > IN_LESSON_LIMIT
    ? "whole"
    : "in-lesson";
}

/** Said when the length with extra time is more than the lesson. */
export function extraTimeWarning(
  durationMinutes: number | null,
  periodMinutes: number = DEFAULT_PERIOD_MINUTES,
): string | null {
  if (durationMinutes === null) return null;
  const needed = withExtraTime(durationMinutes);
  if (needed <= periodMinutes) return null;
  return `With 25% extra time this takes ${needed} minutes, ${needed - periodMinutes} more than the lesson`;
}

export interface SchemeTotals {
  teaching: number;
  project: number;
  revision: number;
  buffer: number;
  /** Assessments that take a whole lesson slot. */
  assessmentSlots: number;
  /** Assessments done inside a lesson, which take no slot of their own. */
  assessmentsInLesson: number;
}

/** What a group's scheme adds up to, with that group's overrides applied. Assessments are counted, never added to lessons. */
export function schemeTotals(
  items: readonly SowItem[],
  overrides: readonly GroupOverride[],
  groupId: GroupId,
): SchemeTotals {
  const totals: SchemeTotals = {
    teaching: 0,
    project: 0,
    revision: 0,
    buffer: 0,
    assessmentSlots: 0,
    assessmentsInLesson: 0,
  };
  for (const item of items) {
    if (item.kind === "assessment") {
      if (item.assessment?.slotUse === "in-lesson")
        totals.assessmentsInLesson++;
      else totals.assessmentSlots++;
      continue;
    }
    totals[item.kind] += lessonsFor(item, overrides, groupId);
  }
  return totals;
}

/** The item's lesson count for one group: its override if it has one. */
export function lessonsFor(
  item: SowItem,
  overrides: readonly GroupOverride[],
  groupId: GroupId,
): number {
  const o = overrides.find(
    (x) => x.groupId === groupId && x.itemId === item.id,
  );
  return o ? o.lessons : item.lessons;
}

/** Weeks a group needs for some lessons: two weeks per fortnight's worth, to one decimal place. */
export function weeksFor(lessons: number, lessonsPerFortnight: number): number {
  if (lessonsPerFortnight <= 0) return 0;
  return Math.round((lessons / lessonsPerFortnight) * 2 * 10) / 10;
}

/** Why a scheme cannot be trusted; empty when it can. Reported, never repaired. */
export function validateScheme(items: readonly SowItem[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) && !reported.has(item.id)) {
      issues.push(`The id "${item.id}" is used twice.`);
      reported.add(item.id);
    }
    seen.add(item.id);
  }
  for (const item of items) {
    if (item.lessons < 0)
      issues.push(
        `"${item.id}" has a negative number of lessons (${item.lessons}).`,
      );
    if (item.kind === "assessment" && item.assessment === null)
      issues.push(`"${item.id}" is an assessment with no assessment details.`);
    for (const p of item.prerequisites)
      if (!seen.has(p))
        issues.push(
          `"${item.id}" needs "${p}" first, and there is no such item.`,
        );
  }
  return issues;
}
