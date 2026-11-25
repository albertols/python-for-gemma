import type { LessonLogEntry } from "@planner/domain";
import { fullDay } from "../../lib/dates.ts";
import { STATE_LABEL } from "../../lib/plan-words.ts";

/** One lesson waiting for her answer (a row of GET /api/checkin). */
export interface WaitingLesson {
  courseId: string;
  groupId: string;
  lessonId: string;
  slotKey: string;
  date: string;
  title: string;
}
export interface WaitingWeek {
  /** The Monday. */
  weekOf: string;
  lessons: WaitingLesson[];
}

/** More weeks than this are not all shown at once: she works through the oldest. */
export const MAX_WEEKS = 4;

export const NOTHING_TO_CONFIRM =
  "Nothing to confirm: every past lesson has an answer.";

/** What she can say instead of "as planned". */
export const OTHER_OUTCOMES: readonly {
  value: Exclude<LessonLogEntry["outcome"], "taught">;
  label: string;
}[] = [
  { value: "cover", label: STATE_LABEL.cover },
  { value: "skipped", label: STATE_LABEL.skipped },
  { value: "homework", label: STATE_LABEL.homework },
];

/** The oldest weeks, and how many are left out (the weeks arrive oldest first). */
export function weeksToShow(weeks: readonly WaitingWeek[]): {
  shown: WaitingWeek[];
  hidden: number;
} {
  return {
    shown: weeks.slice(0, MAX_WEEKS),
    hidden: Math.max(0, weeks.length - MAX_WEEKS),
  };
}

export const moreWeeksSentence = (n: number): string =>
  n === 1 ? "and 1 more week" : `and ${n} more weeks`;

export const weekHeading = (monday: string): string =>
  `Week of ${fullDay(monday)}`;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One row per group, in group order, its lessons by date. */
export function groupsOf(
  lessons: readonly WaitingLesson[],
): { groupId: string; lessons: WaitingLesson[] }[] {
  const ids = [...new Set(lessons.map((l) => l.groupId))].sort(cmp);
  return ids.map((groupId) => ({
    groupId,
    lessons: lessons
      .filter((l) => l.groupId === groupId)
      .sort((a, b) => cmp(a.slotKey, b.slotKey) || cmp(a.lessonId, b.lessonId)),
  }));
}

export const confirmSentence = (groupId: string, monday: string): string =>
  `Confirmed ${groupId} for the week of ${fullDay(monday)}.`;

/** What was saved for one lesson, and a pointer to the notice when the plan is now out of date. */
export function answerSentence(
  lesson: WaitingLesson,
  outcome: LessonLogEntry["outcome"],
  outOfDate: boolean,
): string {
  const said = `${lesson.groupId}, ${lesson.title}, ${fullDay(lesson.date)}: saved as ${outcome === "homework" ? "set as homework" : outcome}.`;
  return outOfDate
    ? `${said} The plan is now out of date: the notice above offers See what changes.`
    : said;
}
