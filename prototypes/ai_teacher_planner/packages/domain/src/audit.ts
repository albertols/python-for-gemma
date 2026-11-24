import type { CalendarDay, TeachingBlock, WeekLabel } from "./calendar.ts";
import { type IsoDate, mondayOf, weekdayOf } from "./dates.ts";
import { bySlotOrder, type Slot } from "./slots.ts";
import {
  type Group,
  type GroupId,
  type Period,
  type TimetableVersion,
  versionOn,
} from "./timetable.ts";

export interface AuditRow {
  block: TeachingBlock;
  perGroup: Record<GroupId, { open: number; cancelled: number; cover: number }>;
}
export interface DayOff {
  date: IsoDate;
  text: string | null;
  wouldHaveHad: { groupId: GroupId; period: Period }[];
}
export interface SlotAudit {
  rows: AuditRow[];
  lost: Slot[];
  daysOff: DayOff[];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The one label the labelled days of a week agree on; null when none or mixed. */
function labelOfWeek(
  days: readonly CalendarDay[],
  monday: IsoDate,
): WeekLabel | null {
  const labels = new Set(
    days
      .filter((d) => mondayOf(d.date) === monday && d.weekLabel !== null)
      .map((d) => d.weekLabel),
  );
  const [only] = labels;
  return labels.size === 1 && only ? only : null;
}

export function auditSlots(input: {
  slots: readonly Slot[];
  days: readonly CalendarDay[];
  blocks: readonly TeachingBlock[];
  timetables: readonly TimetableVersion[];
  groups: readonly Group[];
}): SlotAudit {
  const blocks = [...input.blocks].sort(
    (a, b) => compare(a.from, b.from) || compare(a.id, b.id),
  );
  const groupIds = input.groups.map((g) => g.id).sort(compare);
  const rows = blocks.map((block): AuditRow => {
    const perGroup: AuditRow["perGroup"] = {};
    for (const id of groupIds)
      perGroup[id] = { open: 0, cancelled: 0, cover: 0 };
    for (const s of input.slots) {
      if (s.date < block.from || s.date > block.to) continue;
      const counts = perGroup[s.groupId];
      if (counts) counts[s.status] += 1;
    }
    return { block, perGroup };
  });

  const lost = input.slots
    .filter((s) => s.status === "cancelled")
    .sort(bySlotOrder);

  const daysOff: DayOff[] = [];
  // A day off counts when its week has a pupil day, so a holiday at the edge
  // of a block (the Monday after half term) is listed too.
  const pupilWeeks = new Set(
    input.days.filter((d) => d.pupilDay).map((d) => mondayOf(d.date)),
  );
  const offDays = [...input.days]
    .filter(
      (d) =>
        (d.kind === "unlabelled" || d.kind === "holiday") &&
        weekdayOf(d.date) < 6 &&
        pupilWeeks.has(mondayOf(d.date)),
    )
    .sort((a, b) => compare(a.date, b.date));
  for (const day of offDays) {
    // A holiday carries its own label; an unlabelled day takes its week's.
    const label =
      day.kind === "holiday"
        ? day.weekLabel
        : labelOfWeek(input.days, mondayOf(day.date));
    if (label === null) continue;
    const weekday = weekdayOf(day.date);
    const wouldHaveHad = (versionOn(input.timetables, day.date)?.entries ?? [])
      .filter((e) => e.week === label && e.weekday === weekday)
      .map((e) => ({ groupId: e.groupId, period: e.period }))
      .sort((a, b) => a.period - b.period || compare(a.groupId, b.groupId));
    daysOff.push({ date: day.date, text: day.text, wouldHaveHad });
  }
  return { rows, lost, daysOff };
}
