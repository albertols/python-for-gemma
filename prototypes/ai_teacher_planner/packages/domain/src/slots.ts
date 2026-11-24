import type { CalendarDay, WeekLabel, YearGroup } from "./calendar.ts";
import { type IsoDate, weekdayOf } from "./dates.ts";
import {
  type Group,
  type GroupId,
  type Period,
  type TimetableEntry,
  type TimetableVersion,
  versionOn,
} from "./timetable.ts";

export type SlotKey = string;
export type SlotStatus = "open" | "cancelled" | "cover";
export interface SlotReason {
  disruptionId: string;
  text: string;
  source: "calendar" | "teacher";
}
export interface Slot {
  key: SlotKey;
  groupId: GroupId;
  date: IsoDate;
  period: Period;
  weekLabel: WeekLabel;
  room: string | null;
  status: SlotStatus;
  reasons: SlotReason[];
  doubleWith: SlotKey | null;
}
export type DisruptionScope =
  | { kind: "school" }
  | { kind: "year"; yearGroup: YearGroup }
  | { kind: "group"; groupId: GroupId }
  | { kind: "teacher" };
export interface Disruption {
  id: string;
  scope: DisruptionScope;
  from: IsoDate;
  to: IsoDate;
  periods: Period[] | null;
  effect: "cancelled" | "cover";
  reason: string;
  source: "calendar" | "teacher";
}

export function slotKey(
  groupId: GroupId,
  date: IsoDate,
  period: Period,
): SlotKey {
  return `${groupId}|${date}|${period}`;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Date, then period, then group id. */
export function bySlotOrder(a: Slot, b: Slot): number {
  return (
    compare(a.date, b.date) ||
    a.period - b.period ||
    compare(a.groupId, b.groupId)
  );
}

/** Orders entries so that a repeated cell always resolves the same way. */
const byEntry = (a: TimetableEntry, b: TimetableEntry) =>
  compare(a.groupId, b.groupId) ||
  a.period - b.period ||
  compare(a.room ?? "", b.room ?? "");

const PARTNER: Record<Period, Period> = { 1: 2, 2: 1, 3: 4, 4: 3, 5: 6, 6: 5 };

function applies(
  d: Disruption,
  date: IsoDate,
  period: Period,
  groupId: GroupId,
  yearOf: ReadonlyMap<GroupId, YearGroup>,
): boolean {
  if (date < d.from || date > d.to) return false;
  if (d.periods !== null && !d.periods.includes(period)) return false;
  switch (d.scope.kind) {
    case "school":
    case "teacher":
      return true;
    case "year":
      return yearOf.get(groupId) === d.scope.yearGroup;
    case "group":
      return d.scope.groupId === groupId;
  }
}

/** Whether a disruption takes this slot. The one rule behind the board, the previews and the counts. */
export function disruptionHitsSlot(
  d: Disruption,
  slot: Pick<Slot, "date" | "period" | "groupId">,
  yearOf: ReadonlyMap<GroupId, YearGroup>,
): boolean {
  return applies(d, slot.date, slot.period, slot.groupId, yearOf);
}

const byReason = (a: Disruption, b: Disruption) =>
  compare(a.id, b.id) ||
  compare(a.reason, b.reason) ||
  compare(a.source, b.source) ||
  compare(a.effect, b.effect);

/**
 * One reason per cause. Calendar events with the same words (study leave kept
 * on two dates) show once; two of her own cancellations always show both.
 */
function reasonsOf(hits: readonly Disruption[]): SlotReason[] {
  const seen = new Set<string>();
  const out: SlotReason[] = [];
  for (const d of hits) {
    if (d.source === "calendar") {
      if (seen.has(d.reason)) continue;
      seen.add(d.reason);
    }
    out.push({ disruptionId: d.id, text: d.reason, source: d.source });
  }
  return out;
}

export function buildSlots(input: {
  days: readonly CalendarDay[];
  timetables: readonly TimetableVersion[];
  groups: readonly Group[];
  disruptions: readonly Disruption[];
}): Slot[] {
  const yearOf = new Map(input.groups.map((g) => [g.id, g.yearGroup]));
  const disruptions = [...input.disruptions].sort(byReason);
  const slots = new Map<SlotKey, Slot>();
  for (const day of input.days) {
    if (!day.pupilDay || day.weekLabel === null) continue;
    const version = versionOn(input.timetables, day.date);
    if (!version) continue;
    const weekday = weekdayOf(day.date);
    const entries = version.entries
      .filter((e) => e.week === day.weekLabel && e.weekday === weekday)
      .sort(byEntry);
    for (const e of entries) {
      const key = slotKey(e.groupId, day.date, e.period);
      if (slots.has(key)) continue;
      const hits = disruptions.filter((d) =>
        applies(d, day.date, e.period, e.groupId, yearOf),
      );
      slots.set(key, {
        key,
        groupId: e.groupId,
        date: day.date,
        period: e.period,
        weekLabel: day.weekLabel,
        room: e.room,
        status: hits.some((d) => d.effect === "cancelled")
          ? "cancelled"
          : hits.some((d) => d.effect === "cover")
            ? "cover"
            : "open",
        reasons: reasonsOf(hits),
        doubleWith: null,
      });
    }
  }
  for (const s of slots.values()) {
    const partner = slotKey(s.groupId, s.date, PARTNER[s.period]);
    s.doubleWith = slots.has(partner) ? partner : null;
  }
  return [...slots.values()].sort(bySlotOrder);
}
