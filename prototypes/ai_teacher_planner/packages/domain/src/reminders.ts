import type { YearGroup } from "./calendar.ts";
import { daysBetween, type IsoDate } from "./dates.ts";
import type { Group, GroupId } from "./timetable.ts";

export interface ReportWindow {
  id: string;
  yearGroup: YearGroup;
  programme: "A level" | "IB" | null;
  name: string;
  dataDeadline: IsoDate | null;
  hodReview: IsoDate | null;
  sentHome: IsoDate | null;
}
export interface ParentsEvening {
  id: string;
  yearGroup: YearGroup | null;
  label: string;
  date: IsoDate | null;
}
export interface Reminder {
  kind: "report-data-deadline" | "parents-evening";
  date: IsoDate;
  daysLeft: number;
  label: string;
  groupIds: GroupId[];
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Upcoming report data deadlines and parents' evenings for her groups, from today to the horizon. */
export function reminders(input: {
  today: IsoDate;
  windows: readonly ReportWindow[];
  evenings: readonly ParentsEvening[];
  groups: readonly Group[];
  horizonDays: number;
}): Reminder[] {
  const { today, groups, horizonDays } = input;
  const out: Reminder[] = [];

  const add = (
    kind: Reminder["kind"],
    date: IsoDate | null,
    label: string,
    groupIds: GroupId[],
  ) => {
    if (date === null || groupIds.length === 0) return;
    const daysLeft = daysBetween(today, date);
    if (daysLeft < 0 || daysLeft > horizonDays) return;
    out.push({
      kind,
      date,
      daysLeft,
      label,
      groupIds: [...groupIds].sort(byCode),
    });
  };

  for (const w of input.windows)
    add(
      "report-data-deadline",
      w.dataDeadline,
      `Year ${w.yearGroup} ${w.name}: data deadline`,
      groups
        .filter(
          (g) =>
            g.yearGroup === w.yearGroup &&
            (w.programme === null || w.programme === g.programme),
        )
        .map((g) => g.id),
    );

  for (const e of input.evenings) {
    if (e.yearGroup === null) continue;
    add(
      "parents-evening",
      e.date,
      `Year ${e.yearGroup} ${e.label}`,
      groups.filter((g) => g.yearGroup === e.yearGroup).map((g) => g.id),
    );
  }

  return out.sort(
    (a, b) =>
      byCode(a.date, b.date) ||
      byCode(a.label, b.label) ||
      byCode(a.groupIds.join(","), b.groupIds.join(",")),
  );
}
