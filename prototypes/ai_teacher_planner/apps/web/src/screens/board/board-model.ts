import {
  addDays,
  type CalendarDay,
  type DayKind,
  type Fortnight,
  type IsoDate,
  type Period,
  type Slot,
  type TimetableVersion,
  versionOn,
  type Weekday,
  type WeekLabel,
} from "@planner/domain";

export interface BoardCell {
  period: Period;
  date: IsoDate;
  kind: "lesson" | "duty" | "empty" | "no-school";
  slot: Slot | null;
  /** The group of a lesson, or the label of a duty. */
  label: string | null;
  /** The first half of a double whose two periods are in the same state: it is drawn joined to the next period. */
  joinsNext: boolean;
  /** Unconfirmed calendar events that might cancel this lesson. */
  possible: string[];
  /** The other period of a double, even when the two are drawn apart because one is cancelled. */
  doublePartner: Period | null;
}
export interface BoardDay {
  date: IsoDate;
  dayKind: DayKind;
  /** Why a day is not a pupil day, or what the calendar says about it. */
  text: string | null;
  /** She changed this day's week label. */
  corrected: boolean;
  cells: BoardCell[];
}
export interface BoardWeek {
  monday: IsoDate | null;
  /** The distinct labels of the pupil days, in date order. */
  labels: WeekLabel[];
  days: BoardDay[];
  /** Its pupil days carry different labels (Monday Week 2, Wednesday Week 1). A holiday with another label does not count. */
  mixed: boolean;
}

const stateOf = (s: Slot) =>
  `${s.status}|${s.reasons.map((r) => r.text).join(";")}`;
const sameState = (a: Slot, b: Slot, possibleOf: PossibleOf) =>
  stateOf(a) === stateOf(b) &&
  possibleOf(a).join(";") === possibleOf(b).join(";");

/** The unconfirmed events that might cancel a lesson. */
export type PossibleOf = (slot: Slot) => string[];

const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];

function dayOf(
  date: IsoDate,
  weekday: Weekday,
  day: CalendarDay | undefined,
  slotsOnDate: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf,
): BoardDay {
  const dayKind: DayKind = day?.kind ?? "outside-term";
  const text = day?.text ?? null;
  const corrected = day?.labelSource === "teacher";
  if (!day?.pupilDay || day.weekLabel === null)
    return {
      date,
      dayKind,
      text,
      corrected,
      cells: PERIODS.map((period) => ({
        period,
        date,
        kind: "no-school",
        slot: null,
        label: null,
        joinsNext: false,
        doublePartner: null,
        possible: [],
      })),
    };
  const duties = versionOn(timetables, date)?.duties ?? [];
  return {
    date,
    dayKind,
    text,
    corrected,
    cells: PERIODS.map((period): BoardCell => {
      const slot = slotsOnDate.find((s) => s.period === period);
      if (slot) {
        const doublePartner = slot.doubleWith
          ? ((period % 2 === 1 ? period + 1 : period - 1) as Period)
          : null;
        const partner = slotsOnDate.find((s) => s.key === slot.doubleWith);
        return {
          period,
          date,
          kind: "lesson",
          slot,
          label: slot.groupId,
          // A double with one period cancelled is drawn as two cells, so the one that still runs does not look lost.
          joinsNext:
            partner !== undefined &&
            period % 2 === 1 &&
            sameState(slot, partner, possibleOf),
          doublePartner,
          possible: possibleOf(slot),
        };
      }
      const duty = duties.find(
        (d) =>
          d.week === day.weekLabel &&
          d.weekday === weekday &&
          d.period === period,
      );
      return {
        period,
        date,
        kind: duty ? "duty" : "empty",
        slot: null,
        label: duty?.label ?? null,
        joinsNext: false,
        doublePartner: null,
        possible: [],
      };
    }),
  };
}

function weekOf(
  monday: IsoDate | null,
  days: readonly CalendarDay[],
  slots: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf,
): BoardWeek | null {
  if (monday === null) return null;
  const boardDays = ([1, 2, 3, 4, 5] as const).map((weekday) => {
    const date = addDays(monday, weekday - 1);
    return dayOf(
      date,
      weekday,
      days.find((d) => d.date === date),
      slots.filter((s) => s.date === date),
      timetables,
      possibleOf,
    );
  });
  const labels: WeekLabel[] = [];
  for (const b of boardDays) {
    const day = days.find((d) => d.date === b.date);
    if (!day?.pupilDay || day.weekLabel === null) continue;
    if (!labels.includes(day.weekLabel)) labels.push(day.weekLabel);
  }
  return {
    monday,
    labels,
    days: boardDays,
    mixed: labels.length > 1,
  };
}

/**
 * Both weeks of a fortnight laid out like her timetable. Lessons come from
 * the slots; duties come from the timetable version in force on each date.
 */
export function boardFor(
  fortnight: Fortnight,
  days: readonly CalendarDay[],
  slots: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf = () => [],
): { w1: BoardWeek | null; w2: BoardWeek | null } {
  return {
    w1: weekOf(fortnight.w1, days, slots, timetables, possibleOf),
    w2: weekOf(fortnight.w2, days, slots, timetables, possibleOf),
  };
}

/** The fortnight holding the date, else the next one after it, else null. */
export function fortnightContaining(
  fortnights: readonly Fortnight[],
  date: IsoDate,
): Fortnight | null {
  const startOf = (f: Fortnight) => f.w1 ?? f.w2 ?? "";
  const endOf = (f: Fortnight) => addDays(f.w2 ?? f.w1 ?? "", 6);
  return (
    fortnights.find((f) => startOf(f) <= date && date <= endOf(f)) ??
    fortnights.find((f) => startOf(f) > date) ??
    null
  );
}
