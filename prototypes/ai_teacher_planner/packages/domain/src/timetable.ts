import type { WeekLabel, YearGroup } from "./calendar.ts";
import type { IsoDate, Weekday } from "./dates.ts";

export type Period = 1 | 2 | 3 | 4 | 5 | 6;
export type GroupId = string;
export type CourseId = string;

export interface TimetableEntry {
  week: WeekLabel;
  weekday: Weekday;
  period: Period;
  groupId: GroupId;
  room: string | null;
}
export interface DutyEntry {
  week: WeekLabel;
  weekday: Weekday;
  period: Period;
  label: string;
}
export interface TimetableVersion {
  id: string;
  validFrom: IsoDate;
  entries: TimetableEntry[];
  duties: DutyEntry[];
}
export interface Group {
  id: GroupId;
  yearGroup: YearGroup;
  programme: "IGCSE" | "IB" | "A level";
  courseId: CourseId;
  track: "core" | "hl";
  colour: string;
}

/** Each lesson is 55 minutes. */
export const PERIOD_TIMES: Record<Period, { start: string; end: string }> = {
  1: { start: "08:45", end: "09:40" },
  2: { start: "09:40", end: "10:35" },
  3: { start: "11:15", end: "12:10" },
  4: { start: "12:10", end: "13:05" },
  5: { start: "14:35", end: "15:30" },
  6: { start: "15:30", end: "16:25" },
};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The version in force on a date: the latest `validFrom` on or before it. */
export function versionOn(
  versions: readonly TimetableVersion[],
  date: IsoDate,
): TimetableVersion | undefined {
  return [...versions]
    .filter((v) => v.validFrom <= date)
    .sort((a, b) => compare(a.validFrom, b.validFrom) || compare(a.id, b.id))
    .at(-1);
}

const cellOf = (c: { week: WeekLabel; weekday: Weekday; period: Period }) =>
  `${c.week} day ${c.weekday} period ${c.period}`;

/** Problems with a timetable, as sentences. Empty means valid. Sorted. */
export function validateTimetable(
  v: TimetableVersion,
  groups: readonly Group[],
): string[] {
  const known = new Set(groups.map((g) => g.id));
  const problems: string[] = [];
  const occupants = new Map<string, string[]>();
  for (const e of v.entries) {
    if (!known.has(e.groupId))
      problems.push(`${cellOf(e)}: the group "${e.groupId}" does not exist.`);
    occupants.set(cellOf(e), [...(occupants.get(cellOf(e)) ?? []), e.groupId]);
  }
  for (const d of v.duties)
    occupants.set(cellOf(d), [
      ...(occupants.get(cellOf(d)) ?? []),
      `duty ${d.label}`,
    ]);
  for (const [cell, who] of occupants)
    if (who.length > 1)
      problems.push(
        `${cell}: ${[...who].sort(compare).join(" and ")} share one period.`,
      );
  return problems.sort(compare);
}

export function lessonsPerFortnight(
  v: TimetableVersion,
): Record<GroupId, { W1: number; W2: number; total: number }> {
  const result: Record<GroupId, { W1: number; W2: number; total: number }> = {};
  for (const e of v.entries) {
    const row = result[e.groupId] ?? { W1: 0, W2: 0, total: 0 };
    result[e.groupId] = row;
    row[e.week] += 1;
    row.total += 1;
  }
  return result;
}
