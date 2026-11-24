import { type IsoDate, isIsoDate } from "./dates.ts";
import type { Group, GroupId } from "./timetable.ts";

/** An official exam her groups sit. Public data (the board's timetable), never student data. */
export interface ExternalExam {
  id: string;
  code: string;
  title: string;
  date: IsoDate;
  session: "morning" | "afternoon";
  durationMinutes: number;
  groupIds: GroupId[];
  /** The exam board's timetable it came from. */
  source: string | null;
}
/** What she fills in; the id is made by the API. */
export type ExamInput = Omit<ExternalExam, "id">;

export const MAX_EXAM_TITLE = 120;
export const MAX_EXAM_CODE = 20;
export const MAX_EXAM_SOURCE = 500;

/** Why an exam cannot be stored; empty when it can. */
export function examIssues(
  exam: ExamInput,
  groups: readonly Group[],
): string[] {
  const issues: string[] = [];
  const length = (text: string) => [...text].length;
  if (exam.code.trim() === "") issues.push("The code cannot be empty.");
  else if (length(exam.code) > MAX_EXAM_CODE)
    issues.push(`The code can be at most ${MAX_EXAM_CODE} characters.`);
  if (exam.title.trim() === "") issues.push("The title cannot be empty.");
  else if (length(exam.title) > MAX_EXAM_TITLE)
    issues.push(`The title can be at most ${MAX_EXAM_TITLE} characters.`);
  if (!isIsoDate(exam.date)) issues.push("The date is not a real date.");
  if (!Number.isInteger(exam.durationMinutes) || exam.durationMinutes < 1)
    issues.push("The length must be a whole number of minutes.");
  if (exam.groupIds.length === 0) issues.push("Choose at least one group.");
  if (
    exam.source !== null &&
    (!exam.source.startsWith("https://") ||
      length(exam.source) > MAX_EXAM_SOURCE)
  )
    issues.push("The source must be a secure web address (https://).");
  const known = new Set(groups.map((g) => g.id));
  for (const id of exam.groupIds)
    if (!known.has(id)) issues.push(`${id} is not one of your groups.`);
  return issues;
}
