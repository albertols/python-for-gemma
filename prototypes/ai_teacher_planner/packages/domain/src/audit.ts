import type { CalendarDay, TeachingBlock, WeekLabel } from "./calendar.ts";
import { type IsoDate, mondayOf, weekdayOf } from "./dates.ts";
import {
  bySlotOrder,
  type Disruption,
  disruptionHitsSlot,
  type Slot,
} from "./slots.ts";
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
/** How many lessons one reason cost each group. A lesson with two reasons counts under each. */
export interface LostByReason {
  reason: string;
  perGroup: Record<GroupId, number>;
}
export interface SlotAudit {
  rows: AuditRow[];
  lost: Slot[];
  daysOff: DayOff[];
  /** Largest total first, then by reason. */
  lostByReason: LostByReason[];
  /** The date of each group's last open lesson; null when it has none. */
  lastLesson: Record<GroupId, IsoDate | null>;
}

/** Shown for a cancelled lesson that carries no reason. */
export const NO_REASON = "No reason recorded";

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
  /** Everything that cancels or covers lessons, so a day off can leave out a group already lost to another cause. */
  disruptions?: readonly Disruption[];
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

  const byReason = new Map<string, Record<GroupId, number>>();
  for (const s of lost) {
    const reasons = new Set(s.reasons.map((r) => r.text));
    if (reasons.size === 0) reasons.add(NO_REASON);
    for (const reason of reasons) {
      const counts = byReason.get(reason) ?? {};
      counts[s.groupId] = (counts[s.groupId] ?? 0) + 1;
      byReason.set(reason, counts);
    }
  }
  const total = (c: Record<GroupId, number>) =>
    Object.values(c).reduce((n, v) => n + v, 0);
  const lostByReason = [...byReason]
    .map(([reason, perGroup]): LostByReason => ({ reason, perGroup }))
    .sort(
      (a, b) =>
        total(b.perGroup) - total(a.perGroup) || compare(a.reason, b.reason),
    );

  const lastLesson: SlotAudit["lastLesson"] = {};
  for (const id of groupIds) lastLesson[id] = null;
  for (const s of input.slots) {
    const last = lastLesson[s.groupId];
    if (
      s.status === "open" &&
      (last === null || last === undefined || s.date > last)
    )
      lastLesson[s.groupId] = s.date;
  }

  // A "no lessons" decision on the day itself is why it is off, not another cause.
  const yearOf = new Map(input.groups.map((g) => [g.id, g.yearGroup]));
  const cancellers = (input.disruptions ?? []).filter(
    (d) => d.effect === "cancelled" && !d.id.startsWith("day:"),
  );
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
      .filter(
        (e) =>
          !cancellers.some((d) =>
            disruptionHitsSlot(
              d,
              { date: day.date, period: e.period, groupId: e.groupId },
              yearOf,
            ),
          ),
      )
      .map((e) => ({ groupId: e.groupId, period: e.period }))
      .sort((a, b) => a.period - b.period || compare(a.groupId, b.groupId));
    daysOff.push({ date: day.date, text: day.text, wouldHaveHad });
  }
  return { rows, lost, daysOff, lostByReason, lastLesson };
}
