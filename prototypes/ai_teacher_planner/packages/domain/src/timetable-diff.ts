import type { WeekLabel } from "./calendar.ts";
import type { Weekday } from "./dates.ts";
import type { Period, TimetableVersion } from "./timetable.ts";

export interface TimetableCellChange {
  week: WeekLabel;
  weekday: Weekday;
  period: Period;
  /** What the current grid holds in this cell, or null when it is empty. */
  from: string | null;
  /** What the suggested grid holds, or null when it would be empty. */
  to: string | null;
}

type Grid = Pick<TimetableVersion, "entries" | "duties">;

/** The key of one cell in `timetableCellTexts`. */
export const cellKeyOf = (c: {
  week: WeekLabel;
  weekday: Weekday;
  period: Period;
}) => `${c.week}|${c.weekday}|${c.period}`;

/** What each non-empty cell says, in her words: "13 3 (305)" for a lesson, "Duty: Gate" for a duty. */
export function timetableCellTexts(grid: Grid): Map<string, string> {
  const cells = new Map<string, string[]>();
  const add = (
    c: { week: WeekLabel; weekday: Weekday; period: Period },
    text: string,
  ) => {
    const key = cellKeyOf(c);
    cells.set(key, [...(cells.get(key) ?? []), text]);
  };
  for (const e of grid.entries)
    add(e, e.room ? `${e.groupId} (${e.room})` : e.groupId);
  for (const d of grid.duties) add(d, `Duty: ${d.label}`);
  return new Map([...cells].map(([k, v]) => [k, [...v].sort().join(" + ")]));
}

/** The cells in which the two grids differ, ordered by week, day and period. Equal cells are left out. */
export function diffTimetables(
  current: TimetableVersion,
  suggested: Grid,
): TimetableCellChange[] {
  const before = timetableCellTexts(current);
  const after = timetableCellTexts(suggested);
  const changes: TimetableCellChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(key) ?? null;
    const to = after.get(key) ?? null;
    if (from === to) continue;
    const [week, weekday, period] = key.split("|");
    changes.push({
      week: week as WeekLabel,
      weekday: Number(weekday) as Weekday,
      period: Number(period) as Period,
      from,
      to,
    });
  }
  return changes.sort(
    (a, b) =>
      a.week.localeCompare(b.week) ||
      a.weekday - b.weekday ||
      a.period - b.period,
  );
}
